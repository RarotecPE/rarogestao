import { sql } from "@/lib/db"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"

export async function GET(request: Request) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const paramTecnicoId = searchParams.get("tecnico_id")
    const userIsGestor = isGestor(user.nome, user.cargo)

    let filterTecnicoId: number | null = null
    if (!userIsGestor) {
      const tecRow = await sql`SELECT id FROM tecnicos_rarotec WHERE email = ${user.email} LIMIT 1`
      filterTecnicoId = tecRow.length > 0 ? Number(tecRow[0].id) : null
    } else if (paramTecnicoId) {
      filterTecnicoId = parseInt(paramTecnicoId)
    }

    const schedule = (!userIsGestor && filterTecnicoId)
      ? await sql`
          SELECT 
            a.id,
            a.titulo,
            a.data_inicio,
            a.status,
            a.local,
            t.nome as tecnico_nome,
            c.nome_fantasia as cliente_nome
          FROM agenda_trabalhista a
          LEFT JOIN tecnicos_rarotec t ON a.tecnico_rarotec_id = t.id
          LEFT JOIN clientes c ON a.cliente_id = c.id
          WHERE a.data_inicio >= CURRENT_DATE
            AND a.tecnico_rarotec_id = ${filterTecnicoId}
          ORDER BY a.data_inicio ASC
          LIMIT 5
        `
      : await sql`
          SELECT 
            a.id,
            a.titulo,
            a.data_inicio,
            a.status,
            a.local,
            t.nome as tecnico_nome,
            c.nome_fantasia as cliente_nome
          FROM agenda_trabalhista a
          LEFT JOIN tecnicos_rarotec t ON a.tecnico_rarotec_id = t.id
          LEFT JOIN clientes c ON a.cliente_id = c.id
          WHERE a.data_inicio >= CURRENT_DATE
          ORDER BY a.data_inicio ASC
          LIMIT 5
        `

    return NextResponse.json(schedule)
  } catch (error) {
    console.error("Erro ao buscar agenda:", error)
    return NextResponse.json([], { status: 500 })
  }
}
