import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor, canApuracaoMensal } from "@/lib/permissions"
import {
  calcularConsumoAuto,
  aplicarConsumoAuto,
  limparConsumoAuto,
  calcularConsumoAutoModulos,
  aplicarConsumoAutoModulos,
  limparConsumoAutoModulos,
  particionarRelatorios,
} from "@/lib/apuracao"

// Injeta em cada modelo o consumo AUTOMATICO por item, derivado dos relatorios emitidos.
// Mantem o valor sempre atualizado (excluir/adicionar apuracao ajusta sozinho).
async function enriquecerConsumoAuto(modelos: any[]): Promise<any[]> {
  const ids = modelos.map((m) => m.id).filter(Boolean)
  if (ids.length === 0) return modelos
  const relatorios = await sql`
    SELECT modelo_id, status, competencia, created_at, itens, itens_servico, valor_total
    FROM apuracao_relatorios
    WHERE modelo_id = ANY(${ids}) AND status = 'emitido'
  `
  // Agrupa relatorios por modelo_id
  const porModelo = new Map<number, any[]>()
  for (const r of relatorios as any[]) {
    const arr = porModelo.get(r.modelo_id) || []
    arr.push(r)
    porModelo.set(r.modelo_id, arr)
  }
  const parseJson = (v: any) =>
    Array.isArray(v)
      ? v
      : (() => {
          try {
            return JSON.parse(v || "[]")
          } catch {
            return []
          }
        })()
  const somaValor = (rels: any[]) => rels.reduce((s, r) => s + (Number(r.valor_total) || 0), 0)
  return modelos.map((m) => {
    const itens = parseJson(m.itens_servico)
    const modulos = parseJson(m.itens)
    // Corte do reinicio: por instante (reinicio_em, botao "Reiniciar agora") ou por
    // competencia (reinicio_competencia, aditivo). Apuracoes anteriores viram historico e
    // nao contam no consumo ativo. Sem corte valido, "anteriores" fica vazio e tudo e ativo.
    const { ativos, anteriores } = particionarRelatorios(porModelo.get(m.id) || [], {
      reinicioEm: m.reinicio_em,
      reinicioCompetencia: m.reinicio_competencia,
    })
    const mapa = calcularConsumoAuto(ativos)
    const mapaModulos = calcularConsumoAutoModulos(ativos)
    return {
      ...m,
      // Modo 'por_modulo': injeta o consumo automatico (meses emitidos) em cada modulo.
      itens: aplicarConsumoAutoModulos(modulos, mapaModulos),
      itens_servico: aplicarConsumoAuto(itens, mapa),
      // Consumo ATIVO dos modos 'global'/'por_modulo': Σ dos valores emitidos apos o corte.
      consumido_emitido: somaValor(ativos),
      // Modo 'global': cada emissao ativa = 1 mes consumido.
      emitidos_count: ativos.length,
      // Historico anterior ao corte (so quando ha reinicio efetivo com apuracoes antigas).
      historico:
        anteriores.length > 0
          ? {
              consumido_emitido: somaValor(anteriores),
              emitidos_count: anteriores.length,
              consumo_itens: calcularConsumoAuto(anteriores),
              consumo_modulos: calcularConsumoAutoModulos(anteriores),
            }
          : undefined,
    }
  })
}

// GET /api/apuracao/modelos?cliente_id=
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo) && !canApuracaoMensal(user.cargo, user.apuracao_mensal)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const clienteId = searchParams.get("cliente_id")
    const municipio = searchParams.get("municipio")

    let modelos = clienteId
      ? await sql`
          SELECT m.*, c.nome_fantasia AS cliente_nome, c.cidade AS cliente_cidade,
                 c.estado AS cliente_estado, c.cnpj AS cliente_cnpj
          FROM apuracao_modelos m
          LEFT JOIN clientes c ON c.id = m.cliente_id
          WHERE m.cliente_id = ${parseInt(clienteId)}
             OR m.cliente_ids @> ${JSON.stringify([parseInt(clienteId)])}::jsonb
          ORDER BY m.ativo DESC, m.nome ASC
        `
      : municipio
        ? await sql`
          SELECT m.*, c.nome_fantasia AS cliente_nome, c.cidade AS cliente_cidade,
                 c.estado AS cliente_estado, c.cnpj AS cliente_cnpj
          FROM apuracao_modelos m
          LEFT JOIN clientes c ON c.id = m.cliente_id
          WHERE m.municipio = ${municipio}
          ORDER BY m.ativo DESC, m.nome ASC
        `
        : await sql`
          SELECT m.*, c.nome_fantasia AS cliente_nome, c.cidade AS cliente_cidade,
                 c.estado AS cliente_estado, c.cnpj AS cliente_cnpj
          FROM apuracao_modelos m
          LEFT JOIN clientes c ON c.id = m.cliente_id
          ORDER BY m.ativo DESC, c.nome_fantasia ASC, m.nome ASC
        `

    const enriquecidos = await enriquecerConsumoAuto(modelos as any[])
    return NextResponse.json(enriquecidos)
  } catch (error) {
    console.error("Erro ao buscar modelos de apuracao:", error)
    return NextResponse.json({ error: "Erro ao buscar modelos" }, { status: 500 })
  }
}

// POST /api/apuracao/modelos
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo) && !canApuracaoMensal(user.cargo, user.apuracao_mensal)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const d = await request.json()
    // cliente_ids: prioriza o array; cai para [cliente_id] por compatibilidade
    const clienteIds: number[] =
      Array.isArray(d.cliente_ids) && d.cliente_ids.length > 0
        ? d.cliente_ids.map((x: any) => Number(x))
        : d.cliente_id
          ? [Number(d.cliente_id)]
          : []
    const clientePrincipal = clienteIds[0] || null
    if (!clientePrincipal || !d.nome) {
      return NextResponse.json(
        { error: "selecione ao menos um cliente e informe o nome" },
        { status: 400 },
      )
    }

    const result = await sql`
      INSERT INTO apuracao_modelos (
        cliente_id, cliente_ids, municipio, contrato_id, nome, sigla_orgao, numero_contrato_texto,
        destinatario_nome, destinatario_cargo, itens, itens_servico, modo_valor, valor_global,
        meses_contrato, valor_total_contrato, controle_consumo, valor_consumido_inicial,
        meses_consumidos_inicial, reinicio_competencia, reinicio_em,
        texto_padrao, observacoes_padrao, modalidade_remoto, modalidade_presencial,
        ultimo_numero, ativo, emissao_automatica
      ) VALUES (
        ${clientePrincipal}, ${JSON.stringify(clienteIds)}, ${d.municipio || null},
        ${d.contrato_id || null}, ${d.nome}, ${d.sigla_orgao || null},
        ${d.numero_contrato_texto || null}, ${d.destinatario_nome || null},
        ${d.destinatario_cargo || null}, ${JSON.stringify(limparConsumoAutoModulos(d.itens || []))},
        ${JSON.stringify(limparConsumoAuto(d.itens_servico || []))},
        ${d.modo_valor || "global"}, ${d.valor_global ?? null},
        ${d.meses_contrato ?? 12}, ${d.valor_total_contrato ?? null},
        ${d.controle_consumo ?? false}, ${d.valor_consumido_inicial ?? null},
        ${d.meses_consumidos_inicial ?? null}, ${d.reinicio_competencia || null},
        ${d.reinicio_em || null},
        ${d.texto_padrao || null}, ${d.observacoes_padrao || null},
        ${d.modalidade_remoto ?? true}, ${d.modalidade_presencial ?? false},
        ${d.ultimo_numero || 0}, ${d.ativo ?? true}, ${d.emissao_automatica ?? false}
      )
      RETURNING *
    `
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Erro ao criar modelo de apuracao:", error)
    return NextResponse.json({ error: "Erro ao criar modelo" }, { status: 500 })
  }
}
