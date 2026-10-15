import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { id } = await params
    const tecnico = await sql`
      SELECT tc.*, c.nome_fantasia as cliente_nome
      FROM tecnicos_clientes tc
      LEFT JOIN clientes c ON tc.cliente_id = c.id
      WHERE tc.id = ${id}
    `
    
    if (tecnico.length === 0) {
      return NextResponse.json({ error: "Técnico-cliente não encontrado" }, { status: 404 })
    }
    
    return NextResponse.json(tecnico[0])
  } catch (error) {
    console.error("Erro ao buscar técnico-cliente:", error)
    return NextResponse.json({ error: "Erro ao buscar técnico-cliente" }, { status: 500 })
  }
}

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
    const data = await request.json()

    const existingRows = await sql`
      SELECT tc.*, c.nome_fantasia as cliente_nome
      FROM tecnicos_clientes tc
      LEFT JOIN clientes c ON tc.cliente_id = c.id
      WHERE tc.id = ${id}
    `
    if (existingRows.length === 0) {
      return NextResponse.json({ error: "Técnico-cliente não encontrado" }, { status: 404 })
    }
    const beforeTecnico = existingRows[0]
    
    const result = await sql`
      UPDATE tecnicos_clientes SET
        cliente_id = ${data.cliente_id},
        nome = ${data.nome},
        cpf = ${data.cpf || null},
        cargo = ${data.cargo || null},
        departamento = ${data.departamento || null},
        telefone = ${data.telefone || null},
        celular = ${data.celular || null},
        email = ${data.email || null},
        foto_url = ${data.foto_url || null},
        ativo = ${data.ativo !== false},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    
    if (result.length === 0) {
      return NextResponse.json({ error: "Técnico-cliente não encontrado" }, { status: 404 })
    }

    const updatedTecnico = result[0]
    const clientName = beforeTecnico.cliente_nome || "Cliente"

    auditClient.log({
      category: "technicians",
      action: "client_technician.updated",
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
          type: "client_technician",
          id: String(id),
          label: `${updatedTecnico.nome} (${clientName})`,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: beforeTecnico,
        after: updatedTecnico,
      },
      details: {
        nome: updatedTecnico.nome,
        cliente_id: updatedTecnico.cliente_id,
        cliente_nome: clientName,
        cargo: updatedTecnico.cargo,
        email: updatedTecnico.email,
        ativo: updatedTecnico.ativo,
      },
    })
    
    return NextResponse.json(updatedTecnico)
  } catch (error) {
    console.error("Erro ao atualizar técnico-cliente:", error)
    return NextResponse.json({ error: "Erro ao atualizar técnico-cliente" }, { status: 500 })
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
      return NextResponse.json({ error: "Apenas gestores podem excluir técnicos de clientes" }, { status: 403 })
    }

    const { id } = await params
    const existingRows = await sql`
      SELECT tc.*, c.nome_fantasia as cliente_nome
      FROM tecnicos_clientes tc
      LEFT JOIN clientes c ON tc.cliente_id = c.id
      WHERE tc.id = ${id}
    `
    if (existingRows.length === 0) {
      return NextResponse.json({ error: "Técnico-cliente não encontrado" }, { status: 404 })
    }
    const beforeTecnico = existingRows[0]
    const clientName = beforeTecnico.cliente_nome || "Cliente"

    await sql`DELETE FROM tecnicos_clientes WHERE id = ${id}`

    auditClient.log({
      category: "technicians",
      action: "client_technician.deleted",
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
          type: "client_technician",
          id: String(id),
          label: `${beforeTecnico.nome} (${clientName})`,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: beforeTecnico,
        after: {},
      },
      details: {
        nome: beforeTecnico.nome,
        cliente_id: beforeTecnico.cliente_id,
        cliente_nome: clientName,
        cargo: beforeTecnico.cargo,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir técnico-cliente:", error)
    return NextResponse.json({ error: "Erro ao excluir técnico-cliente" }, { status: 500 })
  }
}
