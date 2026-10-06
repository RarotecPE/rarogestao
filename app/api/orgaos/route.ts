import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"


export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const clienteId = searchParams.get("cliente_id")
    
    if (clienteId) {
      const orgaos = await sql`
        SELECT * FROM orgaos_cliente 
        WHERE cliente_id = ${parseInt(clienteId)} AND ativo = true
        ORDER BY tipo, nome ASC
      `
      return NextResponse.json(orgaos)
    }
    
    const orgaos = await sql`
      SELECT o.*, c.nome_fantasia as cliente_nome
      FROM orgaos_cliente o
      LEFT JOIN clientes c ON o.cliente_id = c.id
      WHERE o.ativo = true
      ORDER BY c.nome_fantasia, o.tipo, o.nome ASC
    `
    return NextResponse.json(orgaos)
  } catch (error) {
    console.error("Erro ao buscar órgãos:", error)
    return NextResponse.json({ error: "Erro ao buscar órgãos" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const data = await request.json()
    
    const result = await sql`
      INSERT INTO orgaos_cliente (
        cliente_id, tipo, nome, cnpj, endereco, cidade, estado, telefone, email
      ) VALUES (
        ${data.cliente_id}, ${data.tipo}, ${data.nome}, ${data.cnpj || null},
        ${data.endereco || null}, ${data.cidade || null}, ${data.estado || null},
        ${data.telefone || null}, ${data.email || null}
      )
      RETURNING *
    `
    
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Erro ao criar órgão:", error)
    return NextResponse.json({ error: "Erro ao criar órgão" }, { status: 500 })
  }
}
