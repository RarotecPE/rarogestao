import { sql } from "@/lib/db"
import { getConfig, setConfig } from "@/lib/app-config"
import { sanitizarAvisosOcultos, type AvisoCentralKey } from "@/lib/central-avisos"

const COLUMN_CACHE_FALSE_TTL_MS = 60_000
let hasColumnCache: { value: boolean; checkedAt: number } | null = null

async function hasCentralAvisosColumn(): Promise<boolean> {
  if (hasColumnCache) {
    if (hasColumnCache.value) return true
    if (Date.now() - hasColumnCache.checkedAt < COLUMN_CACHE_FALSE_TTL_MS) {
      return false
    }
  }

  try {
    const rows = await sql<{ exists: boolean }>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'usuarios'
          AND column_name = 'central_avisos_ocultos'
      ) AS exists
    `
    const exists = Boolean(rows[0]?.exists)
    hasColumnCache = { value: exists, checkedAt: Date.now() }
    return exists
  } catch (error) {
    console.error("Erro ao verificar coluna central_avisos_ocultos em usuarios:", error)
    return false
  }
}

function getFallbackConfigKey(userId: number): string {
  return `central_avisos_user_${userId}`
}

function parseJsonArray(valor: unknown): AvisoCentralKey[] {
  if (Array.isArray(valor)) {
    return sanitizarAvisosOcultos(valor)
  }
  if (typeof valor === "string") {
    try {
      return sanitizarAvisosOcultos(JSON.parse(valor))
    } catch {
      return []
    }
  }
  return []
}

/**
 * Retorna as chaves de avisos desativadas pelo usuario.
 * Padrao: [] (todos os avisos disponiveis ativos).
 */
export async function getCentralAvisosOcultos(userId: number): Promise<AvisoCentralKey[]> {
  if (await hasCentralAvisosColumn()) {
    try {
      const rows = await sql<{ central_avisos_ocultos: unknown }>`
        SELECT central_avisos_ocultos
        FROM usuarios
        WHERE id = ${userId}
        LIMIT 1
      `
      if (rows.length > 0 && rows[0].central_avisos_ocultos != null) {
        return parseJsonArray(rows[0].central_avisos_ocultos)
      }
    } catch (error) {
      console.error("Erro ao ler central_avisos_ocultos do usuario:", error)
    }
  }

  // Fallback por usuario em app_config (chave vinculada exclusivamente ao userId)
  const raw = await getConfig(getFallbackConfigKey(userId))
  return raw ? parseJsonArray(raw) : []
}

/**
 * Salva as chaves de avisos desativadas exclusivamente para o usuario informado.
 */
export async function setCentralAvisosOcultos(
  userId: number,
  ocultos: unknown,
): Promise<AvisoCentralKey[]> {
  const sanitized = sanitizarAvisosOcultos(ocultos)
  const serialized = JSON.stringify(sanitized)

  if (await hasCentralAvisosColumn()) {
    await sql`
      UPDATE usuarios
      SET central_avisos_ocultos = ${serialized}::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId}
    `
    return sanitized
  }

  await setConfig(getFallbackConfigKey(userId), serialized, userId)
  return sanitized
}
