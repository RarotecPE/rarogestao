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

    const { id } = await params
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
      WHERE id = ${parseInt(id)}
      RETURNING *
    `
    
    return NextResponse.json(result[0])
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
    
    await sql`UPDATE orgaos_cliente SET ativo = false WHERE id = ${parseInt(id)}`
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir órgão:", error)
    return NextResponse.json({ error: "Erro ao excluir órgão" }, { status: 500 })
  }
}
