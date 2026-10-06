import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor, canApuracaoMensal } from "@/lib/permissions"

// Avanca a competencia YYYY-MM em 1 mes
function proximaCompetencia(comp: string): string {
  const [ano, mes] = comp.split("-").map(Number)
  const d = new Date(ano, mes, 1) // mes ja avanca (0-indexado + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// POST /api/apuracao/relatorios/[id]/clonar
// Clona o relatorio para a proxima competencia, avancando a numeracao.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo) && !canApuracaoMensal(user.cargo, user.apuracao_mensal)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const rows = await sql<any>`SELECT * FROM apuracao_relatorios WHERE id = ${parseInt(id)}`
    if (rows.length === 0) {
      return NextResponse.json({ error: "Relatorio nao encontrado" }, { status: 404 })
    }
    const orig = rows[0]

    const novaCompetencia = body.competencia || proximaCompetencia(orig.competencia)
    const novoExercicio = parseInt(String(novaCompetencia).slice(0, 4))

    // Proximo numero (baseado no modelo, se houver)
    let novoNumero = orig.numero + 1
    if (orig.modelo_id) {
      const max = await sql`
        SELECT GREATEST(
          (SELECT COALESCE(MAX(numero),0) FROM apuracao_relatorios WHERE modelo_id = ${orig.modelo_id}),
          (SELECT COALESCE(ultimo_numero,0) FROM apuracao_modelos WHERE id = ${orig.modelo_id})
        ) AS m
      `
      novoNumero = Number(max[0]?.m || orig.numero) + 1
    }

    const result = await sql`
      INSERT INTO apuracao_relatorios (
        modelo_id, cliente_id, cliente_ids, municipio, numero, numero_texto, competencia, exercicio, data_emissao,
        sigla_orgao, numero_contrato_texto, destinatario_nome, destinatario_cargo,
        itens, itens_servico, modo_valor, valor_global, valor_total, texto, observacoes,
        modalidade_remoto, modalidade_presencial, origem, visitas_ids, imagens, anexos_pdf, status
      ) VALUES (
        ${orig.modelo_id}, ${orig.cliente_id},
        ${JSON.stringify(orig.cliente_ids || [])}::jsonb, ${orig.municipio},
        ${novoNumero},
        ${String(novoNumero).padStart(3, "0")}, ${novaCompetencia}, ${novoExercicio},
        ${new Date().toISOString().slice(0, 10)},
        ${orig.sigla_orgao}, ${orig.numero_contrato_texto}, ${orig.destinatario_nome},
        ${orig.destinatario_cargo}, ${JSON.stringify(orig.itens)},
        ${JSON.stringify(orig.itens_servico || [])}::jsonb, ${orig.modo_valor},
        ${orig.valor_global}, ${orig.valor_total}, ${orig.texto}, ${orig.observacoes},
        ${orig.modalidade_remoto}, ${orig.modalidade_presencial}, 'padrao',
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'rascunho'
      )
      RETURNING *
    `

    if (orig.modelo_id) {
      await sql`
        UPDATE apuracao_modelos
        SET ultimo_numero = GREATEST(ultimo_numero, ${novoNumero}), updated_at = now()
        WHERE id = ${orig.modelo_id}
      `
    }

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Erro ao clonar relatorio:", error)
    return NextResponse.json({ error: "Erro ao clonar relatorio" }, { status: 500 })
  }
}
