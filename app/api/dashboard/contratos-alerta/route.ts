import { sql } from "@/lib/db"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor, canApuracaoMensal } from "@/lib/permissions"
import {
  calcularConsumoAuto,
  aplicarConsumoAuto,
  resumoConsumoContrato,
  avaliarConsumo,
  valorTotalAnualItem,
  type ApuracaoItem,
  type ApuracaoItemServico,
} from "@/lib/apuracao"

function parseJson<T>(v: unknown, fallback: T): T {
  if (Array.isArray(v)) return v as T
  try {
    return typeof v === "string" ? (JSON.parse(v || "null") ?? fallback) : ((v as T) ?? fallback)
  } catch {
    return fallback
  }
}

// GET /api/dashboard/contratos-alerta
// Lista os modelos de apuracao (com controle de consumo) cujo consumo ja atingiu >= 80%
// do valor total do contrato. Cobre os tres modos de valor:
// - por_item: consumo derivado das quantidades dos itens emitidos.
// - global/por_modulo: consumo = Σ dos valores (valor_total) ja emitidos.
export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const autorizado = isGestor(user.nome, user.cargo) || canApuracaoMensal(user.cargo, user.apuracao_mensal)
    if (!autorizado) {
      return NextResponse.json([])
    }
    const modelos = await sql`
      SELECT m.id, m.nome, m.modo_valor, m.itens, m.itens_servico, m.valor_global,
             m.meses_contrato, m.valor_total_contrato, m.controle_consumo,
             c.nome_fantasia AS cliente_nome
      FROM apuracao_modelos m
      LEFT JOIN clientes c ON c.id = m.cliente_id
      WHERE m.controle_consumo = true
    `
    if (modelos.length === 0) return NextResponse.json([])

    // Relatorios emitidos (itens p/ por_item; valor_total p/ global/por_modulo).
    const ids = modelos.map((m: any) => m.id)
    const relatorios = await sql`
      SELECT modelo_id, status, itens_servico, valor_total
      FROM apuracao_relatorios
      WHERE modelo_id = ANY(${ids}) AND status = 'emitido'
    `
    const porModelo = new Map<number, any[]>()
    for (const r of relatorios as any[]) {
      const arr = porModelo.get(r.modelo_id) || []
      arr.push(r)
      porModelo.set(r.modelo_id, arr)
    }

    const alertas = modelos
      .map((m: any) => {
        const emitidos = porModelo.get(m.id) || []
        const overrideTotal = m.valor_total_contrato != null ? Number(m.valor_total_contrato) : null
        let resumo

        if (m.modo_valor === "por_item") {
          const itens = parseJson<ApuracaoItemServico[]>(m.itens_servico, [])
          const comAuto = aplicarConsumoAuto(itens, calcularConsumoAuto(emitidos))
          resumo = resumoConsumoContrato(comAuto, { valorTotalContrato: overrideTotal })
        } else {
          // global / por_modulo: consumo = Σ valores emitidos; total = override ou derivado.
          const consumido = emitidos.reduce((s, r) => s + (Number(r.valor_total) || 0), 0)
          let totalDerivado = 0
          if (m.modo_valor === "por_modulo") {
            const itens = parseJson<ApuracaoItem[]>(m.itens, [])
            totalDerivado = itens.reduce(
              (s, i) =>
                s +
                valorTotalAnualItem({
                  valor: Number(i.valor) || 0,
                  quantidade: 0,
                  quantidade_contrato: i.quantidade_contrato,
                  valor_total: i.valor_total,
                }),
              0,
            )
          } else {
            totalDerivado = (Number(m.valor_global) || 0) * (Number(m.meses_contrato) || 0)
          }
          const total = overrideTotal != null && overrideTotal > 0 ? overrideTotal : totalDerivado
          resumo = avaliarConsumo(total, consumido, { controlado: total > 0 })
        }

        return {
          id: m.id,
          nome: m.nome,
          cliente_nome: m.cliente_nome,
          total: resumo.total,
          consumido: resumo.consumido,
          percentual: resumo.percentual,
          esgotado: resumo.esgotado,
          emAlerta: resumo.emAlerta,
        }
      })
      .filter((a) => a.emAlerta)
      .sort((a, b) => b.percentual - a.percentual)

    return NextResponse.json(alertas)
  } catch (error) {
    console.error("Erro ao calcular alertas de contrato:", error)
    return NextResponse.json([], { status: 500 })
  }
}
