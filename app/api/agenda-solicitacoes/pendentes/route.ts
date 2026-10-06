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
      return NextResponse.json([])
    }

    const solicitacoes = await sql`
      SELECT 
        s.id,
        s.agenda_evento_id,
        s.tecnico_solicitante_id,
        s.tipo_solicitacao,
        s.descricao,
        s.dados_alteracao,
        s.status,
        s.created_at,
        a.titulo as evento_titulo,
        a.data_inicio as evento_data,
        a.local as evento_local,
        a.tipo as evento_tipo,
        t.nome as tecnico_nome
      FROM agenda_solicitacoes s
      LEFT JOIN agenda_trabalhista a ON s.agenda_evento_id = a.id
      LEFT JOIN tecnicos_rarotec t ON s.tecnico_solicitante_id = t.id
      WHERE s.status = 'pendente'
      ORDER BY s.created_at DESC
      LIMIT 20
    `
    return NextResponse.json(solicitacoes)
  } catch (error) {
    console.error("Erro ao buscar solicitacoes pendentes:", error)
    return NextResponse.json([], { status: 500 })
  }
}
