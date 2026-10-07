import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor, canApuracaoMensal } from "@/lib/permissions"
import { limparConsumoAuto, limparConsumoAutoModulos } from "@/lib/apuracao"

// GET /api/apuracao/modelos/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo) && !canApuracaoMensal(user.cargo, user.apuracao_mensal)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const { id } = await params
    const rows = await sql`
      SELECT m.*, c.nome_fantasia AS cliente_nome, c.cidade AS cliente_cidade,
             c.estado AS cliente_estado, c.cnpj AS cliente_cnpj
      FROM apuracao_modelos m
      LEFT JOIN clientes c ON c.id = m.cliente_id
      WHERE m.id = ${parseInt(id)}
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: "Modelo nao encontrado" }, { status: 404 })
    }
    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("Erro ao buscar modelo:", error)
    return NextResponse.json({ error: "Erro ao buscar modelo" }, { status: 500 })
  }
}

// PATCH /api/apuracao/modelos/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo) && !canApuracaoMensal(user.cargo, user.apuracao_mensal)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const { id } = await params
    const d = await request.json()

    const clienteIds: number[] | null =
      Array.isArray(d.cliente_ids) && d.cliente_ids.length > 0
        ? d.cliente_ids.map((x: any) => Number(x))
        : d.cliente_id
          ? [Number(d.cliente_id)]
          : null
    const clientePrincipal = clienteIds ? clienteIds[0] : null

    // Update PARCIAL: cada campo so e alterado se a chave estiver presente no
    // payload. Assim um toggle rapido (ex.: { emissao_automatica: true }) nao
    // sobrescreve os demais campos do modelo.
    const has = (k: string) => Object.prototype.hasOwnProperty.call(d, k)
    const hasCliente = has("cliente_ids") || has("cliente_id")

    const result = await sql`
      UPDATE apuracao_modelos SET
        nome = CASE WHEN ${has("nome")} THEN ${d.nome ?? null} ELSE nome END,
        cliente_id = CASE WHEN ${hasCliente} THEN ${clientePrincipal} ELSE cliente_id END,
        cliente_ids = CASE WHEN ${hasCliente} THEN ${clienteIds ? JSON.stringify(clienteIds) : null}::jsonb ELSE cliente_ids END,
        municipio = CASE WHEN ${has("municipio")} THEN ${d.municipio ?? null} ELSE municipio END,
        contrato_id = CASE WHEN ${has("contrato_id")} THEN ${d.contrato_id ?? null} ELSE contrato_id END,
        sigla_orgao = CASE WHEN ${has("sigla_orgao")} THEN ${d.sigla_orgao ?? null} ELSE sigla_orgao END,
        numero_contrato_texto = CASE WHEN ${has("numero_contrato_texto")} THEN ${d.numero_contrato_texto ?? null} ELSE numero_contrato_texto END,
        destinatario_nome = CASE WHEN ${has("destinatario_nome")} THEN ${d.destinatario_nome ?? null} ELSE destinatario_nome END,
        destinatario_cargo = CASE WHEN ${has("destinatario_cargo")} THEN ${d.destinatario_cargo ?? null} ELSE destinatario_cargo END,
        itens = CASE WHEN ${has("itens")} THEN ${JSON.stringify(limparConsumoAutoModulos(d.itens ?? []))}::jsonb ELSE itens END,
        itens_servico = CASE WHEN ${has("itens_servico")} THEN ${JSON.stringify(limparConsumoAuto(d.itens_servico ?? []))}::jsonb ELSE itens_servico END,
        modo_valor = CASE WHEN ${has("modo_valor")} THEN ${d.modo_valor ?? null} ELSE modo_valor END,
        valor_global = CASE WHEN ${has("valor_global")} THEN ${d.valor_global ?? null} ELSE valor_global END,
        meses_contrato = CASE WHEN ${has("meses_contrato")} THEN ${d.meses_contrato ?? 12} ELSE meses_contrato END,
        valor_total_contrato = CASE WHEN ${has("valor_total_contrato")} THEN ${d.valor_total_contrato ?? null} ELSE valor_total_contrato END,
        controle_consumo = CASE WHEN ${has("controle_consumo")} THEN ${d.controle_consumo ?? false} ELSE controle_consumo END,
        valor_consumido_inicial = CASE WHEN ${has("valor_consumido_inicial")} THEN ${d.valor_consumido_inicial ?? null} ELSE valor_consumido_inicial END,
        meses_consumidos_inicial = CASE WHEN ${has("meses_consumidos_inicial")} THEN ${d.meses_consumidos_inicial ?? null} ELSE meses_consumidos_inicial END,
        reinicio_competencia = CASE WHEN ${has("reinicio_competencia")} THEN ${d.reinicio_competencia || null} ELSE reinicio_competencia END,
        reinicio_em = CASE WHEN ${has("reinicio_em")} THEN ${d.reinicio_em || null} ELSE reinicio_em END,
        texto_padrao = CASE WHEN ${has("texto_padrao")} THEN ${d.texto_padrao ?? null} ELSE texto_padrao END,
        observacoes_padrao = CASE WHEN ${has("observacoes_padrao")} THEN ${d.observacoes_padrao ?? null} ELSE observacoes_padrao END,
        modalidade_remoto = CASE WHEN ${has("modalidade_remoto")} THEN ${d.modalidade_remoto ?? null} ELSE modalidade_remoto END,
        modalidade_presencial = CASE WHEN ${has("modalidade_presencial")} THEN ${d.modalidade_presencial ?? null} ELSE modalidade_presencial END,
        ultimo_numero = CASE WHEN ${has("ultimo_numero")} THEN ${d.ultimo_numero ?? null} ELSE ultimo_numero END,
        ativo = CASE WHEN ${has("ativo")} THEN ${d.ativo ?? null} ELSE ativo END,
        emissao_automatica = CASE WHEN ${has("emissao_automatica")} THEN ${d.emissao_automatica ?? null} ELSE emissao_automatica END,
        updated_at = now()
      WHERE id = ${parseInt(id)}
      RETURNING *
    `
    if (result.length === 0) {
      return NextResponse.json({ error: "Modelo nao encontrado" }, { status: 404 })
    }
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Erro ao atualizar modelo:", error)
    return NextResponse.json({ error: "Erro ao atualizar modelo" }, { status: 500 })
  }
}

// DELETE /api/apuracao/modelos/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo) && !canApuracaoMensal(user.cargo, user.apuracao_mensal)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const { id } = await params
    await sql`DELETE FROM apuracao_modelos WHERE id = ${parseInt(id)}`
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Erro ao excluir modelo:", error)
    return NextResponse.json({ error: "Erro ao excluir modelo" }, { status: 500 })
  }
}
