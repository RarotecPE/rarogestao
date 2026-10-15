import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"
import { garantirExecucoesChecklist, normalizarCompetencia } from "@/lib/responsabilidades"

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get("authorization")
    const isCronAuthorized = !!(cronSecret && authHeader === `Bearer ${cronSecret}`)

    let user: Awaited<ReturnType<typeof getSession>> = null
    if (!isCronAuthorized) {
      user = await getSession()
      if (!user || !isGestor(user.nome, user.cargo)) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
      }
    }

    const hoje = new Date()
    const competencia = normalizarCompetencia(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1)
    await garantirExecucoesChecklist(competencia)

    const totais = await sql`
      SELECT
        COUNT(*)::integer AS checklists,
        COUNT(*) FILTER (WHERE status = 'pendente')::integer AS pendentes,
        COUNT(*) FILTER (WHERE status = 'em_andamento')::integer AS em_andamento,
        COUNT(*) FILTER (WHERE status = 'concluido')::integer AS concluidos
      FROM checklist_execucoes
      WHERE competencia = ${competencia}::date
    `

    auditClient.log({
      category: "checklists",
      action: "checklist.monthly_generated",
      severity: "INFO",
      actor: isCronAuthorized || !user
        ? { type: "system", systemName: "cron.checklist_mensal" }
        : {
            type: "user",
            userId: String(user.id),
            name: user.nome,
            email: user.email,
            role: user.cargo,
          },
      targets: [
        {
          type: "checklist_batch",
          id: competencia,
          label: `Checklists Competência ${competencia}`,
        },
      ],
      context: getRequestContext(request),
      details: {
        competencia,
        ...totais[0],
      },
    })

    return NextResponse.json({ executado: true, competencia, ...totais[0] })
  } catch (error) {
    console.error("Erro ao gerar checklists mensais:", error)
    return NextResponse.json({ error: "Erro ao gerar checklists mensais" }, { status: 500 })
  }
}
