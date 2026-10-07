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
    const contratoId = searchParams.get("contrato_id")
    
    if (!contratoId) {
      return NextResponse.json({ error: "contrato_id é obrigatório" }, { status: 400 })
    }
    
    const aditivos = await sql`
      SELECT * FROM aditivos_contrato 
      WHERE contrato_id = ${contratoId}
      ORDER BY data_aditivo DESC
    `
    
    return NextResponse.json(aditivos)
  } catch (error) {
    console.error("Erro ao buscar aditivos:", error)
    return NextResponse.json({ error: "Erro ao buscar aditivos" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem cadastrar aditivos" }, { status: 403 })
    }

    const data = await request.json()
    
    const result = await sql`
      INSERT INTO aditivos_contrato (
        contrato_id, numero_aditivo, data_aditivo, descricao, valor_adicional, arquivo_url
      ) VALUES (
        ${data.contrato_id}, ${data.numero_aditivo}, ${data.data_aditivo},
        ${data.descricao || null}, ${data.valor_adicional || null}, ${data.arquivo_url || null}
      )
      RETURNING *
    `
    
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Erro ao criar aditivo:", error)
    return NextResponse.json({ error: "Erro ao criar aditivo" }, { status: 500 })
  }
}
