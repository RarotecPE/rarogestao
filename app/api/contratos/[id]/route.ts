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
    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem editar contratos" }, { status: 403 })
    }

    const { id } = await params
    const existingRows = await sql`
      SELECT c.*, cl.nome_fantasia as cliente_nome, cl.razao_social as cliente_razao 
      FROM contratos c 
      LEFT JOIN clientes cl ON c.cliente_id = cl.id 
      WHERE c.id = ${id} 
      LIMIT 1
    `
    if (existingRows.length === 0) {
      return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 })
    }
    const beforeContract = existingRows[0]
    const clientName = String(beforeContract.cliente_nome || beforeContract.cliente_razao || `Cliente #${beforeContract.cliente_id}`)

    const data = await request.json()
    
    const result = await sql`
      UPDATE contratos SET
        orgao_id = ${data.orgao_id || null},
        numero_contrato = ${data.numero_contrato},
        tipo = ${data.tipo},
        data_inicio = ${data.data_inicio},
        data_fim = ${data.data_fim || null},
        valor_total = ${data.valor_total || null},
        descricao = ${data.descricao || null},
        arquivo_url = ${data.arquivo_url || null},
        status = ${data.status || "ativo"},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    
    if (result.length === 0) {
      return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 })
    }

    const updatedContract = result[0]
    const isRescinded = updatedContract.status === 'rescindido' && beforeContract.status !== 'rescindido'

    auditClient.log({
      category: "contracts",
      action: isRescinded ? "contract.rescinded" : "contract.updated",
      severity: isRescinded ? "WARNING" : "INFO",
      actor: {
        type: "user",
        userId: String(user.id),
        name: user.nome,
        email: user.email,
        role: user.cargo,
      },
      targets: [
        {
          type: "contract",
          id: String(id),
          label: `Contrato nº ${updatedContract.numero_contrato} (${clientName})`,
        },
        {
          type: "client",
          id: String(beforeContract.cliente_id),
          label: clientName,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: beforeContract,
        after: updatedContract,
      },
      details: {
        numero_contrato: updatedContract.numero_contrato,
        cliente_id: beforeContract.cliente_id,
        cliente_nome: clientName,
        status_anterior: beforeContract.status,
        status_novo: updatedContract.status,
      },
    })
    
    return NextResponse.json(updatedContract)
  } catch (error) {
    console.error("Erro ao atualizar contrato:", error)
    return NextResponse.json({ error: "Erro ao atualizar contrato" }, { status: 500 })
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
      return NextResponse.json({ error: "Apenas gestores podem excluir contratos" }, { status: 403 })
    }

    const { id } = await params
    const existingRows = await sql`
      SELECT c.*, cl.nome_fantasia as cliente_nome, cl.razao_social as cliente_razao 
      FROM contratos c 
      LEFT JOIN clientes cl ON c.cliente_id = cl.id 
      WHERE c.id = ${id} 
      LIMIT 1
    `
    if (existingRows.length === 0) {
      return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 })
    }
    const beforeContract = existingRows[0]
    const clientName = String(beforeContract.cliente_nome || beforeContract.cliente_razao || `Cliente #${beforeContract.cliente_id}`)

    await sql`DELETE FROM contratos WHERE id = ${id}`

    auditClient.log({
      category: "contracts",
      action: "contract.deleted",
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
          type: "contract",
          id: String(id),
          label: `Contrato nº ${beforeContract.numero_contrato} (${clientName})`,
        },
        {
          type: "client",
          id: String(beforeContract.cliente_id),
          label: clientName,
        },
      ],
      context: getRequestContext(request),
      details: {
        numero_contrato: beforeContract.numero_contrato,
        cliente_id: beforeContract.cliente_id,
        cliente_nome: clientName,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir contrato:", error)
    return NextResponse.json({ error: "Erro ao excluir contrato" }, { status: 500 })
  }
}
