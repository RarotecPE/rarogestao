import { sql } from "@/lib/db"
import { mapRoleToCargo } from "@/lib/auth"

export type NexusAuthorizedUser = {
  id: string
  nome: string
  email: string
  avatar_url?: string | null
  cpf?: string | null
  telefone?: string | null
  role_nome?: string | null
  role_chave?: string | null
}

type NexusAuthorizedUsersPayload = {
  success?: boolean
  data?: NexusAuthorizedUser[]
  message?: string
}

function getEnv(name: string, fallback?: string) {
  const value = process.env[name] || fallback
  if (!value) throw new Error(`${name} is required`)
  return value
}

let inFlightNexusFetch: Promise<NexusAuthorizedUser[]> | null = null

/**
 * Consulta a lista de usuários autorizados para o RaroGestão no RaroNexus.
 * Inclui timeout de 6s e compartilhamento de chamada em andamento (deduplicação).
 */
export async function fetchAuthorizedNexusUsers(): Promise<NexusAuthorizedUser[]> {
  if (inFlightNexusFetch) return inFlightNexusFetch

  inFlightNexusFetch = (async () => {
    const nexusBaseUrl = getEnv("RARONEXUS_BASE_URL", "http://localhost:3001")
    const clientId = getEnv("RARONEXUS_CLIENT_ID", "rarogestao_homolog")
    const clientSecret = getEnv("RARONEXUS_CLIENT_SECRET")

    const response = await fetch(new URL("/api/v1/applications/authorized-users", nexusBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    })

    const payload = (await response.json().catch(() => null)) as NexusAuthorizedUsersPayload | null
    if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
      throw new Error(payload?.message || "Não foi possível sincronizar usuários do RaroNexus.")
    }

    return payload.data
  })().finally(() => {
    inFlightNexusFetch = null
  })

  return inFlightNexusFetch
}

type UsuarioRow = {
  id: number
  nexus_user_id?: string | null
  nexus_email?: string | null
  email?: string | null
  nome?: string | null
  cargo?: string | null
  ativo?: boolean | null
}

type TecnicoRow = {
  id: number
  nome?: string | null
  email?: string | null
  nexus_email?: string | null
  cargo?: string | null
  cargos?: string[] | null
  foto_url?: string | null
  ativo?: boolean | null
}

let usuariosSyncPromise: Promise<void> | null = null

/**
 * Sincroniza a tabela local de usuários (`usuarios`) com os autorizados do RaroNexus.
 * Executa em O(1) queries eliminando o N+1 e atualizando apenas registros alterados.
 */
export async function syncAuthorizedNexusUsers(): Promise<void> {
  if (usuariosSyncPromise) return usuariosSyncPromise

  usuariosSyncPromise = (async () => {
    const nexusUsers = await fetchAuthorizedNexusUsers()

    const authorizedNexusIds = new Set<string>()
    const authorizedEmails = new Set<string>()

    // 1. Busca todos os usuários locais em uma única query
    const localUsers = await sql<UsuarioRow>`
      SELECT id, nexus_user_id, nexus_email, email, nome, cargo, ativo
      FROM usuarios
    `

    // Mapeamentos em memória O(1)
    const byNexusId = new Map<string, UsuarioRow>()
    const byNexusEmail = new Map<string, UsuarioRow>()
    const byEmail = new Map<string, UsuarioRow>()

    for (const u of localUsers) {
      if (u.nexus_user_id) byNexusId.set(String(u.nexus_user_id).trim().toLowerCase(), u)
      if (u.nexus_email) byNexusEmail.set(String(u.nexus_email).trim().toLowerCase(), u)
      if (u.email) byEmail.set(String(u.email).trim().toLowerCase(), u)
    }

    const operations: Promise<unknown>[] = []

    for (const nexusUser of nexusUsers) {
      const nexusUserId = nexusUser.id?.trim()
      const email = nexusUser.email?.trim().toLowerCase()
      const cargo = mapRoleToCargo({
        chave: nexusUser.role_chave || "",
        nome: nexusUser.role_nome || "",
      })

      if (!nexusUserId || !email || !cargo) continue

      authorizedNexusIds.add(nexusUserId)
      authorizedEmails.add(email)

      const nome = (nexusUser.nome || email).trim()

      const existing =
        byNexusId.get(nexusUserId.toLowerCase()) ||
        byNexusEmail.get(email) ||
        byEmail.get(email)

      if (existing) {
        // Atualiza apenas se houve alteração real
        const needsUpdate =
          existing.nexus_user_id !== nexusUserId ||
          (existing.nexus_email?.trim().toLowerCase() ?? "") !== email ||
          (existing.nome?.trim() ?? "") !== nome ||
          (existing.cargo?.trim() ?? "") !== cargo ||
          existing.ativo !== true

        if (needsUpdate) {
          operations.push(
            sql`
              UPDATE usuarios
              SET nexus_user_id = ${nexusUserId}::uuid,
                  nexus_email = ${email},
                  nome = ${nome},
                  cargo = ${cargo},
                  ativo = true,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ${existing.id}
            `
          )
        }
      } else {
        operations.push(
          sql`
            INSERT INTO usuarios (nexus_user_id, nexus_email, nome, email, cargo, ativo, apuracao_mensal)
            VALUES (${nexusUserId}::uuid, ${email}, ${nome}, ${email}, ${cargo}, true, false)
          `
        )
      }
    }

    // Inativa usuários locais que não estão mais autorizados no Nexus
    const toInactivateIds = localUsers
      .filter((localUser) => {
        const nexusUserId = localUser.nexus_user_id ? String(localUser.nexus_user_id).trim() : ""
        const nexusEmail = localUser.nexus_email ? String(localUser.nexus_email).trim().toLowerCase() : ""
        const email = localUser.email ? String(localUser.email).trim().toLowerCase() : ""
        const isAuthorized = nexusUserId
          ? authorizedNexusIds.has(nexusUserId)
          : Boolean((nexusEmail && authorizedEmails.has(nexusEmail)) || (!nexusEmail && email && authorizedEmails.has(email)))

        return !isAuthorized && (localUser.ativo !== false || localUser.cargo !== "Inativo")
      })
      .map((u) => u.id)

    if (toInactivateIds.length > 0) {
      operations.push(
        sql`
          UPDATE usuarios
          SET ativo = false,
              cargo = 'Inativo',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY(${toInactivateIds})
        `
      )
    }

    if (operations.length > 0) {
      await Promise.all(operations)
    }
  })().finally(() => {
    usuariosSyncPromise = null
  })

  return usuariosSyncPromise
}

/**
 * Sincronização de técnicos com o RaroNexus.
 *
 * NOTA DE ARQUITETURA:
 * No RaroGestão, os dados dos técnicos são geridos pelo usuário através do modal de cadastro/edição.
 * O RaroNexus é utilizado para preenchimento inicial no modal (puxando nome, e-mail, telefone, CPF,
 * cargo, foto), mas caso o usuário edite qualquer uma dessas informações, os dados editados locais
 * salvos em `tecnicos_rarotec` são a fonte da verdade e NUNCA devem ser sobrescritos pelo Nexus.
 *
 * (A sincronização automática de usuários de login permanece estritamente em `syncAuthorizedNexusUsers`).
 */
export async function syncTecnicosRarotecWithNexus(): Promise<void> {
  // Mantido como no-op intencional para garantir que edições de técnicos não sejam sobrescritas.
  return
}


