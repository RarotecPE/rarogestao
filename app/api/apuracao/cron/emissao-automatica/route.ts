import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor, canApuracaoMensal } from "@/lib/permissions"
import { competenciaAnterior, ehPrimeiroDiaUtil, aplicarDistribuicaoEmissao } from "@/lib/apuracao"

// Executa a emissao automatica dos relatorios de apuracao mensal.
// Deve rodar diariamente (Vercel Cron); por padrao so age no primeiro dia util
// do mes, gerando os relatorios da competencia ANTERIOR para cada modelo marcado
// com emissao_automatica = true.
//
// Parametros de query (opcionais, para acionamento manual/testes):
//   ?force=1            ignora a checagem de "primeiro dia util"
//   ?competencia=YYYY-MM força uma competencia especifica
export async function GET(request: NextRequest) {
  return executar(request)
}

// Tambem aceita POST para acionamento manual pela UI
export async function POST(request: NextRequest) {
  return executar(request)
}

async function executar(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const force = searchParams.get("force") === "1"
    const competenciaForcada = searchParams.get("competencia") || undefined

    // Protecao por segredo de cron ou sessao autorizada
    const cronSecret = process.env.CRON_SECRET
    const auth = request.headers.get("authorization")
    const isCronAuthorized = !!(cronSecret && (auth === `Bearer ${cronSecret}` || searchParams.get("secret") === cronSecret))

    if (!isCronAuthorized) {
      const user = await getSession()
      if (!user || (!isGestor(user.nome, user.cargo) && !canApuracaoMensal(user.cargo, user.apuracao_mensal))) {
        return NextResponse.json({ error: "nao autorizado" }, { status: 401 })
      }
    }

    const hoje = new Date()
    // Só age no primeiro dia util, a menos que forcado ou competencia explicita
    if (!force && !competenciaForcada && !ehPrimeiroDiaUtil(hoje)) {
      return NextResponse.json({
        executado: false,
        motivo: "hoje nao e o primeiro dia util do mes",
        data: hoje.toISOString().slice(0, 10),
      })
    }

    const competencia = competenciaForcada || competenciaAnterior(hoje)
    const exercicio = parseInt(competencia.slice(0, 4))
    const [ano, mes] = competencia.split("-").map(Number)
    const inicio = `${competencia}-01`
    const fim = `${competencia}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`

    // Modelos ativos marcados para emissao automatica
    const modelos = await sql`
      SELECT * FROM apuracao_modelos
      WHERE ativo = true AND emissao_automatica = true
      ORDER BY id ASC
    `

    const gerados: any[] = []
    const ignorados: any[] = []

    for (const m of modelos) {
      // Ja existe relatorio para este modelo nesta competencia?
      const existente = await sql`
        SELECT id FROM apuracao_relatorios
        WHERE modelo_id = ${m.id} AND competencia = ${competencia}
        LIMIT 1
      `
      if (existente.length > 0) {
        ignorados.push({ modelo_id: m.id, motivo: "ja emitido", relatorio_id: existente[0].id })
        continue
      }

      // Clientes vinculados ao modelo
      let clienteIds: number[] = []
      try {
        clienteIds =
          typeof m.cliente_ids === "string" ? JSON.parse(m.cliente_ids) : m.cliente_ids || []
      } catch {
        clienteIds = []
      }
      if (clienteIds.length === 0 && m.cliente_id) clienteIds = [Number(m.cliente_id)]
      if (clienteIds.length === 0) {
        ignorados.push({ modelo_id: m.id, motivo: "sem clientes" })
        continue
      }

      // Relatorios de visita dos clientes na competencia (com seus modulos, p/ segregar por modulo)
      const visitas = await sql`
        SELECT id, modulos FROM relatorios_visitas
        WHERE cliente_id = ANY(${clienteIds})
          AND COALESCE(data_relatorio, data_visita) >= ${inicio}
          AND COALESCE(data_relatorio, data_visita) <= ${fim}
        ORDER BY COALESCE(data_relatorio, data_visita) ASC, id ASC
      `

      // Itens e valor total herdados do modelo
      let itens: any[] = []
      let itensServico: any[] = []
      try {
        itens = typeof m.itens === "string" ? JSON.parse(m.itens) : m.itens || []
      } catch {
        itens = []
      }
      try {
        itensServico =
          typeof m.itens_servico === "string" ? JSON.parse(m.itens_servico) : m.itens_servico || []
      } catch {
        itensServico = []
      }

      // SEGREGACAO POR MODULO: anexa somente os relatorios de visita (RARs) cujos modulos
      // casam com os modulos deste modelo. Sem esse filtro, a emissao automatica anexava
      // TODOS os RARs do cliente na competencia (misturando contabilidade, patrimonio,
      // almoxarifado, etc.). Mesma normalizacao/criterio usado em /api/apuracao/visitas-disponiveis.
      const normalizar = (s: string) =>
        String(s)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase()
      const modulosModelo = (itens || [])
        .map((i: any) => normalizar(i?.nome || ""))
        .filter(Boolean)
      const visitasIds = visitas
        .filter((v: any) => {
          if (modulosModelo.length === 0) return true // modelo sem modulos definidos: mantem comportamento antigo
          let mods: string[] = []
          try {
            mods = typeof v.modulos === "string" ? JSON.parse(v.modulos) : v.modulos || []
          } catch {
            mods = []
          }
          const modsNorm = (mods || []).map(normalizar)
          // Um RAR sem modulos nao casa com nenhum modelo especifico -> nao anexa.
          return modsNorm.some((ml) => modulosModelo.some((mf) => ml.includes(mf) || mf.includes(ml)))
        })
        .map((v: any) => v.id)

      // Distribuicao mensal variavel: a quantidade de cada item marcado varia por ORDEM DE
      // EMISSAO. O indice = nº de relatorios ja emitidos do modelo (0-based). Sobrescreve o
      // snapshot antes de calcular o valor total e inserir (servidor = fonte da verdade).
      const temDistribuicao = itensServico.some(
        (i: any) => i?.distribuir_mensal && Array.isArray(i?.distribuicao_mensal),
      )
      if (temDistribuicao) {
        const cnt = await sql`
          SELECT COUNT(*)::int AS n FROM apuracao_relatorios
          WHERE modelo_id = ${m.id} AND status = 'emitido'
        `
        const indice = Number(cnt[0]?.n) || 0
        itensServico = aplicarDistribuicaoEmissao(itensServico as any, indice)
      }

      const valorTotal =
        m.modo_valor === "por_modulo"
          ? itens.reduce((s: number, i: any) => s + (Number(i.valor) || 0), 0)
          : m.modo_valor === "por_item"
            ? itensServico.reduce((s: number, i: any) => s + (Number(i.valor) || 0), 0)
            : Number(m.valor_global) || 0

      // Segregacao defensiva: apenas o modo "por_item" exibe a tabela de itens de servico
      // no PDF. Em modo global/por_modulo, zeramos o snapshot de itens_servico para que
      // nenhum item residual herdado do modelo (ex.: linhas de outro modulo) seja gravado
      // no relatorio emitido.
      if (m.modo_valor !== "por_item") itensServico = []

      const numero = (Number(m.ultimo_numero) || 0) + 1
      const clientePrincipal = clienteIds[0]

      const inserido = await sql`
        INSERT INTO apuracao_relatorios (
          modelo_id, cliente_id, cliente_ids, municipio, numero, numero_texto,
          competencia, exercicio, data_emissao, sigla_orgao, numero_contrato_texto,
          destinatario_nome, destinatario_cargo, itens, itens_servico, modo_valor,
          valor_global, valor_total, texto, observacoes, modalidade_remoto,
          modalidade_presencial, origem, visitas_ids, imagens, anexos_pdf, status
        ) VALUES (
          ${m.id}, ${clientePrincipal}, ${JSON.stringify(clienteIds)}, ${m.municipio || null},
          ${numero}, ${String(numero).padStart(3, "0")},
          ${competencia}, ${exercicio}, ${new Date().toISOString().slice(0, 10)},
          ${m.sigla_orgao || null}, ${m.numero_contrato_texto || null},
          ${m.destinatario_nome || null}, ${m.destinatario_cargo || null},
          ${JSON.stringify(itens)}, ${JSON.stringify(itensServico)}, ${m.modo_valor || "global"},
          ${m.valor_global ?? null}, ${valorTotal},
          ${m.texto_padrao || null}, ${m.observacoes_padrao || null},
          ${m.modalidade_remoto ?? true}, ${m.modalidade_presencial ?? false},
          'automatica', ${JSON.stringify(visitasIds)}, '[]'::jsonb, '[]'::jsonb, 'emitido'
        )
        RETURNING id, numero, competencia
      `

      await sql`
        UPDATE apuracao_modelos
        SET ultimo_numero = GREATEST(ultimo_numero, ${numero}), updated_at = now()
        WHERE id = ${m.id}
      `

      gerados.push({
        modelo_id: m.id,
        relatorio_id: inserido[0].id,
        numero: inserido[0].numero,
        competencia,
        visitas_anexadas: visitasIds.length,
      })
    }

    return NextResponse.json({
      executado: true,
      competencia,
      total_modelos: modelos.length,
      gerados,
      ignorados,
    })
  } catch (error) {
    console.error("Erro na emissao automatica:", error)
    return NextResponse.json({ error: "Erro na emissao automatica" }, { status: 500 })
  }
}
