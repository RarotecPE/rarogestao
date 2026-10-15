import { NextRequest, NextResponse } from "next/server"
import { getSession, resolveTecnicoRarotecId } from "@/lib/auth"
import { sql } from "@/lib/db"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"
import { garantirExecucoesChecklist } from "@/lib/responsabilidades"

function numeroOuNull(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const gestor = isGestor(user.nome, user.cargo)
  const tecnicoLogadoId = gestor ? null : await resolveTecnicoRarotecId(user)
  if (!gestor && !tecnicoLogadoId) {
    return NextResponse.json({ data: [], gestor: false })
  }

  const params = request.nextUrl.searchParams
  const clienteId = numeroOuNull(params.get("cliente_id"))
  const tecnicoId = numeroOuNull(params.get("tecnico_id"))
  const modulo = params.get("modulo")?.trim() || null
  const tipo = params.get("tipo")?.trim() || null
  const busca = params.get("busca")?.trim() || null
  const municipio = params.get("municipio")?.trim() || null

  const rows = await sql`
    SELECT
      r.id,
      r.cliente_id,
      COALESCE(c.nome_fantasia, c.razao_social) AS cliente_nome,
      c.cidade AS cliente_cidade,
      c.estado AS cliente_estado,
      -- Consórcios intermunicipais (CODEAM, COMUPE, CONISA, CIMPAJEU...) não são
      -- vinculados a um município específico; identificados pela razão social.
      (c.razao_social IS NULL OR c.razao_social NOT ILIKE '%consorcio%' AND c.razao_social NOT ILIKE '%consórcio%') AS vinculado_municipio,
      r.modulo,
      r.orgao_id,
      o.nome AS orgao_nome,
      o.tipo AS orgao_tipo,
      r.tecnico_rarotec_id,
      t.nome AS tecnico_nome,
      t.email AS tecnico_email,
      r.observacoes,
      r.nao_aplicavel,
      CASE WHEN r.orgao_id IS NULL THEN 'principal' ELSE 'excecao' END AS tipo_atribuicao,
      CASE
        WHEN r.orgao_id IS NULL THEN (
          SELECT COUNT(*)::integer
          FROM orgaos_cliente oc
          WHERE oc.cliente_id = r.cliente_id
            AND oc.ativo = true
            AND NOT EXISTS (
              SELECT 1
              FROM responsaveis_modulos excecao
              WHERE excecao.cliente_id = r.cliente_id
                AND excecao.modulo = r.modulo
                AND excecao.orgao_id = oc.id
                AND excecao.ativo = true
            )
        )
        ELSE 0
      END AS orgaos_herdados,
      r.created_at,
      r.updated_at
    FROM responsaveis_modulos r
    JOIN clientes c ON c.id = r.cliente_id
    JOIN tecnicos_rarotec t ON t.id = r.tecnico_rarotec_id
    LEFT JOIN orgaos_cliente o ON o.id = r.orgao_id
    WHERE r.ativo = true
      AND (${gestor}::boolean OR r.tecnico_rarotec_id = ${tecnicoLogadoId})
      AND (${clienteId}::integer IS NULL OR r.cliente_id = ${clienteId})
      AND (${municipio}::text IS NULL OR c.cidade = ${municipio})
      AND (${tecnicoId}::integer IS NULL OR r.tecnico_rarotec_id = ${tecnicoId})
      AND (${modulo}::text IS NULL OR LOWER(r.modulo) = LOWER(${modulo}))
      AND (
        ${tipo}::text IS NULL
        OR (${tipo} = 'principal' AND r.orgao_id IS NULL)
        OR (${tipo} = 'excecao' AND r.orgao_id IS NOT NULL)
      )
      AND (
        ${busca}::text IS NULL
        OR COALESCE(c.nome_fantasia, c.razao_social) ILIKE '%' || ${busca} || '%'
        OR COALESCE(c.cidade, '') ILIKE '%' || ${busca} || '%'
        OR r.modulo ILIKE '%' || ${busca} || '%'
        OR t.nome ILIKE '%' || ${busca} || '%'
        OR COALESCE(o.nome, '') ILIKE '%' || ${busca} || '%'
      )
    ORDER BY
      COALESCE(c.nome_fantasia, c.razao_social),
      r.modulo,
      CASE WHEN r.orgao_id IS NULL THEN 0 ELSE 1 END,
      o.nome
  `

  const cobertura = gestor
    ? (await sql`
        SELECT
          COUNT(*)::integer AS total_modulos,
          COUNT(*) FILTER (WHERE r.id IS NOT NULL)::integer AS modulos_atribuidos,
          COUNT(*) FILTER (WHERE r.id IS NULL)::integer AS modulos_sem_responsavel
        FROM clientes_modulos cm
        JOIN clientes c ON c.id = cm.cliente_id AND c.ativo = true
        LEFT JOIN responsaveis_modulos r
          ON r.cliente_id = cm.cliente_id
          AND LOWER(r.modulo) = LOWER(cm.modulo)
          AND r.orgao_id IS NULL
          AND r.ativo = true
      `)[0]
    : null

  const importacao = gestor
    ? (await sql`
        SELECT
          -- Conta atribuições distintas geradas (registros de origem que apontam para o
          -- mesmo cliente+módulo+órgão são mesclados em uma única atribuição), batendo com o grid.
          COUNT(DISTINCT (cliente_id, modulo_destino, COALESCE(orgao_id, 0)))
            FILTER (WHERE status = 'importado')::integer AS importados,
          COUNT(*) FILTER (WHERE status = 'pendente')::integer AS pendentes,
          COUNT(*) FILTER (WHERE status = 'ignorado')::integer AS ignorados,
          COUNT(*) FILTER (WHERE status = 'nao_aplicavel')::integer AS nao_aplicavel
        FROM responsaveis_importacao
      `)[0]
    : null

  return NextResponse.json({ data: rows, gestor, cobertura, importacao })
}

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas a gestão pode alterar responsáveis" }, { status: 403 })
  }

  const body = await request.json()
  const clienteId = Number(body.cliente_id)
  const tecnicoId = Number(body.tecnico_rarotec_id)
  const orgaoId = body.orgao_id ? Number(body.orgao_id) : null
  const modulo = String(body.modulo || "").trim()
  const observacoes = String(body.observacoes || "").trim() || null

  if (
    !Number.isInteger(clienteId) || clienteId <= 0
    || !Number.isInteger(tecnicoId) || tecnicoId <= 0
    || (body.orgao_id != null && (!Number.isInteger(orgaoId) || Number(orgaoId) <= 0))
    || !modulo
  ) {
    return NextResponse.json({ error: "Cliente, módulo e responsável são obrigatórios" }, { status: 400 })
  }

  const [cliente, tecnico] = await Promise.all([
    sql`SELECT id, COALESCE(nome_fantasia, razao_social) AS nome FROM clientes WHERE id = ${clienteId} AND ativo = true LIMIT 1`,
    sql`SELECT id, nome FROM tecnicos_rarotec WHERE id = ${tecnicoId} AND ativo = true LIMIT 1`,
  ])
  if (!cliente.length || !tecnico.length) {
    return NextResponse.json({ error: "Cliente ou responsável inválido" }, { status: 400 })
  }
  const clienteNome = cliente[0]?.nome || "Cliente"
  const tecnicoNome = tecnico[0]?.nome || "Técnico"

  if (orgaoId) {
    const orgao = await sql`
      SELECT id FROM orgaos_cliente
      WHERE id = ${orgaoId} AND cliente_id = ${clienteId} AND ativo = true
      LIMIT 1
    `
    if (!orgao.length) {
      return NextResponse.json({ error: "O órgão informado não pertence ao cliente" }, { status: 400 })
    }
  }

  const moduloValido = orgaoId
    ? await sql`
        SELECT 1
        WHERE EXISTS (
          SELECT 1 FROM clientes_modulos
          WHERE cliente_id = ${clienteId} AND LOWER(modulo) = LOWER(${modulo})
        ) OR EXISTS (
          SELECT 1 FROM orgaos_modulos
          WHERE orgao_id = ${orgaoId} AND LOWER(modulo) = LOWER(${modulo})
        )
      `
    : await sql`
        SELECT 1 FROM clientes_modulos
        WHERE cliente_id = ${clienteId} AND LOWER(modulo) = LOWER(${modulo})
        LIMIT 1
      `
  if (!moduloValido.length) {
    return NextResponse.json({ error: "O módulo não está vinculado a este cliente" }, { status: 400 })
  }

  const existente = orgaoId
    ? await sql`
        SELECT *
        FROM responsaveis_modulos
        WHERE cliente_id = ${clienteId} AND LOWER(modulo) = LOWER(${modulo})
          AND orgao_id = ${orgaoId} AND ativo = true
        LIMIT 1
      `
    : await sql`
        SELECT *
        FROM responsaveis_modulos
        WHERE cliente_id = ${clienteId} AND LOWER(modulo) = LOWER(${modulo})
          AND orgao_id IS NULL AND ativo = true
        LIMIT 1
      `

  if (existente.length) {
    const atual = existente[0]
    const competenciaAtual = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}-01`
    await garantirExecucoesChecklist(competenciaAtual, Number(atual.tecnico_rarotec_id))

    const result = await sql`
      UPDATE responsaveis_modulos
      SET
        tecnico_rarotec_id = ${tecnicoId},
        observacoes = ${observacoes},
        updated_by = ${user.id},
        updated_at = NOW()
      WHERE id = ${atual.id}
      RETURNING *
    `

    await sql`
      UPDATE checklist_execucoes
      SET tecnico_rarotec_id = ${tecnicoId}, updated_at = NOW()
      WHERE responsabilidade_id = ${atual.id}
        AND competencia = ${competenciaAtual}::date
        AND status = 'pendente'
    `

    await sql`
      INSERT INTO responsaveis_modulos_historico (
        responsabilidade_id, cliente_id, modulo, orgao_id,
        tecnico_anterior_id, tecnico_novo_id, acao, observacoes, alterado_por
      ) VALUES (
        ${atual.id}, ${clienteId}, ${modulo}, ${orgaoId},
        ${atual.tecnico_rarotec_id}, ${tecnicoId}, 'alteracao', ${observacoes}, ${user.id}
      )
    `

    auditClient.log({
      category: "responsibilities",
      action: "responsibilities.updated",
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
          type: "responsibilities",
          id: String(atual.id),
          label: `${modulo} - ${clienteNome} -> ${tecnicoNome}`,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: atual,
        after: result[0],
      },
      details: {
        cliente_id: clienteId,
        cliente_nome: clienteNome,
        modulo,
        tecnico_id: tecnicoId,
        tecnico_nome: tecnicoNome,
        orgao_id: orgaoId,
      },
    })

    return NextResponse.json(result[0])
  }

  const result = await sql`
    INSERT INTO responsaveis_modulos (
      cliente_id, modulo, orgao_id, tecnico_rarotec_id,
      observacoes, created_by, updated_by
    ) VALUES (
      ${clienteId}, ${modulo}, ${orgaoId}, ${tecnicoId},
      ${observacoes}, ${user.id}, ${user.id}
    )
    RETURNING *
  `

  await sql`
    INSERT INTO responsaveis_modulos_historico (
      responsabilidade_id, cliente_id, modulo, orgao_id,
      tecnico_novo_id, acao, observacoes, alterado_por
    ) VALUES (
      ${result[0].id}, ${clienteId}, ${modulo}, ${orgaoId},
      ${tecnicoId}, 'criacao', ${observacoes}, ${user.id}
    )
  `

  auditClient.log({
    category: "responsibilities",
    action: "responsibilities.updated",
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
        type: "responsibilities",
        id: String(result[0].id),
        label: `${modulo} - ${clienteNome} -> ${tecnicoNome}`,
      },
    ],
    context: getRequestContext(request),
    details: {
      cliente_id: clienteId,
      cliente_nome: clienteNome,
      modulo,
      tecnico_id: tecnicoId,
      tecnico_nome: tecnicoNome,
      orgao_id: orgaoId,
    },
  })

  return NextResponse.json(result[0], { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas a gestão pode remover responsáveis" }, { status: 403 })
  }

  const id = numeroOuNull(request.nextUrl.searchParams.get("id"))
  if (!id) return NextResponse.json({ error: "Atribuição inválida" }, { status: 400 })

  const rows = await sql`
    SELECT r.*, COALESCE(c.nome_fantasia, c.razao_social) AS cliente_nome, t.nome AS tecnico_nome
    FROM responsaveis_modulos r
    LEFT JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN tecnicos_rarotec t ON t.id = r.tecnico_rarotec_id
    WHERE r.id = ${id} AND r.ativo = true LIMIT 1
  `
  if (!rows.length) return NextResponse.json({ error: "Atribuição não encontrada" }, { status: 404 })
  const atual = rows[0]

  await sql`
    UPDATE responsaveis_modulos
    SET ativo = false, updated_by = ${user.id}, updated_at = NOW()
    WHERE id = ${id}
  `
  await sql`
    INSERT INTO responsaveis_modulos_historico (
      responsabilidade_id, cliente_id, modulo, orgao_id,
      tecnico_anterior_id, acao, observacoes, alterado_por
    ) VALUES (
      ${id}, ${atual.cliente_id}, ${atual.modulo}, ${atual.orgao_id},
      ${atual.tecnico_rarotec_id}, 'exclusao', ${atual.observacoes}, ${user.id}
    )
  `

  auditClient.log({
    category: "responsibilities",
    action: "responsibilities.deleted",
    severity: "WARNING",
    actor: {
      type: "user",
      userId: String(user.id),
      name: user.nome,
      email: user.email,
      role: user.cargo,
    },
    targets: [
      {
        type: "responsibilities",
        id: String(id),
        label: `${atual.modulo} - ${atual.cliente_nome || "Cliente"} (${atual.tecnico_nome || "Técnico"})`,
      },
    ],
    context: getRequestContext(request),
    diff: {
      before: atual,
      after: { ...atual, ativo: false },
    },
    details: {
      cliente_id: atual.cliente_id,
      cliente_nome: atual.cliente_nome,
      modulo: atual.modulo,
      tecnico_nome: atual.tecnico_nome,
    },
  })

  return NextResponse.json({ success: true })
}

// Alterna o marcador "não se aplica" de uma atribuição, mantendo-a visível no mapa.
export async function PATCH(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas a gestão pode alterar responsáveis" }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const id = numeroOuNull(body?.id)
  const naoAplicavel = Boolean(body?.nao_aplicavel)
  if (!id) return NextResponse.json({ error: "Atribuição inválida" }, { status: 400 })

  const rows = await sql`
    SELECT r.*, COALESCE(c.nome_fantasia, c.razao_social) AS cliente_nome, t.nome AS tecnico_nome
    FROM responsaveis_modulos r
    LEFT JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN tecnicos_rarotec t ON t.id = r.tecnico_rarotec_id
    WHERE r.id = ${id} AND r.ativo = true LIMIT 1
  `
  if (!rows.length) return NextResponse.json({ error: "Atribuição não encontrada" }, { status: 404 })
  const atual = rows[0]

  await sql`
    UPDATE responsaveis_modulos
    SET nao_aplicavel = ${naoAplicavel}, updated_by = ${user.id}, updated_at = NOW()
    WHERE id = ${id}
  `
  await sql`
    INSERT INTO responsaveis_modulos_historico (
      responsabilidade_id, cliente_id, modulo, orgao_id,
      tecnico_anterior_id, tecnico_novo_id, acao, observacoes, alterado_por
    ) VALUES (
      ${id}, ${atual.cliente_id}, ${atual.modulo}, ${atual.orgao_id},
      ${atual.tecnico_rarotec_id}, ${atual.tecnico_rarotec_id}, 'alteracao',
      ${naoAplicavel ? "Marcado como não se aplica" : "Reativado (deixou de ser não se aplica)"}, ${user.id}
    )
  `

  auditClient.log({
    category: "responsibilities",
    action: "responsibilities.not_applicable_toggled",
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
        type: "responsibilities",
        id: String(id),
        label: `${atual.modulo} - ${atual.cliente_nome || "Cliente"}`,
      },
    ],
    context: getRequestContext(request),
    details: {
      id,
      cliente_id: atual.cliente_id,
      cliente_nome: atual.cliente_nome,
      modulo: atual.modulo,
      nao_aplicavel: naoAplicavel,
    },
  })

  return NextResponse.json({ success: true, nao_aplicavel: naoAplicavel })
}
