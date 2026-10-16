import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { auditClient, getRequestContext } from "@/lib/audit"

// Habilita ou desabilita o "relatorio unico" (esporadico) para um conjunto de eventos da agenda.
// body: { eventoIds: number[], acao: "set" | "clear", grupoId?: string }
export async function PATCH(request: NextRequest) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  try {
    const { eventoIds, acao, grupoId } = await request.json()

    if (!Array.isArray(eventoIds) || eventoIds.length === 0) {
      return NextResponse.json({ error: "Nenhum evento informado" }, { status: 400 })
    }

    const ids = eventoIds.map((id: any) => Number(id)).filter((n) => Number.isFinite(n))
    if (ids.length === 0) {
      return NextResponse.json({ error: "IDs invalidos" }, { status: 400 })
    }

    const finalGrupoId = acao === "clear" ? null : (grupoId || `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)

    const prevEvents = await sql`
      SELECT e.id, e.titulo, e.relatorio_grupo_id, e.tecnico_rarotec_id, e.cliente_id,
             t.nome AS tecnico_nome,
             COALESCE(c.nome_fantasia, c.razao_social) AS cliente_nome
      FROM agenda_trabalhista e
      LEFT JOIN tecnicos_rarotec t ON t.id = e.tecnico_rarotec_id
      LEFT JOIN clientes c ON c.id = e.cliente_id
      WHERE e.id = ANY(${ids})
      ORDER BY e.id ASC
    `

    if (acao === "clear") {
      await sql`
        UPDATE agenda_trabalhista
        SET relatorio_grupo_id = NULL
        WHERE id = ANY(${ids})
      `
    } else {
      await sql`
        UPDATE agenda_trabalhista
        SET relatorio_grupo_id = ${finalGrupoId}
        WHERE id = ANY(${ids})
      `
    }

    const diffBefore: Record<string, unknown> = {}
    const diffAfter: Record<string, unknown> = {}
    for (const ev of prevEvents) {
      const evKey = `${ev.titulo || `Evento #${ev.id}`}${ev.tecnico_nome ? ` (${ev.tecnico_nome})` : ""}`
      diffBefore[evKey] = ev.relatorio_grupo_id || null
      diffAfter[evKey] = finalGrupoId
    }

    auditClient.log({
      category: "schedule",
      action: "schedule.report_group_updated",
      severity: "INFO",
      actor: {
        type: "user",
        userId: String(user.id),
        name: user.nome,
        email: user.email,
        role: user.cargo,
      },
      targets: prevEvents.length > 0
        ? prevEvents.map((ev: any) => ({
            type: "schedule",
            id: String(ev.id),
            label: `${ev.titulo || `Evento #${ev.id}`}${ev.tecnico_nome ? ` - ${ev.tecnico_nome}` : ""}${ev.cliente_nome ? ` (${ev.cliente_nome})` : ""}`,
          }))
        : ids.map((eid: number) => ({
            type: "schedule",
            id: String(eid),
            label: `Evento #${eid}`,
          })),
      context: getRequestContext(request),
      diff: {
        before: diffBefore,
        after: diffAfter,
      },
      details: {
        acao,
        grupo_id: finalGrupoId,
        eventos_ids: ids,
        eventos: prevEvents.map((ev: any) => ({
          id: ev.id,
          titulo: ev.titulo,
          tecnico_id: ev.tecnico_rarotec_id,
          tecnico_nome: ev.tecnico_nome,
          cliente_id: ev.cliente_id,
          cliente_nome: ev.cliente_nome,
        })),
        total_eventos: ids.length,
      },
    })

    return NextResponse.json({ success: true, grupoId: finalGrupoId })
  } catch (error) {
    console.error("Erro ao atualizar relatorio unico:", error)
    return NextResponse.json({ error: "Erro ao atualizar relatorio unico" }, { status: 500 })
  }
}
