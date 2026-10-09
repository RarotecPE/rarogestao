import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { cache } from "react"
import bcrypt from "bcryptjs"
import { sql } from "./db"

export const AUTH_COOKIE_NAME = "rarogestao_global_session"
export const SSO_STATE_COOKIE_NAME = "rarogestao_sso_state"
export const SSO_NEXT_COOKIE_NAME = "rarogestao_sso_next"
const LEGACY_SESSION_COOKIE_NAME = "session_id"
const LEGACY_USER_COOKIE_NAME = "user_id"
const PERSISTENT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10

export interface User {
  id: number
  nexus_user_id?: string | null
  nome: string
  email: string
  avatar_url?: string | null
  cargo: string | null
  ativo: boolean
  apuracao_mensal: boolean
}

type NexusUser = {
  id: string
  nome: string
  email: string
  avatar_url?: string | null
}

export type NexusRole = {
  id?: string
  nome: string
  chave: string
}

type NexusSession = {
  user: NexusUser
  role: NexusRole
}

type NexusIntrospectionResponse = {
  success: boolean
  message?: string
  data?: {
    active: boolean
    user: NexusUser
    role: NexusRole
  }
}

const ROLE_TO_CARGO: Record<string, string> = {
  administrador: "Administrador",
  admin: "Administrador",
  diretor: "Diretor",
  gerente: "Gerente",
  gestor: "Gerente",
  coordenacao: "Coordenação",
  coordenador: "Coordenação",
  operador: "Operador",
  estagiario: "Estagiário",
  funcionario: "Funcionário",
  visualizador: "Funcionário",
  tecnico: "Técnico",
}

function getEnv(name: string, fallback?: string) {
  const value = process.env[name] || fallback
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function mapRoleToCargo(role: NexusRole) {
  const normalized = role.chave.trim().toLowerCase()
  if (normalized === "nao_autorizado") return null
  return ROLE_TO_CARGO[normalized] ?? role.nome ?? null
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

export async function createSession(): Promise<string> {
  throw new Error("A autenticação local foi substituída pelo RaroNexus.")
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PERSISTENT_SESSION_MAX_AGE_SECONDS,
  })
  response.cookies.delete(LEGACY_SESSION_COOKIE_NAME)
  response.cookies.delete(LEGACY_USER_COOKIE_NAME)
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete(AUTH_COOKIE_NAME)
  response.cookies.delete(LEGACY_SESSION_COOKIE_NAME)
  response.cookies.delete(LEGACY_USER_COOKIE_NAME)
}

export function getGlobalSessionToken(request: NextRequest) {
  return request.cookies.get(AUTH_COOKIE_NAME)?.value ?? null
}

async function getGlobalSessionTokenFromCookies() {
  const cookieStore = await cookies()
  return cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null
}

async function introspectGlobalSession(token: string): Promise<NexusSession | null> {
  let response: Response
  let payload: NexusIntrospectionResponse | null

  try {
    const nexusBaseUrl = getEnv("RARONEXUS_BASE_URL", "http://localhost:3001")
    const clientId = getEnv("RARONEXUS_CLIENT_ID", "rarogestao_homolog")
    response = await fetch(new URL("/api/v1/sessions/introspect", nexusBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, client_id: clientId }),
      cache: "no-store",
    })
    payload = (await response.json().catch(() => null)) as NexusIntrospectionResponse | null
  } catch (error) {
    console.error("raronexus_session_introspection_failed", error)
    return null
  }

  if (!response.ok || !payload?.success || !payload.data?.active) return null
  if (!mapRoleToCargo(payload.data.role)) return null

  return {
    user: payload.data.user,
    role: payload.data.role,
  }
}

type CachedEntry<T> = {
  data: T
  expiresAt: number
}

const tecnicoCache = new Map<number, CachedEntry<number | null>>()
const setoresCache = new Map<number, CachedEntry<string[]>>()
const sessionInflight = new Map<string, Promise<User | null>>()

const RESOLVER_CACHE_TTL_MS = 60_000 // 60s de cache em memória para dados estáticos do técnico

async function syncLocalUser(session: NexusSession): Promise<User | null> {
  const cargo = mapRoleToCargo(session.role)
  if (!cargo) return null

  const nexusUserId = session.user.id
  const email = normalizeEmail(session.user.email)
  const nome = session.user.nome || email
  type UsuarioRow = {
    id: number
    nexus_user_id: string | null
    nexus_email: string | null
    nome: string
    email: string
    cargo: string | null
    ativo: boolean
    apuracao_mensal: boolean
  }

  const existing = await sql<UsuarioRow>`
    SELECT id, nexus_user_id, nexus_email, nome, email, cargo, ativo, apuracao_mensal
    FROM usuarios
    WHERE nexus_user_id = ${nexusUserId}::uuid OR LOWER(nexus_email) = ${email} OR LOWER(email) = ${email}
    ORDER BY CASE WHEN nexus_user_id = ${nexusUserId}::uuid THEN 0 ELSE 1 END
    LIMIT 1
  `

  if (existing.length > 0) {
    const current = existing[0]
    const needsUpdate =
      current.nexus_user_id !== nexusUserId ||
      (current.nexus_email ? current.nexus_email.toLowerCase() : "") !== email ||
      current.nome !== nome ||
      current.cargo !== cargo ||
      !current.ativo

    if (needsUpdate) {
      const [updated] = await sql<UsuarioRow>`
        UPDATE usuarios
        SET nexus_user_id = ${nexusUserId}::uuid,
            nexus_email = ${email},
            nome = ${nome},
            cargo = ${cargo},
            ativo = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${current.id}
        RETURNING id, nexus_user_id, nexus_email, nome, email, cargo, ativo, apuracao_mensal
      `
      return {
        ...updated,
        avatar_url: session.user.avatar_url ?? null,
      } as User
    }

    return {
      ...current,
      avatar_url: session.user.avatar_url ?? null,
    } as User
  }

  const [created] = await sql`
    INSERT INTO usuarios (nexus_user_id, nexus_email, nome, email, cargo, ativo, apuracao_mensal)
    VALUES (${nexusUserId}::uuid, ${email}, ${nome}, ${email}, ${cargo}, true, false)
    RETURNING id, nexus_user_id, nexus_email, nome, email, cargo, ativo, apuracao_mensal
  `

  return {
    ...created,
    avatar_url: session.user.avatar_url ?? null,
  } as User
}

async function resolveSessionFromToken(token: string): Promise<User | null> {
  const session = await introspectGlobalSession(token)
  if (!session) {
    return null
  }

  const user = await syncLocalUser(session)
  return user
}

export async function getSessionFromToken(token: string | null): Promise<User | null> {
  if (!token) return null

  const pending = sessionInflight.get(token)
  if (pending) return pending

  const promise = resolveSessionFromToken(token).finally(() => {
    sessionInflight.delete(token)
  })
  sessionInflight.set(token, promise)
  return promise
}

export const getSession = cache(async function getSession(): Promise<User | null> {
  const token = await getGlobalSessionTokenFromCookies()
  return getSessionFromToken(token)
})

export async function getSessionFromRequest(request: NextRequest): Promise<User | null> {
  return getSessionFromToken(getGlobalSessionToken(request))
}

export async function revokeGlobalSession(token: string) {
  const nexusBaseUrl = getEnv("RARONEXUS_BASE_URL", "http://localhost:3001")
  await fetch(new URL("/api/v1/sessions/revoke", nexusBaseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  }).catch(() => null)
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value
  if (token) {
    await revokeGlobalSession(token)
  }
  cookieStore.delete(AUTH_COOKIE_NAME)
  cookieStore.delete(LEGACY_SESSION_COOKIE_NAME)
  cookieStore.delete(LEGACY_USER_COOKIE_NAME)
}

export const resolveTecnicoRarotecId = cache(async function resolveTecnicoRarotecId(user: User): Promise<number | null> {
  const cached = tecnicoCache.get(user.id)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  try {
    let tecnicos = await sql`
      SELECT id FROM tecnicos_rarotec 
      WHERE LOWER(COALESCE(nexus_email, '')) = LOWER(${user.email})
         OR LOWER(COALESCE(email, '')) = LOWER(${user.email})
      LIMIT 1
    `
    if (tecnicos.length === 0) {
      tecnicos = await sql`
        SELECT id FROM tecnicos_rarotec WHERE LOWER(nome) = LOWER(${user.nome}) LIMIT 1
      `
    }
    const result = tecnicos.length > 0 ? Number(tecnicos[0].id) : null
    tecnicoCache.set(user.id, {
      data: result,
      expiresAt: Date.now() + RESOLVER_CACHE_TTL_MS,
    })
    return result
  } catch {
    return null
  }
})

export const resolveSetoresUsuario = cache(async function resolveSetoresUsuario(user: User): Promise<string[]> {
  const cached = setoresCache.get(user.id)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  try {
    let rows = await sql<{ setores: string[] }>`
      SELECT setores FROM tecnicos_rarotec 
      WHERE LOWER(COALESCE(nexus_email, '')) = LOWER(${user.email})
         OR LOWER(COALESCE(email, '')) = LOWER(${user.email})
      LIMIT 1
    `
    if (rows.length === 0) {
      rows = await sql<{ setores: string[] }>`
        SELECT setores FROM tecnicos_rarotec WHERE LOWER(nome) = LOWER(${user.nome}) LIMIT 1
      `
    }
    const setores = rows.length > 0 ? rows[0].setores : null
    const result = Array.isArray(setores) ? setores.filter(Boolean) : []
    setoresCache.set(user.id, {
      data: result,
      expiresAt: Date.now() + RESOLVER_CACHE_TTL_MS,
    })
    return result
  } catch {
    return []
  }
})
