import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { calcularGruposRelatorio, chaveParFixo, type EventoAgrupavel } from "@/lib/relatorio-grupos"

// Função para normalizar string removendo acentos e convertendo para minúsculo
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .trim()
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const paramTecnicoId = searchParams.get('tecnico_id')
    const userIsGestor = isGestor(user.nome, user.cargo)

    // Se for gestor, pode ver todos (!paramTecnicoId) ou filtrar por um técnico.
    // Se não for gestor, OBRIGATORIAMENTE apura apenas o seu próprio técnico.
    let tecnicoIdNum = 0
    let modoGestor = false

    if (userIsGestor) {
      if (paramTecnicoId) {
        tecnicoIdNum = parseInt(paramTecnicoId)
        modoGestor = false
      } else {
        modoGestor = true
      }
    } else {
      const tecRow = await sql`SELECT id FROM tecnicos_rarotec WHERE email = ${user.email} LIMIT 1`
      if (tecRow.length === 0) {
        return NextResponse.json([])
      }
      tecnicoIdNum = Number(tecRow[0].id)
      modoGestor = false
    }

    // Data de hoje no formato YYYY-MM-DD
    const hoje = new Date()
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

    // Executar todas as consultas em paralelo para eliminar roundtrips sequenciais
    const [eventosAgenda, abonos, paresFixosRows, relatorios] = await Promise.all([
      modoGestor
        ? sql`
            SELECT
              a.id, a.titulo, a.data_inicio, a.local, a.tipo, a.cliente_id,
              a.relatorio_grupo_id, a.tecnico_rarotec_id,
              c.cidade AS cliente_cidade,
              t.nome AS tecnico_nome
            FROM agenda_trabalhista a
            LEFT JOIN clientes c ON c.id = a.cliente_id
            LEFT JOIN tecnicos_rarotec t ON t.id = a.tecnico_rarotec_id
            ORDER BY a.data_inicio DESC
          `
        : sql`
            SELECT
              a.id, a.titulo, a.data_inicio, a.local, a.tipo, a.cliente_id,
              a.relatorio_grupo_id, a.tecnico_rarotec_id,
              c.cidade AS cliente_cidade
            FROM agenda_trabalhista a
            LEFT JOIN clientes c ON c.id = a.cliente_id
            WHERE a.tecnico_rarotec_id = ${tecnicoIdNum}
            ORDER BY a.data_inicio DESC
          `,
      modoGestor
        ? sql`SELECT agenda_evento_id, tecnico_id FROM agenda_abonos`
        : sql`SELECT agenda_evento_id, tecnico_id FROM agenda_abonos WHERE tecnico_id = ${tecnicoIdNum}`,
      modoGestor
        ? sql`SELECT tecnico_rarotec_id, cliente_id FROM tecnico_clientes_fixos`
        : sql`SELECT tecnico_rarotec_id, cliente_id FROM tecnico_clientes_fixos WHERE tecnico_rarotec_id = ${tecnicoIdNum}`,
      modoGestor
        ? sql`
            SELECT r.id, r.data_visita, r.data_relatorio, r.municipio,
                   r.tecnicos_rarotec_ids, r.tecnico_rarotec_id
            FROM relatorios_visitas r
          `
        : sql`
            SELECT r.id, r.data_visita, r.data_relatorio, r.municipio,
                   r.tecnicos_rarotec_ids, r.tecnico_rarotec_id
            FROM relatorios_visitas r
            WHERE r.tecnico_rarotec_id = ${tecnicoIdNum}
              OR r.tecnicos_rarotec_ids::text LIKE ${'%' + tecnicoIdNum + '%'}
          `,
    ])

    const abonosSet = new Set(abonos.map((a: any) => `${a.agenda_evento_id}-${a.tecnico_id}`))

    const paresFixosSet = new Set<string>(
      paresFixosRows.map((p: any) => chaveParFixo(p.tecnico_rarotec_id, p.cliente_id))
    )

    // Helper de data ultra-rápido (evita criar new Date se já for ISO string YYYY-MM-DD...)
    const toYMD = (value: any): string => {
      if (!value) return ''
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10)
      }
      const d = new Date(value)
      if (isNaN(d.getTime())) return ''
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    // Helper: normaliza município de um evento
    const extrairMunicipioDoEvento = (evento: any): string => {
      if (evento.cliente_cidade) return normalizeString(String(evento.cliente_cidade).split('/')[0])
      if (evento.local) return normalizeString(String(evento.local).split('/')[0])
      if (evento.titulo && evento.titulo.includes(' - ')) {
        const partes = evento.titulo.split(' - ')
        if (partes.length >= 2) return normalizeString(partes.slice(1).join(' - ').split('/')[0])
      }
      return ''
    }

    // Pré-processamento dos relatórios:
    // 1. Faz o parse de tecnicos_rarotec_ids apenas UMA vez por relatório (evita milhões de JSON.parse em loop)
    // 2. Indexa relatórios por data em um Map para busca O(1)
    type ProcessedRelatorio = {
      id: number
      municipioNorm: string
      tecnicoIds: Set<number>
    }

    const relatoriosPorData = new Map<string, ProcessedRelatorio[]>()

    for (const rel of relatorios) {
      const dataStr = toYMD(rel.data_visita || rel.data_relatorio)
      if (!dataStr) continue

      const munNorm = normalizeString(String(rel.municipio || '').split('/')[0])
      const tecSet = new Set<number>()

      if (rel.tecnico_rarotec_id) {
        tecSet.add(Number(rel.tecnico_rarotec_id))
      }

      if (rel.tecnicos_rarotec_ids) {
        if (Array.isArray(rel.tecnicos_rarotec_ids)) {
          rel.tecnicos_rarotec_ids.forEach((id: any) => tecSet.add(Number(id)))
        } else if (typeof rel.tecnicos_rarotec_ids === 'string') {
          try {
            const parsed = JSON.parse(rel.tecnicos_rarotec_ids)
            if (Array.isArray(parsed)) {
              parsed.forEach((id: any) => tecSet.add(Number(id)))
            }
          } catch {
            // ignorar formato inválido
          }
        }
      }

      const item: ProcessedRelatorio = {
        id: Number(rel.id),
        municipioNorm: munNorm,
        tecnicoIds: tecSet,
      }

      const lista = relatoriosPorData.get(dataStr)
      if (lista) {
        lista.push(item)
      } else {
        relatoriosPorData.set(dataStr, [item])
      }
    }

    const normalizarTipo = (s: string) =>
      String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_.-]/g, '')

    const tiposInternosSet = new Set(
      ['interno', 'folga', 'ferias', 'atestado', 'consulta_medica', 'licenca_medica', 'licenca_maternidade', 'licenca_paternidade', 'feriado', 'escritorio', 'home-office', 'homeoffice', 'suspensao', 'indisponivel'].map(normalizarTipo)
    )
    const titulosInternos = ['home-office', 'home office', 'homeoffice', 'escritorio', 'escritório', 'folga', 'férias', 'ferias', 'atestado', 'consulta médica', 'consulta medica', 'feriado', 'suspensao', 'indisponivel']

    const exigeRelatorio = (evento: any, munNorm: string): boolean => {
      const tipoNorm = normalizarTipo(evento.tipo || '')
      if (tiposInternosSet.has(tipoNorm)) return false
      const tituloEvento = (evento.titulo || '').toLowerCase()
      if (titulosInternos.some(t => tituloEvento.includes(t))) return false
      if (!munNorm) return false
      return true
    }

    // Verifica se evento tem relatório correspondente via busca indexada O(1) por data
    const temRelatorio = (evTecnico: number, dataEvento: string, municipioEvento: string): boolean => {
      const relsDoDia = relatoriosPorData.get(dataEvento)
      if (!relsDoDia || relsDoDia.length === 0) return false

      for (const rel of relsDoDia) {
        if (!rel.municipioNorm.includes(municipioEvento) && !municipioEvento.includes(rel.municipioNorm)) {
          continue
        }
        if (rel.tecnicoIds.has(evTecnico)) {
          return true
        }
      }
      return false
    }

    type EventoInfo = {
      raw: any
      id: number
      tecnicoId: number
      dataStr: string
      municipioNorm: string
      chaveMunicipioDia: string
      temRelatorio: boolean
    }

    const eventosComRelatorio: EventoInfo[] = []

    for (const ev of eventosAgenda) {
      const munNorm = extrairMunicipioDoEvento(ev)
      if (!exigeRelatorio(ev, munNorm)) continue

      const dataStr = toYMD(ev.data_inicio)
      const evId = Number(ev.id)
      const tecId = Number(ev.tecnico_rarotec_id)
      const hasRel = temRelatorio(tecId, dataStr, munNorm)

      eventosComRelatorio.push({
        raw: ev,
        id: evId,
        tecnicoId: tecId,
        dataStr,
        municipioNorm: munNorm,
        chaveMunicipioDia: `${tecId}__${dataStr}__${munNorm}`,
        temRelatorio: hasRel,
      })
    }

    // Cobertura por município/dia
    const municipiosCobertos = new Set<string>()
    for (const ev of eventosComRelatorio) {
      if (ev.temRelatorio && ev.municipioNorm) {
        municipiosCobertos.add(ev.chaveMunicipioDia)
      }
    }

    // Calcular grupos (fixo/esporadico/individual) e status
    const eventosAgrupaveis: EventoAgrupavel[] = eventosComRelatorio.map(ev => ({
      id: ev.id,
      tecnicoId: ev.tecnicoId,
      clienteId: ev.raw.cliente_id ? Number(ev.raw.cliente_id) : null,
      data: ev.dataStr,
      relatorioGrupoId: ev.raw.relatorio_grupo_id ? String(ev.raw.relatorio_grupo_id) : null,
    }))

    const idsSatisfeitos = new Set<number>()
    for (const ev of eventosComRelatorio) {
      if (ev.temRelatorio || municipiosCobertos.has(ev.chaveMunicipioDia)) {
        idsSatisfeitos.add(ev.id)
      }
    }

    const gruposMap = calcularGruposRelatorio({
      eventos: eventosAgrupaveis,
      paresFixos: paresFixosSet,
      temRelatorio: (id) => idsSatisfeitos.has(id),
      hojeStr,
    })

    // Montar pendências: apenas eventos já vencidos (data <= hoje), não abonados,
    // sem relatório e cujo status de grupo seja 'pendente'
    const pendencias = []
    for (const ev of eventosComRelatorio) {
      if (ev.dataStr > hojeStr) continue // futuro não é pendência

      const abonoKey = `${ev.id}-${ev.tecnicoId}`
      if (abonosSet.has(abonoKey)) continue
      if (ev.temRelatorio) continue
      if (municipiosCobertos.has(ev.chaveMunicipioDia)) continue

      const grupo = gruposMap.get(ev.id)
      if (grupo && grupo.status !== 'pendente') continue

      pendencias.push(ev.raw)
    }

    return NextResponse.json(pendencias)
  } catch (error) {
    console.error("Erro ao buscar pendências:", error)
    return NextResponse.json([], { status: 500 })
  }
}
