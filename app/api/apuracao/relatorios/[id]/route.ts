import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor, canApuracaoMensal } from "@/lib/permissions"

// GET /api/apuracao/relatorios/[id]
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
      SELECT r.*, c.nome_fantasia AS cliente_nome, c.razao_social AS cliente_razao,
             c.cidade AS cliente_cidade, c.estado AS cliente_estado, c.cnpj AS cliente_cnpj,
             c.endereco AS cliente_endereco, m.nome AS modelo_nome
      FROM apuracao_relatorios r
      LEFT JOIN clientes c ON c.id = r.cliente_id
      LEFT JOIN apuracao_modelos m ON m.id = r.modelo_id
      WHERE r.id = ${parseInt(id)}
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: "Relatorio nao encontrado" }, { status: 404 })
    }

    // Resolve os nomes de todos os clientes do relatorio (consolidado por municipio)
    const rel: any = rows[0]
    let ids: number[] = []
    try {
      ids = typeof rel.cliente_ids === "string" ? JSON.parse(rel.cliente_ids) : rel.cliente_ids || []
    } catch {
      ids = []
    }
    if (ids.length === 0 && rel.cliente_id) ids = [rel.cliente_id]
    if (ids.length > 0) {
      const nomes = await sql`
        SELECT id, nome_fantasia, razao_social, cnpj
        FROM clientes WHERE id = ANY(${ids})
      `
      const ordenados = ids
        .map((id: number) => nomes.find((n: any) => n.id === id))
        .filter(Boolean)
      rel.clientes = ordenados
      rel.clientes_nomes = ordenados.map((n: any) => n.nome_fantasia || n.razao_social)
    } else {
      rel.clientes = []
      rel.clientes_nomes = rel.cliente_nome ? [rel.cliente_nome] : []
    }

    return NextResponse.json(rel)
  } catch (error) {
    console.error("Erro ao buscar relatorio:", error)
    return NextResponse.json({ error: "Erro ao buscar relatorio" }, { status: 500 })
  }
}

// PATCH /api/apuracao/relatorios/[id]
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
    const itens = d.itens ?? []
    const itensServico = Array.isArray(d.itens_servico) ? d.itens_servico : []
    const valorTotal =
      d.modo_valor === "por_modulo"
        ? itens.reduce((s: number, i: any) => s + (Number(i.valor) || 0), 0)
        : d.modo_valor === "por_item"
          ? itensServico.reduce((s: number, i: any) => s + (Number(i.valor) || 0), 0)
          : Number(d.valor_global) || 0

    const clienteIds: number[] | null =
      Array.isArray(d.cliente_ids) && d.cliente_ids.length > 0
        ? d.cliente_ids.map((x: any) => Number(x))
        : d.cliente_id
          ? [Number(d.cliente_id)]
          : null
    const clientePrincipal = clienteIds ? clienteIds[0] : null

    const result = await sql`
      UPDATE apuracao_relatorios SET
        cliente_id = COALESCE(${clientePrincipal}, cliente_id),
        cliente_ids = COALESCE(${clienteIds ? JSON.stringify(clienteIds) : null}::jsonb, cliente_ids),
        municipio = COALESCE(${d.municipio ?? null}, municipio),
        numero = COALESCE(${d.numero ?? null}, numero),
        numero_texto = ${d.numero_texto ?? null},
        competencia = COALESCE(${d.competencia ?? null}, competencia),
        exercicio = COALESCE(${d.exercicio ?? null}, exercicio),
        data_emissao = COALESCE(${d.data_emissao ?? null}, data_emissao),
        sigla_orgao = ${d.sigla_orgao ?? null},
        numero_contrato_texto = ${d.numero_contrato_texto ?? null},
        destinatario_nome = ${d.destinatario_nome ?? null},
        destinatario_cargo = ${d.destinatario_cargo ?? null},
        itens = ${JSON.stringify(itens)},
        itens_servico = ${JSON.stringify(itensServico)},
        modo_valor = COALESCE(${d.modo_valor ?? null}, modo_valor),
        valor_global = ${d.valor_global ?? null},
        valor_total = ${valorTotal},
        texto = ${d.texto ?? null},
        observacoes = ${d.observacoes ?? null},
        modalidade_remoto = COALESCE(${d.modalidade_remoto ?? null}, modalidade_remoto),
        modalidade_presencial = COALESCE(${d.modalidade_presencial ?? null}, modalidade_presencial),
        origem = COALESCE(${d.origem ?? null}, origem),
        visitas_ids = ${JSON.stringify(d.visitas_ids ?? [])},
        imagens = ${JSON.stringify(d.imagens ?? [])},
        anexos_pdf = ${JSON.stringify(d.anexos_pdf ?? [])},
        status = COALESCE(${d.status ?? null}, status),
        updated_at = now()
      WHERE id = ${parseInt(id)}
      RETURNING *
    `
    if (result.length === 0) {
      return NextResponse.json({ error: "Relatorio nao encontrado" }, { status: 404 })
    }
    if (result[0].modelo_id && d.numero) {
      await sql`
        UPDATE apuracao_modelos
        SET ultimo_numero = GREATEST(ultimo_numero, ${d.numero}), updated_at = now()
        WHERE id = ${result[0].modelo_id}
      `
    }
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Erro ao atualizar relatorio:", error)
    return NextResponse.json({ error: "Erro ao atualizar relatorio" }, { status: 500 })
  }
}

// DELETE /api/apuracao/relatorios/[id]
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
    await sql`DELETE FROM apuracao_relatorios WHERE id = ${parseInt(id)}`
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Erro ao excluir relatorio:", error)
    return NextResponse.json({ error: "Erro ao excluir relatorio" }, { status: 500 })
  }
}
