import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor, canApuracaoMensal } from "@/lib/permissions"

// GET /api/apuracao/visitas-disponiveis?cliente_ids=1,2&competencia=YYYY-MM&modulos=a,b,c
// (aceita tambem cliente_id unico por compatibilidade)
// Retorna os relatorios de visita dos clientes naquela competencia.
// Se "modulos" for informado, marca quais visitas tocam ao menos um dos modulos.
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
    const clienteIdsParam = searchParams.get("cliente_ids") || searchParams.get("cliente_id") || ""
    const clienteIds = clienteIdsParam
      .split(",")
      .map((s) => parseInt(s.trim()))
      .filter((n) => !Number.isNaN(n))
    const competencia = searchParams.get("competencia") // YYYY-MM
    const modulosParam = searchParams.get("modulos")

    if (clienteIds.length === 0 || !competencia) {
      return NextResponse.json({ error: "cliente_ids e competencia obrigatorios" }, { status: 400 })
    }

    const inicio = `${competencia}-01`
    // fim = ultimo dia do mes
    const [ano, mes] = competencia.split("-").map(Number)
    const fim = `${competencia}-${new Date(ano, mes, 0).getDate()}`

    const rows = await sql`
      SELECT r.id, r.cliente_id, r.numero_autenticacao, r.data_visita, r.data_relatorio,
             r.tema, r.tipo_servico, r.modulos, r.municipio, r.orgao_atendido,
             r.assinatura_url, r.status, cl.nome_fantasia AS cliente_nome
      FROM relatorios_visitas r
      LEFT JOIN clientes cl ON cl.id = r.cliente_id
      WHERE r.cliente_id = ANY(${clienteIds})
        AND COALESCE(r.data_relatorio, r.data_visita) >= ${inicio}
        AND COALESCE(r.data_relatorio, r.data_visita) <= ${fim}
      ORDER BY COALESCE(r.data_relatorio, r.data_visita) ASC, r.id ASC
    `

    // Normaliza para comparar modulos ignorando acentos, caixa e espacos.
    // Ex.: "Portal da Transparencia" (modelo) casa com "Portal da Transparência" (visita).
    const normalizar = (s: string) =>
      String(s)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()

    const modulosFiltro = modulosParam
      ? modulosParam.split(",").map(normalizar).filter(Boolean)
      : []

    const enriquecidas = rows.map((r: any) => {
      let modulos: string[] = []
      try {
        modulos = typeof r.modulos === "string" ? JSON.parse(r.modulos) : r.modulos || []
      } catch {
        modulos = []
      }
      const modulosNorm = (modulos || []).map(normalizar)
      const casaModulo =
        modulosFiltro.length === 0 ||
        modulosFiltro.some((mf) => modulosNorm.some((ml) => ml.includes(mf) || mf.includes(ml)))
      return { ...r, modulos, casa_modulo: casaModulo }
    })

    return NextResponse.json({
      visitas: enriquecidas,
      total: enriquecidas.length,
      compativeis: enriquecidas.filter((v: any) => v.casa_modulo).length,
    })
  } catch (error) {
    console.error("Erro ao buscar visitas disponiveis:", error)
    return NextResponse.json({ error: "Erro ao buscar visitas" }, { status: 500 })
  }
}
