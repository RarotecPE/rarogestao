import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const clientes = await sql`
      SELECT * FROM clientes 
      ORDER BY razao_social ASC
    `
    return NextResponse.json(clientes)
  } catch (error) {
    console.error("Erro ao buscar clientes:", error)
    return NextResponse.json({ error: "Erro ao buscar clientes" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const data = await request.json()
    
    const result = await sql`
      INSERT INTO clientes (
        razao_social, nome_fantasia, cnpj, inscricao_estadual,
        endereco, cidade, estado, cep, telefone, email, website,
        logo_url, observacoes, ativo
      ) VALUES (
        ${data.razao_social}, ${data.nome_fantasia || null}, ${data.cnpj || null},
        ${data.inscricao_estadual || null}, ${data.endereco || null}, ${data.cidade || null},
        ${data.estado || null}, ${data.cep || null}, ${data.telefone || null},
        ${data.email || null}, ${data.website || null}, ${data.logo_url || null},
        ${data.observacoes || null}, ${data.ativo !== false}
      )
      RETURNING *
    `
    
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Erro ao criar cliente:", error)
    return NextResponse.json({ error: "Erro ao criar cliente" }, { status: 500 })
  }
}
