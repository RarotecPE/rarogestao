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
      targets: ids.map((eid: number) => ({
        type: "schedule",
        id: String(eid),
        label: `Evento #${eid}`,
      })),
      context: getRequestContext(request),
      details: {
        acao,
        grupo_id: finalGrupoId,
        eventos_ids: ids,
        total_eventos: ids.length,
      },
    })

    return NextResponse.json({ success: true, grupoId: finalGrupoId })
  } catch (error) {
    console.error("Erro ao atualizar relatorio unico:", error)
    return NextResponse.json({ error: "Erro ao atualizar relatorio unico" }, { status: 500 })
  }
}
