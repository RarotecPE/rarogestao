import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"


export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { id } = await params
    const orgaoId = parseInt(id)

    const existingRows = await sql`
      SELECT o.*, c.nome_fantasia as cliente_nome, c.razao_social as cliente_razao 
      FROM orgaos_cliente o 
      LEFT JOIN clientes c ON o.cliente_id = c.id 
      WHERE o.id = ${orgaoId} 
      LIMIT 1
    `
    if (existingRows.length === 0) {
      return NextResponse.json({ error: "Órgão não encontrado" }, { status: 404 })
    }
    const beforeAgency = existingRows[0]
    const clientName = String(beforeAgency.cliente_nome || beforeAgency.cliente_razao || `Cliente #${beforeAgency.cliente_id}`)

    const data = await request.json()
    
    const result = await sql`
      UPDATE orgaos_cliente SET
        tipo = ${data.tipo},
        nome = ${data.nome},
        cnpj = ${data.cnpj || null},
        endereco = ${data.endereco || null},
        cidade = ${data.cidade || null},
        estado = ${data.estado || null},
        telefone = ${data.telefone || null},
        email = ${data.email || null}
      WHERE id = ${orgaoId}
      RETURNING *
    `
    
    if (result.length === 0) {
      return NextResponse.json({ error: "Órgão não encontrado" }, { status: 404 })
    }

    const updatedAgency = result[0]

    auditClient.log({
      category: "clients",
      action: "agency.updated",
      severity: "INFO",
      actor: {
        type: "user",
        userId: String(user.id),
        name: user.nome,
        email: user.email,
        role: user.cargo,
      },
      targets: [
        {
          type: "agency",
          id: String(orgaoId),
          label: `${updatedAgency.tipo}: ${updatedAgency.nome} (${clientName})`,
        },
        {
          type: "client",
          id: String(beforeAgency.cliente_id),
          label: clientName,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: beforeAgency,
        after: updatedAgency,
      },
      details: {
        cliente_id: beforeAgency.cliente_id,
        cliente_nome: clientName,
        tipo: updatedAgency.tipo,
        nome: updatedAgency.nome,
      },
    })
    
    return NextResponse.json(updatedAgency)
  } catch (error) {
    console.error("Erro ao atualizar órgão:", error)
    return NextResponse.json({ error: "Erro ao atualizar órgão" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem inativar órgãos" }, { status: 403 })
    }

    const { id } = await params
    const orgaoId = parseInt(id)

    const existingRows = await sql`
      SELECT o.*, c.nome_fantasia as cliente_nome, c.razao_social as cliente_razao 
      FROM orgaos_cliente o 
      LEFT JOIN clientes c ON o.cliente_id = c.id 
      WHERE o.id = ${orgaoId} 
      LIMIT 1
    `
    if (existingRows.length === 0) {
      return NextResponse.json({ error: "Órgão não encontrado" }, { status: 404 })
    }
    const beforeAgency = existingRows[0]
    const clientName = String(beforeAgency.cliente_nome || beforeAgency.cliente_razao || `Cliente #${beforeAgency.cliente_id}`)
    
    await sql`UPDATE orgaos_cliente SET ativo = false WHERE id = ${orgaoId}`

    auditClient.log({
      category: "clients",
      action: "agency.deleted",
      severity: "WARNING",
      actor: {
        type: "user",
        userId: String(user.id),
        name: user.nome,
        email: user.email,
        role: user.cargo,
      },
      targets: [
        {
          type: "agency",
          id: String(orgaoId),
          label: `${beforeAgency.tipo}: ${beforeAgency.nome} (${clientName})`,
        },
        {
          type: "client",
          id: String(beforeAgency.cliente_id),
          label: clientName,
        },
      ],
      context: getRequestContext(request),
      details: {
        cliente_id: beforeAgency.cliente_id,
        cliente_nome: clientName,
        tipo: beforeAgency.tipo,
        nome: beforeAgency.nome,
      },
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir órgão:", error)
    return NextResponse.json({ error: "Erro ao excluir órgão" }, { status: 500 })
  }
}
