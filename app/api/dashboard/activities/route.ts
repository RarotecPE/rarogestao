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

    const activities = (!userIsGestor && filterTecnicoId)
      ? await sql`
          SELECT 
            'relatorio' as tipo,
            r.id,
            c.nome_fantasia as cliente,
            r.municipio,
            r.data_visita as data,
            r.status,
            r.tipo_servico
          FROM relatorios_visitas r
          LEFT JOIN clientes c ON r.cliente_id = c.id
          WHERE r.tecnicos_rarotec_ids @> ${JSON.stringify([filterTecnicoId])}::jsonb
             OR r.tecnico_rarotec_id = ${filterTecnicoId}
          ORDER BY r.created_at DESC
          LIMIT 5
        `
      : await sql`
          SELECT 
            'relatorio' as tipo,
            r.id,
            c.nome_fantasia as cliente,
            r.municipio,
            r.data_visita as data,
            r.status,
            r.tipo_servico
          FROM relatorios_visitas r
          LEFT JOIN clientes c ON r.cliente_id = c.id
          ORDER BY r.created_at DESC
          LIMIT 5
        `

    return NextResponse.json(activities)
  } catch (error) {
    console.error("Erro ao buscar atividades:", error)
    return NextResponse.json([], { status: 500 })
  }
}
