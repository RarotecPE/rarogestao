import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const clienteId = searchParams.get("cliente_id")
    
    let contratos
    if (clienteId) {
      contratos = await sql`
        SELECT * FROM contratos 
        WHERE cliente_id = ${clienteId}
        ORDER BY data_inicio DESC
      `
    } else {
      contratos = await sql`
        SELECT c.*, cl.nome_fantasia as cliente_nome
        FROM contratos c
        LEFT JOIN clientes cl ON c.cliente_id = cl.id
        ORDER BY c.data_inicio DESC
      `
    }
    
    return NextResponse.json(contratos)
  } catch (error) {
    console.error("Erro ao buscar contratos:", error)
    return NextResponse.json({ error: "Erro ao buscar contratos" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem cadastrar contratos" }, { status: 403 })
    }

    const data = await request.json()
    
    const result = await sql`
      INSERT INTO contratos (
        cliente_id, orgao_id, numero_contrato, tipo, data_inicio, data_fim,
        valor_total, descricao, arquivo_url, status
      ) VALUES (
        ${data.cliente_id}, ${data.orgao_id || null}, ${data.numero_contrato}, ${data.tipo},
        ${data.data_inicio}, ${data.data_fim || null},
        ${data.valor_total || null}, ${data.descricao || null},
        ${data.arquivo_url || null}, ${data.status || "ativo"}
      )
      RETURNING *
    `
    
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Erro ao criar contrato:", error)
    return NextResponse.json({ error: "Erro ao criar contrato" }, { status: 500 })
  }
}
