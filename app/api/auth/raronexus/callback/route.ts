import { NextRequest, NextResponse } from "next/server"
import {
  SSO_NEXT_COOKIE_NAME,
  SSO_STATE_COOKIE_NAME,
  clearSessionCookies,
  setSessionCookie,
} from "@/lib/auth"

const ALLOWED_ROLES = new Set([
  "administrador",
  "admin",
  "diretor",
  "gerente",
  "gestor",
  "coordenacao",
  "coordenador",
  "operador",
  "estagiario",
  "funcionario",
  "visualizador",
  "tecnico",
])

type NexusTokenResponse = {
  success: boolean
  message?: string
  data?: {
    global_session_token: string
    user: {
      id: string
      nome: string
      email: string
      avatar_url?: string | null
    }
    role: {
      chave: string
      nome: string
    }
  }
}

function getEnv(name: string, fallback?: string) {
  const value = process.env[name] || fallback
  if (!value) throw new Error(`${name} is required`)
  return value
}

function sanitizeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/api/")) return "/dashboard"
  return value
}

function popupResponse(status: "success" | "error", message: string, mode: "interactive" | "silent" = "interactive", redirectTo = "/dashboard") {
  const safeRedirectTo = status === "success" ? sanitizeNextPath(redirectTo) : "/login"
  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>RaroNexus</title></head>
<body style="background:#020617;color:#e2e8f0;font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center">
  <p>${message}</p>
  <script>
    const payload = { type: "raronexus:sso", status: "${status}", mode: "${mode}", message: ${JSON.stringify(message)}, redirectTo: ${JSON.stringify(safeRedirectTo)} };
    if (window.opener) {
      window.opener.postMessage(payload, window.location.origin);
      window.close();
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, window.location.origin);
    } else {
      window.location.replace(${JSON.stringify(safeRedirectTo)});
    }
  </script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const error = request.nextUrl.searchParams.get("error")
  const expectedState = request.cookies.get(SSO_STATE_COOKIE_NAME)?.value
  const nextPath = sanitizeNextPath(request.cookies.get(SSO_NEXT_COOKIE_NAME)?.value)
  const mode: "interactive" | "silent" = expectedState?.startsWith("silent.") ? "silent" : "interactive"

  if (error) {
    const response = popupResponse("error", error === "login_required" ? "Login necessário no RaroNexus." : "Acesso negado pelo RaroNexus.", mode)
    clearSessionCookies(response)
    response.cookies.delete(SSO_STATE_COOKIE_NAME)
    response.cookies.delete(SSO_NEXT_COOKIE_NAME)
    return response
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    const response = popupResponse("error", "Resposta SSO inválida.", mode)
    clearSessionCookies(response)
    response.cookies.delete(SSO_STATE_COOKIE_NAME)
    response.cookies.delete(SSO_NEXT_COOKIE_NAME)
    return response
  }

  let tokenResponse: Response
  let payload: NexusTokenResponse | null

  try {
    const nexusBaseUrl = getEnv("RARONEXUS_BASE_URL", "http://localhost:3001")
    const rarogestaoBaseUrl = getEnv("RAROGESTAO_BASE_URL", request.nextUrl.origin)
    const redirectUri = `${rarogestaoBaseUrl}/api/auth/raronexus/callback`

    tokenResponse = await fetch(new URL("/api/v1/sso/token", nexusBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: getEnv("RARONEXUS_CLIENT_ID", "rarogestao_homolog"),
        client_secret: getEnv("RARONEXUS_CLIENT_SECRET"),
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    })
    payload = (await tokenResponse.json().catch(() => null)) as NexusTokenResponse | null
  } catch (tokenError) {
    console.error(tokenError)
    const response = popupResponse("error", "Configuração SSO do RaroGestão incompleta.", mode)
    clearSessionCookies(response)
    response.cookies.delete(SSO_STATE_COOKIE_NAME)
    response.cookies.delete(SSO_NEXT_COOKIE_NAME)
    return response
  }

  if (!tokenResponse.ok || !payload?.success || !payload.data) {
    const response = popupResponse("error", payload?.message ?? "Não foi possível concluir o login.", mode)
    clearSessionCookies(response)
    response.cookies.delete(SSO_STATE_COOKIE_NAME)
    response.cookies.delete(SSO_NEXT_COOKIE_NAME)
    return response
  }

  const roleKey = payload.data.role.chave.trim().toLowerCase()
  if (!ALLOWED_ROLES.has(roleKey)) {
    const response = popupResponse("error", "Usuário não autorizado para acessar o RaroGestão.", mode)
    clearSessionCookies(response)
    response.cookies.delete(SSO_STATE_COOKIE_NAME)
    response.cookies.delete(SSO_NEXT_COOKIE_NAME)
    return response
  }

  const response = popupResponse("success", "Login concluído.", mode, nextPath)
  setSessionCookie(response, payload.data.global_session_token)
  response.cookies.delete(SSO_STATE_COOKIE_NAME)
  response.cookies.delete(SSO_NEXT_COOKIE_NAME)
  return response
}
