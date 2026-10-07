import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"

// GET - Buscar módulos de um cliente
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
    
    const modulos = await sql`
      SELECT id, modulo, adicionado_por, adicionado_por_nome, created_at
      FROM clientes_modulos
      WHERE cliente_id = ${parseInt(id)}
      ORDER BY created_at DESC
    `
    
    return NextResponse.json(modulos)
  } catch (error) {
    console.error("Erro ao buscar módulos do cliente:", error)
    return NextResponse.json({ error: "Erro ao buscar módulos" }, { status: 500 })
  }
}

// POST - Adicionar módulos a um cliente
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    
    const { id } = await params
    const { modulos } = await request.json()
    
    if (!modulos || !Array.isArray(modulos)) {
      return NextResponse.json({ error: "Módulos inválidos" }, { status: 400 })
    }
    
    const clienteId = parseInt(id)
    const resultados = []
    
    for (const modulo of modulos) {
      try {
        const result = await sql`
          INSERT INTO clientes_modulos (cliente_id, modulo, adicionado_por, adicionado_por_nome)
          VALUES (${clienteId}, ${modulo}, ${session.id}, ${session.nome})
          ON CONFLICT (cliente_id, modulo) DO NOTHING
          RETURNING *
        `
        if (result.length > 0) {
          resultados.push(result[0])
        }
      } catch (e) {
        // Ignorar erros de duplicação
      }
    }
    
    return NextResponse.json({ success: true, adicionados: resultados.length })
  } catch (error) {
    console.error("Erro ao adicionar módulos:", error)
    return NextResponse.json({ error: "Erro ao adicionar módulos" }, { status: 500 })
  }
}

// DELETE - Remover módulo de um cliente
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    if (!isGestor(session.nome, session.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem remover módulos" }, { status: 403 })
    }
    
    const { id } = await params
    const { modulo } = await request.json()
    
    if (!modulo) {
      return NextResponse.json({ error: "Módulo não informado" }, { status: 400 })
    }
    
    await sql`
      DELETE FROM clientes_modulos
      WHERE cliente_id = ${parseInt(id)} AND modulo = ${modulo}
    `
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao remover módulo:", error)
    return NextResponse.json({ error: "Erro ao remover módulo" }, { status: 500 })
  }
}
