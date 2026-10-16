import { NextRequest, NextResponse } from "next/server"
import { getSession, resolveTecnicoRarotecId } from "@/lib/auth"
import { sql } from "@/lib/db"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"
import {
  garantirExecucoesChecklist,
  normalizarCompetencia,
  podeAcessarExecucao,
  recalcularStatusExecucao,
} from "@/lib/responsabilidades"

const STATUS_VALIDOS = new Set(["pendente", "atendido", "nao_atendido", "nao_se_aplica", "pendencia_externa"])

function numeroOuNull(value: string | null): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

// Converte "YYYY-MM" (ou "YYYY-MM-DD") na competência normalizada (1º dia do mês).
function competenciaDeYYYYMM(value: string): string {
  const [ano, mes] = value.split("-").map(Number)
  return normalizarCompetencia(ano, mes)
}

export async function GET(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const hoje = new Date()
  const inicioParam = request.nextUrl.searchParams.get("inicio")
  const fimParam = request.nextUrl.searchParams.get("fim")
  let compInicio: string
  let compFim: string
  try {
    if (inicioParam && fimParam) {
      // Modo período: intervalo de competências (inclusive).
      compInicio = competenciaDeYYYYMM(inicioParam)
      compFim = competenciaDeYYYYMM(fimParam)
      if (compInicio > compFim) [compInicio, compFim] = [compFim, compInicio]
    } else {
      const ano = Number(request.nextUrl.searchParams.get("ano") || hoje.getUTCFullYear())
      const mes = Number(request.nextUrl.searchParams.get("mes") || hoje.getUTCMonth() + 1)
      compInicio = normalizarCompetencia(ano, mes)
      compFim = compInicio
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competência inválida" }, { status: 400 })
  }

  const gestor = isGestor(user.nome, user.cargo)
  const tecnicoLogadoId = await resolveTecnicoRarotecId(user)
  const tecnicoFiltro = gestor
    ? numeroOuNull(request.nextUrl.searchParams.get("tecnico_id"))
    : tecnicoLogadoId
  if (!gestor && !tecnicoFiltro) return NextResponse.json({ data: [], gestor: false })

  const competenciaAtual = normalizarCompetencia(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1)
  // Garante as execuções do mês corrente quando ele estiver dentro do intervalo pedido.
  if (competenciaAtual >= compInicio && competenciaAtual <= compFim) {
    await garantirExecucoesChecklist(competenciaAtual, tecnicoFiltro)
  }

  const clienteId = numeroOuNull(request.nextUrl.searchParams.get("cliente_id"))
  const modulo = request.nextUrl.searchParams.get("modulo")?.trim() || null
  const status = request.nextUrl.searchParams.get("status")?.trim() || null

  const execucoes = await sql`
    SELECT
      e.id,
      e.responsabilidade_id,
      TO_CHAR(e.competencia, 'YYYY-MM-DD') AS competencia,
      e.tecnico_rarotec_id,
      t.nome AS tecnico_nome,
      r.cliente_id,
      COALESCE(c.nome_fantasia, c.razao_social) AS cliente_nome,
      c.cidade AS cliente_cidade,
      c.estado AS cliente_estado,
      r.modulo,
      r.orgao_id,
      o.nome AS orgao_nome,
      CASE WHEN r.orgao_id IS NULL THEN 'principal' ELSE 'excecao' END AS tipo_atribuicao,
      e.status,
      e.observacao_geral,
      e.finalizado_at,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', i.id,
            'modelo_item_id', i.modelo_item_id,
            'titulo', i.titulo,
            'descricao', i.descricao,
            'modulo', i.modulo,
            'ordem', i.ordem,
            'obrigatorio', i.obrigatorio,
            'exige_observacao_negativa', i.exige_observacao_negativa,
            'status', i.status,
            'observacao', i.observacao,
            'respondido_em', i.respondido_em
          ) ORDER BY i.ordem, i.id
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::json
      ) AS itens
    FROM checklist_execucoes e
    JOIN responsaveis_modulos r ON r.id = e.responsabilidade_id
    JOIN clientes c ON c.id = r.cliente_id
    JOIN tecnicos_rarotec t ON t.id = e.tecnico_rarotec_id
    LEFT JOIN orgaos_cliente o ON o.id = r.orgao_id
    LEFT JOIN checklist_execucao_itens i ON i.execucao_id = e.id
    WHERE e.competencia BETWEEN ${compInicio}::date AND ${compFim}::date
      AND r.ativo = true
      AND r.nao_aplicavel = false
      AND (${gestor}::boolean OR e.tecnico_rarotec_id = ${tecnicoLogadoId})
      AND (${tecnicoFiltro}::integer IS NULL OR e.tecnico_rarotec_id = ${tecnicoFiltro})
      AND (${clienteId}::integer IS NULL OR r.cliente_id = ${clienteId})
      AND (${modulo}::text IS NULL OR LOWER(r.modulo) = LOWER(${modulo}))
      AND (${status}::text IS NULL OR e.status = ${status})
    GROUP BY e.id, t.nome, r.id, c.id, o.id
    ORDER BY e.competencia, COALESCE(c.nome_fantasia, c.razao_social), r.modulo, o.nome
  `

  return NextResponse.json({ data: execucoes, gestor, competencia: compInicio, inicio: compInicio, fim: compFim })
}

export async function PUT(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await request.json()
  const execucaoId = Number(body.execucao_id)
  const itens = Array.isArray(body.itens) ? body.itens : []
  if (!Number.isInteger(execucaoId) || !itens.length) {
    return NextResponse.json({ error: "Checklist inválido" }, { status: 400 })
  }

  const gestor = isGestor(user.nome, user.cargo)
  const tecnicoId = await resolveTecnicoRarotecId(user)
  if (!(await podeAcessarExecucao(execucaoId, tecnicoId, gestor))) {
    return NextResponse.json({ error: "Você não pode alterar este checklist" }, { status: 403 })
  }

  const ids = itens.map((item: { id?: unknown }) => Number(item.id)).filter(Number.isInteger)
  const regras = await sql`
    SELECT id, titulo, status, observacao, exige_observacao_negativa
    FROM checklist_execucao_itens
    WHERE execucao_id = ${execucaoId} AND id = ANY(${ids})
  `
  const regrasPorId = new Map(regras.map((regra) => [Number(regra.id), regra]))

  for (const item of itens) {
    const id = Number(item.id)
    const status = String(item.status || "")
    const observacao = String(item.observacao || "").trim() || null
    const regra = regrasPorId.get(id)
    if (!regra || !STATUS_VALIDOS.has(status)) {
      return NextResponse.json({ error: "Existe um item inválido no checklist" }, { status: 400 })
    }
    if (status === "nao_atendido" && regra.exige_observacao_negativa && !observacao) {
      return NextResponse.json(
        { error: "Informe uma observação para os itens marcados como não atendidos" },
        { status: 400 },
      )
    }
    if (status === "pendencia_externa" && !observacao) {
      return NextResponse.json(
        { error: "Informe uma observação descrevendo a pendência externa" },
        { status: 400 },
      )
    }
  }

  const execRows = await sql`
    SELECT
      e.id,
      TO_CHAR(e.competencia, 'YYYY-MM-DD') AS competencia,
      e.status,
      e.observacao_geral,
      e.tecnico_rarotec_id,
      r.cliente_id,
      t.nome AS tecnico_nome,
      COALESCE(c.nome_fantasia, c.razao_social) AS cliente_nome,
      r.modulo
    FROM checklist_execucoes e
    LEFT JOIN responsaveis_modulos r ON r.id = e.responsabilidade_id
    LEFT JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN tecnicos_rarotec t ON t.id = e.tecnico_rarotec_id
    WHERE e.id = ${execucaoId}
  `
  const execInfo = execRows[0]

  const diffBefore: Record<string, unknown> = {
    observacao_geral: execInfo?.observacao_geral || null,
  }
  const diffAfter: Record<string, unknown> = {
    observacao_geral: String(body.observacao_geral || "").trim() || null,
  }

  for (const item of itens) {
    const id = Number(item.id)
    const status = String(item.status || "")
    const observacao = String(item.observacao || "").trim() || null
    const prev = regrasPorId.get(id)
    const key = String(prev?.titulo || `Item #${id}`)
    diffBefore[key] = prev?.observacao ? `${prev.status} (${prev.observacao})` : prev?.status
    diffAfter[key] = observacao ? `${status} (${observacao})` : status

    await sql`
      UPDATE checklist_execucao_itens
      SET
        status = ${status},
        observacao = ${observacao},
        respondido_em = CASE WHEN ${status} = 'pendente' THEN NULL ELSE NOW() END,
        updated_by = ${user.id},
        updated_at = NOW()
      WHERE id = ${id} AND execucao_id = ${execucaoId}
    `
  }

  await sql`
    UPDATE checklist_execucoes
    SET observacao_geral = ${String(body.observacao_geral || "").trim() || null}, updated_at = NOW()
    WHERE id = ${execucaoId}
  `
  await recalcularStatusExecucao(execucaoId)

  const counts = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'atendido')::int AS atendidos,
      COUNT(*) FILTER (WHERE status = 'nao_atendido')::int AS nao_atendidos,
      COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendentes,
      COUNT(*) FILTER (WHERE status = 'nao_se_aplica')::int AS nao_se_aplica,
      COUNT(*) FILTER (WHERE status = 'pendencia_externa')::int AS pendencia_externa
    FROM checklist_execucao_itens
    WHERE execucao_id = ${execucaoId}
  `
  const c = counts[0] || {}

  auditClient.log({
    category: "checklists",
    action: "checklist.executed",
    severity: "INFO",
    actor: {
      type: "user",
      userId: String(user.id),
      name: user.nome,
      email: user.email,
      role: user.cargo,
    },
    targets: [
      {
        type: "checklist",
        id: String(execucaoId),
        label: `Checklist ${execInfo?.modulo || "Geral"} - ${execInfo?.cliente_nome || "Cliente"} (${execInfo?.competencia || ""})`,
      },
    ],
    context: getRequestContext(request),
    diff: {
      before: diffBefore,
      after: diffAfter,
    },
    details: {
      execucao_id: execucaoId,
      competencia: execInfo?.competencia,
      cliente_id: execInfo?.cliente_id,
      cliente_nome: execInfo?.cliente_nome,
      modulo: execInfo?.modulo,
      tecnico_id: execInfo?.tecnico_rarotec_id,
      tecnico_nome: execInfo?.tecnico_nome,
      total_itens: c.total,
      atendidos: c.atendidos,
      nao_atendidos: c.nao_atendidos,
      pendentes: c.pendentes,
      nao_se_aplica: c.nao_se_aplica,
      pendencia_externa: c.pendencia_externa,
      observacao_geral: body.observacao_geral || null,
    },
  })

  return NextResponse.json({ success: true })
}
