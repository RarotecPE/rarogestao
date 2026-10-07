import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor, canApuracaoMensal } from "@/lib/permissions"
import { aplicarDistribuicaoEmissao } from "@/lib/apuracao"

// GET /api/apuracao/relatorios?cliente_id=&modelo_id=&competencia=&exercicio=&modulo=&status=
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
    const modeloId = searchParams.get("modelo_id")
    const competencia = searchParams.get("competencia")
    const exercicio = searchParams.get("exercicio")
    const modulo = searchParams.get("modulo")
    const status = searchParams.get("status")

    let rows = await sql`
      SELECT r.*, c.nome_fantasia AS cliente_nome, c.cidade AS cliente_cidade,
             c.estado AS cliente_estado, c.cnpj AS cliente_cnpj,
             m.nome AS modelo_nome
      FROM apuracao_relatorios r
      LEFT JOIN clientes c ON c.id = r.cliente_id
      LEFT JOIN apuracao_modelos m ON m.id = r.modelo_id
      ORDER BY r.exercicio DESC, r.competencia DESC, r.numero DESC
    `

    rows = rows.filter((r: any) => {
      if (clienteId) {
        const alvo = parseInt(clienteId)
        let ids: number[] = []
        try {
          ids = typeof r.cliente_ids === "string" ? JSON.parse(r.cliente_ids) : r.cliente_ids || []
        } catch {
          ids = []
        }
        if (r.cliente_id !== alvo && !ids.includes(alvo)) return false
      }
      if (modeloId && r.modelo_id !== parseInt(modeloId)) return false
      if (competencia && r.competencia !== competencia) return false
      if (exercicio && r.exercicio !== parseInt(exercicio)) return false
      if (status && r.status !== status) return false
      if (modulo) {
        let itens: any[] = []
        try {
          itens = typeof r.itens === "string" ? JSON.parse(r.itens) : r.itens || []
        } catch {
          itens = []
        }
        const nomes = itens.map((i: any) => String(i.nome || i).toLowerCase())
        if (!nomes.some((n) => n.includes(modulo.toLowerCase()))) return false
      }
      return true
    })

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Erro ao buscar relatorios de apuracao:", error)
    return NextResponse.json({ error: "Erro ao buscar relatorios" }, { status: 500 })
  }
}

// POST /api/apuracao/relatorios
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
    const clienteIds: number[] =
      Array.isArray(d.cliente_ids) && d.cliente_ids.length > 0
        ? d.cliente_ids.map((x: any) => Number(x))
        : d.cliente_id
          ? [Number(d.cliente_id)]
          : []
    const clientePrincipal = clienteIds[0] || null
    if (!clientePrincipal || !d.competencia || !d.numero) {
      return NextResponse.json(
        { error: "selecione ao menos um cliente, a competencia e o numero" },
        { status: 400 },
      )
    }

    const exercicio = d.exercicio || parseInt(String(d.competencia).slice(0, 4))
    const itens = d.itens || []
    let itensServico = Array.isArray(d.itens_servico) ? d.itens_servico : []

    // Snapshot dos campos de contrato: busca do modelo na emissao (fonte unica).
    let snap = {
      meses_contrato: d.meses_contrato ?? null,
      valor_total_contrato: d.valor_total_contrato ?? null,
      controle_consumo: d.controle_consumo ?? false,
      valor_consumido_inicial: d.valor_consumido_inicial ?? null,
      meses_consumidos_inicial: d.meses_consumidos_inicial ?? null,
    }
    if (d.modelo_id) {
      const mrows = await sql`
        SELECT meses_contrato, valor_total_contrato, controle_consumo,
               valor_consumido_inicial, meses_consumidos_inicial
        FROM apuracao_modelos WHERE id = ${d.modelo_id}
      `
      if (mrows[0]) snap = { ...snap, ...mrows[0] }
    }

    // Distribuicao mensal variavel: para itens marcados, a quantidade emitida varia por ORDEM
    // DE EMISSAO. Ao EMITIR (status 'emitido') com modelo vinculado, o servidor sobrescreve o
    // snapshot com o valor do mes correspondente (indice = nº de relatorios ja emitidos, 0-based).
    if (d.modelo_id && (d.status || "rascunho") === "emitido") {
      const temDistribuicao = itensServico.some(
        (i: any) => i?.distribuir_mensal && Array.isArray(i?.distribuicao_mensal),
      )
      if (temDistribuicao) {
        const cnt = await sql`
          SELECT COUNT(*)::int AS n FROM apuracao_relatorios
          WHERE modelo_id = ${d.modelo_id} AND status = 'emitido'
        `
        const indice = Number(cnt[0]?.n) || 0
        itensServico = aplicarDistribuicaoEmissao(itensServico as any, indice)
      }
    }

    const valorTotal =
      d.modo_valor === "por_modulo"
        ? itens.reduce((s: number, i: any) => s + (Number(i.valor) || 0), 0)
        : d.modo_valor === "por_item"
          ? itensServico.reduce((s: number, i: any) => s + (Number(i.valor) || 0), 0)
          : Number(d.valor_global) || 0

    const result = await sql`
      INSERT INTO apuracao_relatorios (
        modelo_id, cliente_id, cliente_ids, municipio, numero, numero_texto, competencia, exercicio, data_emissao,
        sigla_orgao, numero_contrato_texto, destinatario_nome, destinatario_cargo,
        itens, itens_servico, modo_valor, valor_global, valor_total, texto, observacoes,
        modalidade_remoto, modalidade_presencial, origem, visitas_ids, imagens, anexos_pdf, status,
        meses_contrato, valor_total_contrato, controle_consumo, valor_consumido_inicial, meses_consumidos_inicial
      ) VALUES (
        ${d.modelo_id || null}, ${clientePrincipal}, ${JSON.stringify(clienteIds)}, ${d.municipio || null},
        ${d.numero}, ${d.numero_texto || String(d.numero).padStart(3, "0")},
        ${d.competencia}, ${exercicio}, ${d.data_emissao || new Date().toISOString().slice(0, 10)},
        ${d.sigla_orgao || null}, ${d.numero_contrato_texto || null},
        ${d.destinatario_nome || null}, ${d.destinatario_cargo || null},
        ${JSON.stringify(itens)}, ${JSON.stringify(itensServico)}, ${d.modo_valor || "global"},
        ${d.valor_global ?? null}, ${valorTotal},
        ${d.texto || null}, ${d.observacoes || null},
        ${d.modalidade_remoto ?? true}, ${d.modalidade_presencial ?? false},
        ${d.origem || "padrao"}, ${JSON.stringify(d.visitas_ids || [])},
        ${JSON.stringify(d.imagens || [])}, ${JSON.stringify(d.anexos_pdf || [])},
        ${d.status || "rascunho"},
        ${snap.meses_contrato}, ${snap.valor_total_contrato}, ${snap.controle_consumo},
        ${snap.valor_consumido_inicial}, ${snap.meses_consumidos_inicial}
      )
      RETURNING *
    `

    // Avanca o contador do modelo se o numero emitido for o maior ate agora
    if (d.modelo_id) {
      await sql`
        UPDATE apuracao_modelos
        SET ultimo_numero = GREATEST(ultimo_numero, ${d.numero}), updated_at = now()
        WHERE id = ${d.modelo_id}
      `
    }

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Erro ao criar relatorio de apuracao:", error)
    return NextResponse.json({ error: "Erro ao criar relatorio" }, { status: 500 })
  }
}
