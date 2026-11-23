import { sql } from "@/lib/db"
import {
  LABEL_TIPO_MEDICO,
  isTipoMedico,
  listarDiasUteisPeriodo,
  normalizarTipo,
  toYMD,
} from "@/lib/documentos-medicos"

export interface DocumentoMedicoAgendaInput {
  id: number
  tecnico_rarotec_id: number | null
  tipo: string
  data_inicio: string | Date
  data_fim: string | Date
  descricao?: string | null
  status_validacao?: string | null
}

export interface ResultadoSincronizacaoAgenda {
  diasSincronizados: number
  substituidos: number
}

const COLUMN_CACHE_FALSE_TTL_MS = 60_000
let hasDocumentoMedicoIdCache: { value: boolean; checkedAt: number } | null = null

async function hasDocumentoMedicoIdColumn(): Promise<boolean> {
  if (hasDocumentoMedicoIdCache) {
    if (hasDocumentoMedicoIdCache.value) return true
    if (Date.now() - hasDocumentoMedicoIdCache.checkedAt < COLUMN_CACHE_FALSE_TTL_MS) {
      return false
    }
  }

  try {
    const rows = await sql<{ exists: boolean }>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'agenda_trabalhista'
          AND column_name = 'documento_medico_id'
      ) AS exists
    `
    const exists = Boolean(rows[0]?.exists)
    hasDocumentoMedicoIdCache = { value: exists, checkedAt: Date.now() }
    return exists
  } catch (error) {
    console.error("Erro ao verificar coluna documento_medico_id em agenda_trabalhista:", error)
    return false
  }
}

function resolverTipoAgenda(tipo: string): string {
  if (LABEL_TIPO_MEDICO[tipo]) return tipo
  const norm = normalizarTipo(tipo)
  if (LABEL_TIPO_MEDICO[norm]) return norm
  if (norm.includes("atestado")) return "atestado"
  if (norm.includes("consulta")) return "consulta_medica"
  if (norm.includes("maternidade")) return "licenca_maternidade"
  if (norm.includes("paternidade")) return "licenca_paternidade"
  if (norm.includes("licenca")) return "licenca_medica"
  return tipo
}

/**
 * Sincroniza todos os dias uteis (segunda a sexta) do periodo do documento medico
 * na agenda_trabalhista do tecnico.
 * Se ja houver evento(s) no dia, substitui pelo evento medico para evitar duplicidade
 * e pendencias falsas de relatorio de visita.
 */
export async function sincronizarAgendaDocumentoMedico(
  doc: DocumentoMedicoAgendaInput,
): Promise<ResultadoSincronizacaoAgenda> {
  if (!doc.tecnico_rarotec_id || !isTipoMedico(doc.tipo)) {
    return { diasSincronizados: 0, substituidos: 0 }
  }

  const diasUteis = listarDiasUteisPeriodo(doc.data_inicio, doc.data_fim)
  const hasCol = await hasDocumentoMedicoIdColumn()
  const tipoAgenda = resolverTipoAgenda(doc.tipo)
  const titulo = LABEL_TIPO_MEDICO[tipoAgenda] || doc.tipo
  const descricao = doc.descricao || null

  if (hasCol) {
    // Remove eventuais dias antigos vinculados a este documento que sairam do periodo
    const vinculados = await sql<{ id: number; dia: string }>`
      SELECT id, to_char(data_inicio::date, 'YYYY-MM-DD') AS dia
      FROM agenda_trabalhista
      WHERE documento_medico_id = ${doc.id}
    `
    const diasSet = new Set(diasUteis)
    for (const row of vinculados) {
      if (!diasSet.has(row.dia)) {
        await sql`DELETE FROM agenda_trabalhista WHERE id = ${row.id}`
      }
    }
  }

  if (diasUteis.length === 0) {
    return { diasSincronizados: 0, substituidos: 0 }
  }

  let substituidos = 0

  for (const dia of diasUteis) {
    const dataInicioTs = `${dia}T09:00:00`
    const dataFimTs = `${dia}T18:00:00`

    if (hasCol) {
      const existing = await sql<{ id: number; tipo: string | null; documento_medico_id: number | null }>`
        SELECT id, tipo, documento_medico_id
        FROM agenda_trabalhista
        WHERE tecnico_rarotec_id = ${doc.tecnico_rarotec_id}
          AND data_inicio::date = ${dia}::date
        ORDER BY id ASC
      `

      if (existing.length > 0) {
        const principal = existing[0]
        const jaEraEsteDoc = principal.documento_medico_id === doc.id && existing.length === 1

        await sql`
          UPDATE agenda_trabalhista
          SET cliente_id = NULL,
              titulo = ${titulo},
              descricao = ${descricao},
              data_inicio = ${dataInicioTs},
              data_fim = ${dataFimTs},
              tipo = ${tipoAgenda},
              status = 'agendado',
              local = NULL,
              relatorio_grupo_id = NULL,
              documento_medico_id = ${doc.id},
              updated_at = NOW()
          WHERE id = ${principal.id}
        `

        for (const extra of existing.slice(1)) {
          await sql`DELETE FROM agenda_trabalhista WHERE id = ${extra.id}`
        }

        if (!jaEraEsteDoc) substituidos++
      } else {
        await sql`
          INSERT INTO agenda_trabalhista (
            tecnico_rarotec_id, cliente_id, titulo, descricao,
            data_inicio, data_fim, tipo, status, local, documento_medico_id
          ) VALUES (
            ${doc.tecnico_rarotec_id}, ${null}, ${titulo}, ${descricao},
            ${dataInicioTs}, ${dataFimTs}, ${tipoAgenda}, 'agendado', ${null}, ${doc.id}
          )
        `
      }
    } else {
      const existing = await sql<{ id: number; tipo: string | null }>`
        SELECT id, tipo
        FROM agenda_trabalhista
        WHERE tecnico_rarotec_id = ${doc.tecnico_rarotec_id}
          AND data_inicio::date = ${dia}::date
        ORDER BY id ASC
      `

      if (existing.length > 0) {
        const principal = existing[0]
        const jaEraMesmoTipo = principal.tipo === tipoAgenda && existing.length === 1

        await sql`
          UPDATE agenda_trabalhista
          SET cliente_id = NULL,
              titulo = ${titulo},
              descricao = ${descricao},
              data_inicio = ${dataInicioTs},
              data_fim = ${dataFimTs},
              tipo = ${tipoAgenda},
              status = 'agendado',
              local = NULL,
              relatorio_grupo_id = NULL,
              updated_at = NOW()
          WHERE id = ${principal.id}
        `

        for (const extra of existing.slice(1)) {
          await sql`DELETE FROM agenda_trabalhista WHERE id = ${extra.id}`
        }

        if (!jaEraMesmoTipo) substituidos++
      } else {
        await sql`
          INSERT INTO agenda_trabalhista (
            tecnico_rarotec_id, cliente_id, titulo, descricao,
            data_inicio, data_fim, tipo, status, local
          ) VALUES (
            ${doc.tecnico_rarotec_id}, ${null}, ${titulo}, ${descricao},
            ${dataInicioTs}, ${dataFimTs}, ${tipoAgenda}, 'agendado', ${null}
          )
        `
      }
    }
  }

  return {
    diasSincronizados: diasUteis.length,
    substituidos,
  }
}

/**
 * Remove da agenda_trabalhista os dias gerados por um documento medico previamente validado,
 * quando o documento e recusado, revertido, substituido ou excluido.
 */
export async function removerAgendaDocumentoMedico(
  doc: DocumentoMedicoAgendaInput,
): Promise<number> {
  if (doc.status_validacao !== "validado" || !doc.tecnico_rarotec_id || !isTipoMedico(doc.tipo)) {
    return 0
  }

  const hasCol = await hasDocumentoMedicoIdColumn()

  if (hasCol) {
    const deleted = await sql<{ id: number }>`
      DELETE FROM agenda_trabalhista
      WHERE documento_medico_id = ${doc.id}
      RETURNING id
    `
    if (deleted.length > 0) {
      return deleted.length
    }
  }

  // Fallback para ambientes onde a coluna ainda nao foi migrada ou registros validados antes da migracao
  const diasUteis = listarDiasUteisPeriodo(doc.data_inicio, doc.data_fim)
  if (diasUteis.length === 0) return 0

  const tipoAgenda = resolverTipoAgenda(doc.tipo)

  const outrosValidados = await sql<{ data_inicio: string | Date; data_fim: string | Date }>`
    SELECT data_inicio, data_fim
    FROM documentos_medicos
    WHERE tecnico_rarotec_id = ${doc.tecnico_rarotec_id}
      AND id <> ${doc.id}
      AND status_validacao = 'validado'
  `

  let removidos = 0
  for (const dia of diasUteis) {
    const cobertoPorOutro = outrosValidados.some((outro) => {
      const ini = toYMD(outro.data_inicio)
      const fim = toYMD(outro.data_fim)
      return ini !== "" && fim !== "" && dia >= ini && dia <= fim
    })
    if (cobertoPorOutro) continue

    const deleted = hasCol
      ? await sql<{ id: number }>`
          DELETE FROM agenda_trabalhista
          WHERE tecnico_rarotec_id = ${doc.tecnico_rarotec_id}
            AND data_inicio::date = ${dia}::date
            AND tipo = ${tipoAgenda}
            AND documento_medico_id IS NULL
          RETURNING id
        `
      : await sql<{ id: number }>`
          DELETE FROM agenda_trabalhista
          WHERE tecnico_rarotec_id = ${doc.tecnico_rarotec_id}
            AND data_inicio::date = ${dia}::date
            AND tipo = ${tipoAgenda}
          RETURNING id
        `

    removidos += deleted.length
  }

  return removidos
}
