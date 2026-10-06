import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Acesso restrito à gestão" }, { status: 403 })
    }

    const pesquisas = await sql`
      SELECT p.*, 
        c.nome_fantasia as cliente_nome,
        c.razao_social,
        r.data_visita,
        r.tipo_servico,
        t.nome as tecnico_nome
      FROM pesquisas_satisfacao p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN relatorios_visitas r ON p.relatorio_visita_id = r.id
      LEFT JOIN tecnicos_rarotec t ON r.tecnico_rarotec_id = t.id
      ORDER BY p.data_resposta DESC
    `
    
    return NextResponse.json(pesquisas)
  } catch (error) {
    console.error("Erro ao buscar pesquisas:", error)
    return NextResponse.json({ error: "Erro ao buscar pesquisas" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const { 
      relatorio_visita_id, 
      cliente_id,
      nota_atendimento, 
      nota_qualidade, 
      nota_tempo, 
      comentarios 
    } = body

    const result = await sql`
      INSERT INTO pesquisas_satisfacao (
        relatorio_visita_id, cliente_id, nota_atendimento, 
        nota_qualidade, nota_tempo, comentarios
      )
      VALUES (
        ${relatorio_visita_id || null}, ${cliente_id}, ${nota_atendimento}, 
        ${nota_qualidade}, ${nota_tempo}, ${comentarios || null}
      )
      RETURNING *
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Erro ao criar pesquisa:", error)
    return NextResponse.json({ error: "Erro ao criar pesquisa" }, { status: 500 })
  }
}
