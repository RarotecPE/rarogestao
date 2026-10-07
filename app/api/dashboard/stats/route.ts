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

    const [tecnicos, clientes, agendaHoje] = await Promise.all([
      // Técnicos ativos - só mostra para gestores
      userIsGestor 
        ? sql`SELECT COUNT(*) as count FROM tecnicos_rarotec WHERE ativo = true`
        : Promise.resolve([{ count: 0 }]),
      
      // Clientes ativos
      sql`SELECT COUNT(*) as count FROM clientes WHERE ativo = true`,
      
      // Agenda hoje - filtra por técnico se não for gestor
      (!userIsGestor && filterTecnicoId)
        ? sql`SELECT COUNT(*) as count FROM agenda_trabalhista WHERE DATE(data_inicio) = CURRENT_DATE AND tecnico_rarotec_id = ${filterTecnicoId}`
        : sql`SELECT COUNT(*) as count FROM agenda_trabalhista WHERE DATE(data_inicio) = CURRENT_DATE`,
    ])

    // As pendências de batimento (relatórios) agora vivem na Central de avisos,
    // que consome /api/dashboard/pendencias (mesma lógica da página de Batimento:
    // cobertura por município/dia + agrupamento semanal). Não são mais calculadas aqui.
    return NextResponse.json({
      tecnicos: Number(tecnicos[0]?.count || 0),
      clientes: Number(clientes[0]?.count || 0),
      agendaHoje: Number(agendaHoje[0]?.count || 0),
    })
  } catch (error) {
    console.error("Erro ao buscar estatísticas:", error)
    return NextResponse.json({ error: "Erro ao buscar estatísticas" }, { status: 500 })
  }
}
