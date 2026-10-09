import { NextRequest, NextResponse } from "next/server"
import { getGlobalSessionToken } from "@/lib/auth"

type NexusApplication = {
  nome: string
  client_id: string
  logo_url?: string | null
  homepage_url?: string | null
  ativo?: boolean
}

type NexusApplicationsPayload = NexusApplication[] | {
  success?: boolean
  data?: NexusApplication[]
  message?: string
  error?: string
}

type HeaderApplication = {
  nome: string
  client_id: string
  logo_url: string | null
  homepage_url: string
}

function getEnv(name: string, fallback?: string) {
  const value = process.env[name] || fallback
  if (!value) throw new Error(`${name} is required`)
  return value
}

function nexusHomeApplication(request: NextRequest, nexusBaseUrl: string): HeaderApplication {
  return {
    nome: "RaroNexus",
    client_id: "raronexus",
    logo_url: new URL("/raronexus-logo.png", request.nextUrl.origin).toString(),
    homepage_url: new URL("/home", nexusBaseUrl).toString(),
  }
}

export async function GET(request: NextRequest) {
  const token = getGlobalSessionToken(request)

  if (!token) {
    return NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 })
  }

  const nexusBaseUrl = getEnv("RARONEXUS_BASE_URL", "http://localhost:3001")
  const currentClientId = getEnv("RARONEXUS_CLIENT_ID", "rarogestao_homolog")

  let response: Response
  let payload: NexusApplicationsPayload | null

  try {
    response = await fetch(new URL("/api/v1/applications", nexusBaseUrl), {
      headers: {
        Cookie: `raronexus_global_session=${encodeURIComponent(token)}`,
      },
      cache: "no-store",
    })
    payload = (await response.json().catch(() => null)) as NexusApplicationsPayload | null
  } catch (error) {
    console.error("raronexus_applications_fetch_failed", error)
    return NextResponse.json(
      { error: "Não foi possível carregar os aplicativos." },
      { status: 502 },
    )
  }

  const nexusApplications = Array.isArray(payload) ? payload : payload?.data

  if (!response.ok || !Array.isArray(nexusApplications)) {
    const message = Array.isArray(payload)
      ? "Não foi possível carregar os aplicativos."
      : payload?.message ?? payload?.error ?? "Não foi possível carregar os aplicativos."

    return NextResponse.json(
      { error: message },
      { status: response.status || 502 },
    )
  }

  const applications = nexusApplications
    .filter((application) => (
      application.ativo !== false &&
      application.client_id !== currentClientId &&
      Boolean(application.homepage_url)
    ))
    .map<HeaderApplication>((application) => ({
      nome: application.nome,
      client_id: application.client_id,
      logo_url: application.logo_url ?? null,
      homepage_url: application.homepage_url!,
    }))

  if (currentClientId !== "raronexus" && !applications.some((item) => item.client_id === "raronexus")) {
    applications.unshift(nexusHomeApplication(request, nexusBaseUrl))
  }

  return NextResponse.json({
    applications,
    nexusProfileUrl: new URL("/profile", nexusBaseUrl).toString(),
  })
}
