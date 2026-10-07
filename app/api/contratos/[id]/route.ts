import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"

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
    
    return NextResponse.json(result[0])
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
    await sql`DELETE FROM contratos WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir contrato:", error)
    return NextResponse.json({ error: "Erro ao excluir contrato" }, { status: 500 })
  }
}
