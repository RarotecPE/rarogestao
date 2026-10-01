import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { sql } from "@/lib/db"
import { isGestor } from "@/lib/permissions"
import { garantirExecucoesChecklist } from "@/lib/responsabilidades"

function normalizarTexto(valor: string): string {
  return (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

// Lista os itens pendentes da fila de importação com sugestões automáticas para
// que o gestor concilie manualmente (escolher cliente, módulo e responsável).
export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas a gestão pode conciliar responsáveis" }, { status: 403 })
  }

  // Lista completa de clientes (ordenada por município) para o seletor pesquisável:
  // a sugestão automática pode falhar (ex.: "Câmara de Ipojuca" vs "Câmara Ipojuca"),
  // então o gestor sempre precisa poder escolher qualquer cliente manualmente.
  const todosClientes = await sql`
    SELECT id, nome_fantasia, razao_social, cidade
    FROM clientes
    WHERE ativo = true
    ORDER BY cidade NULLS LAST, nome_fantasia
  `

  const pendentes = await sql`
    SELECT
      ri.id,
      ri.municipio,
      ri.modulo_origem,
      ri.responsavel_origem,
      ri.email_origem,
      ri.cliente_id,
      ri.orgao_id,
      ri.modulo_destino,
      ri.tecnico_rarotec_id,
      ri.observacao,
      ri.status,
      c.nome_fantasia AS cliente_nome
    FROM responsaveis_importacao ri
    LEFT JOIN clientes c ON c.id = ri.cliente_id
    WHERE ri.status IN ('pendente', 'ignorado')
    ORDER BY ri.status, ri.municipio, ri.modulo_origem, ri.id
  `

  // Para cada pendente, monta sugestões de cliente (por cidade), módulos do cliente
  // sugerido e técnico candidato (por e-mail e por primeiro nome).
  const itens = await Promise.all(
    pendentes.map(async (p: Record<string, unknown>) => {
      const municipio = String(p.municipio ?? "")
      const moduloOrigem = String(p.modulo_origem ?? "")
      const responsavel = String(p.responsavel_origem ?? "")
      const email = p.email_origem ? String(p.email_origem) : null
      const primeiroNome = responsavel.trim().split(/\s+/)[0] ?? ""

      const munNorm = normalizarTexto(municipio)
      const nomeNorm = normalizarTexto(primeiroNome)

      // Clientes candidatos: mesma cidade OU nome fantasia/razão contendo o rótulo.
      const clientesCandidatos = await sql`
        SELECT id, nome_fantasia, razao_social, cidade
        FROM clientes
        WHERE ativo = true
          AND (
            LOWER(TRANSLATE(COALESCE(cidade, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')) = ${munNorm}
            OR LOWER(TRANSLATE(COALESCE(nome_fantasia, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')) LIKE ${'%' + munNorm + '%'}
          )
        ORDER BY
          CASE WHEN LOWER(TRANSLATE(COALESCE(nome_fantasia, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')) LIKE 'prefeitura %' THEN 0 ELSE 1 END,
          nome_fantasia
        LIMIT 30
      `

      // Módulos disponíveis no cliente já sugerido (se houver).
      const modulosCliente = p.cliente_id
        ? await sql`
            SELECT DISTINCT modulo
            FROM clientes_modulos
            WHERE cliente_id = ${p.cliente_id as number}
            ORDER BY modulo
          `
        : []

      // Técnicos candidatos: e-mail exato tem prioridade, senão primeiro nome.
      const tecnicoPorEmail = email
        ? await sql`SELECT id, nome, email FROM tecnicos_rarotec WHERE ativo = true AND LOWER(email) = LOWER(${email}) LIMIT 5`
        : []
      const tecnicoPorNome = primeiroNome
        ? await sql`
            SELECT id, nome, email FROM tecnicos_rarotec
            WHERE ativo = true AND LOWER(TRANSLATE(COALESCE(nome, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')) LIKE ${nomeNorm + '%'}
            ORDER BY nome LIMIT 8
          `
        : []

      return {
        id: p.id,
        municipio,
        modulo_origem: moduloOrigem,
        responsavel_origem: responsavel,
        email_origem: email,
        observacao: p.observacao ?? null,
        status: p.status ?? "pendente",
        sugestao: {
          cliente_id: p.cliente_id ?? null,
          cliente_nome: p.cliente_nome ?? null,
          orgao_id: p.orgao_id ?? null,
          modulo: p.modulo_destino ?? null,
          tecnico_rarotec_id: p.tecnico_rarotec_id ?? null,
        },
        opcoes: {
          clientes: clientesCandidatos,
          modulos: (modulosCliente as { modulo: string }[]).map((m) => m.modulo),
          tecnicos: tecnicoPorEmail.length ? tecnicoPorEmail : tecnicoPorNome,
        },
      }
    }),
  )

  return NextResponse.json({ data: itens, todos_clientes: todosClientes })
}

// Resolve (cria o vínculo e marca 'importado') ou ignora um item da fila.
export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas a gestão pode conciliar responsáveis" }, { status: 403 })
  }

  const body = await request.json()
  const importacaoId = Number(body.importacao_id)
  const acao = String(body.acao || "resolver")

  if (!Number.isInteger(importacaoId) || importacaoId <= 0) {
    return NextResponse.json({ error: "Item de importação inválido" }, { status: 400 })
  }

  const fila = await sql`
    SELECT id, status FROM responsaveis_importacao WHERE id = ${importacaoId} LIMIT 1
  `
  if (!fila.length) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 })
  // Permite tratar tanto pendentes quanto ignorados; só bloqueia o que já foi importado.
  if (fila[0].status === "importado") {
    return NextResponse.json({ error: "Este item já foi conciliado" }, { status: 409 })
  }

  // Ação: ignorar (descarta o item sem criar vínculo).
  if (acao === "ignorar") {
    await sql`
      UPDATE responsaveis_importacao
      SET status = 'ignorado', observacao = 'Ignorado manualmente pela conciliação', updated_at = NOW()
      WHERE id = ${importacaoId}
    `
    return NextResponse.json({ success: true, status: "ignorado" })
  }

  // Ação: não se aplica — o registro é resolvido definitivamente porque não há
  // responsável possível para ele, então deixa de ser tratado como pendência.
  if (acao === "nao_aplicavel") {
    await sql`
      UPDATE responsaveis_importacao
      SET status = 'nao_aplicavel', observacao = 'Marcado como não se aplica pela conciliação', updated_at = NOW()
      WHERE id = ${importacaoId}
    `
    return NextResponse.json({ success: true, status: "nao_aplicavel" })
  }

  // Ação: resolver — valida a escolha do gestor (mesma regra da rota principal).
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
    sql`SELECT id FROM clientes WHERE id = ${clienteId} AND ativo = true LIMIT 1`,
    sql`SELECT id FROM tecnicos_rarotec WHERE id = ${tecnicoId} AND ativo = true LIMIT 1`,
  ])
  if (!cliente.length || !tecnico.length) {
    return NextResponse.json({ error: "Cliente ou responsável inválido" }, { status: 400 })
  }

  if (orgaoId) {
    const orgao = await sql`
      SELECT id FROM orgaos_cliente WHERE id = ${orgaoId} AND cliente_id = ${clienteId} AND ativo = true LIMIT 1
    `
    if (!orgao.length) {
      return NextResponse.json({ error: "O órgão informado não pertence ao cliente" }, { status: 400 })
    }
  }

  const moduloValido = orgaoId
    ? await sql`
        SELECT 1
        WHERE EXISTS (
          SELECT 1 FROM clientes_modulos WHERE cliente_id = ${clienteId} AND LOWER(modulo) = LOWER(${modulo})
        ) OR EXISTS (
          SELECT 1 FROM orgaos_modulos WHERE orgao_id = ${orgaoId} AND LOWER(modulo) = LOWER(${modulo})
        )
      `
    : await sql`
        SELECT 1 FROM clientes_modulos WHERE cliente_id = ${clienteId} AND LOWER(modulo) = LOWER(${modulo}) LIMIT 1
      `
  // Se o módulo ainda não está cadastrado no cliente, o gestor está afirmando durante
  // a conciliação que ele existe — então o vinculamos ao cliente (não bloqueamos).
  if (!moduloValido.length) {
    await sql`
      INSERT INTO clientes_modulos (cliente_id, modulo)
      SELECT ${clienteId}, ${modulo}
      WHERE NOT EXISTS (
        SELECT 1 FROM clientes_modulos WHERE cliente_id = ${clienteId} AND LOWER(modulo) = LOWER(${modulo})
      )
    `
  }

  // Cria ou atualiza o vínculo (mesma semântica da rota principal).
  const existente = orgaoId
    ? await sql`
        SELECT id, tecnico_rarotec_id FROM responsaveis_modulos
        WHERE cliente_id = ${clienteId} AND LOWER(modulo) = LOWER(${modulo}) AND orgao_id = ${orgaoId} AND ativo = true LIMIT 1
      `
    : await sql`
        SELECT id, tecnico_rarotec_id FROM responsaveis_modulos
        WHERE cliente_id = ${clienteId} AND LOWER(modulo) = LOWER(${modulo}) AND orgao_id IS NULL AND ativo = true LIMIT 1
      `

  let responsabilidadeId: number
  if (existente.length) {
    const atual = existente[0]
    const result = await sql`
      UPDATE responsaveis_modulos
      SET tecnico_rarotec_id = ${tecnicoId}, observacoes = ${observacoes}, updated_by = ${user.id}, updated_at = NOW()
      WHERE id = ${atual.id}
      RETURNING id
    `
    responsabilidadeId = Number(result[0].id)
    await sql`
      INSERT INTO responsaveis_modulos_historico (
        responsabilidade_id, cliente_id, modulo, orgao_id,
        tecnico_anterior_id, tecnico_novo_id, acao, observacoes, alterado_por
      ) VALUES (
        ${atual.id}, ${clienteId}, ${modulo}, ${orgaoId},
        ${atual.tecnico_rarotec_id}, ${tecnicoId}, 'alteracao', ${observacoes}, ${user.id}
      )
    `
  } else {
    const result = await sql`
      INSERT INTO responsaveis_modulos (
        cliente_id, modulo, orgao_id, tecnico_rarotec_id, observacoes, created_by, updated_by
      ) VALUES (
        ${clienteId}, ${modulo}, ${orgaoId}, ${tecnicoId}, ${observacoes}, ${user.id}, ${user.id}
      )
      RETURNING id
    `
    responsabilidadeId = Number(result[0].id)
    await sql`
      INSERT INTO responsaveis_modulos_historico (
        responsabilidade_id, cliente_id, modulo, orgao_id,
        tecnico_novo_id, acao, observacoes, alterado_por
      ) VALUES (
        ${responsabilidadeId}, ${clienteId}, ${modulo}, ${orgaoId},
        ${tecnicoId}, 'criacao', ${observacoes}, ${user.id}
      )
    `
  }

  // Garante as execuções de checklist da competência atual para o responsável.
  const competenciaAtual = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}-01`
  await garantirExecucoesChecklist(competenciaAtual, tecnicoId)

  // Marca o item da fila como importado, registrando a escolha feita.
  await sql`
    UPDATE responsaveis_importacao
    SET status = 'importado', cliente_id = ${clienteId}, orgao_id = ${orgaoId},
        modulo_destino = ${modulo}, tecnico_rarotec_id = ${tecnicoId},
        observacao = 'Conciliado manualmente', updated_at = NOW()
    WHERE id = ${importacaoId}
  `

  return NextResponse.json({ success: true, status: "importado", responsabilidade_id: responsabilidadeId })
}
