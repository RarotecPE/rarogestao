import { NextResponse } from "next/server"
import { normalizeInstitucional } from "@/lib/institucional"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const nexusBaseUrl = process.env.RARONEXUS_BASE_URL || "http://localhost:3001"
    const targetUrl = new URL("/api/constants/informacoes-institucionais", nexusBaseUrl)

    const response = await fetch(targetUrl.toString(), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Não foi possível carregar as informações institucionais do RaroNexus (HTTP ${response.status}). Verifique se a constante 'informacoes-institucionais' foi cadastrada como pública no RaroNexus.`,
        },
        {
          status: response.status >= 500 ? 502 : response.status,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
        }
      )
    }

    const data = await response.json()
    const normalized = normalizeInstitucional(data)

    return NextResponse.json(normalized, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Erro de comunicação ao carregar a constante institucional do RaroNexus.",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      }
    )
  }
}
