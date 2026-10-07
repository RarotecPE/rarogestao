import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"


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
    
    return NextResponse.json(result[0])
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
    await sql`DELETE FROM tecnicos_clientes WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir técnico-cliente:", error)
    return NextResponse.json({ error: "Erro ao excluir técnico-cliente" }, { status: 500 })
  }
}
