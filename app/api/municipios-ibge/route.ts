import { NextRequest, NextResponse } from "next/server"
import https from "node:https"

export interface Municipio {
  id: number
  nome: string
  uf: string
  nomeCompleto: string
  _searchIndex?: string
}

// Mapeia nomes de estado para siglas (UF)
const STATE_TO_UF: Record<string, string> = {
  Acre: "AC",
  Alagoas: "AL",
  Amapá: "AP",
  Amazonas: "AM",
  Bahia: "BA",
  Ceará: "CE",
  "Distrito Federal": "DF",
  "Espírito Santo": "ES",
  Goiás: "GO",
  Maranhão: "MA",
  "Mato Grosso": "MT",
  "Mato Grosso do Sul": "MS",
  "Minas Gerais": "MG",
  Pará: "PA",
  Paraíba: "PB",
  Paraná: "PR",
  Pernambuco: "PE",
  Piauí: "PI",
  "Rio de Janeiro": "RJ",
  "Rio Grande do Norte": "RN",
  "Rio Grande do Sul": "RS",
  Rondônia: "RO",
  Roraima: "RR",
  "Santa Catarina": "SC",
  "São Paulo": "SP",
  Sergipe: "SE",
  Tocantins: "TO",
}

function toUf(stateName?: string): string {
  if (!stateName) return ""
  const trimmed = stateName.trim()
  if (trimmed.length === 2) return trimmed.toUpperCase()
  return STATE_TO_UF[trimmed] || ""
}

function normalizeText(str: string): string {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

// Cache em memória para evitar chamadas repetidas
let cachedMunicipios: Municipio[] | null = null
let cacheTimestamp: number | null = null
const CACHE_DURATION = 1000 * 60 * 60 * 24 // 24 horas

const RARONEXUS_CONSTANTS_URL =
  process.env.RARONEXUS_CONSTANTS_MUNICIPIOS_URL ||
  `${process.env.RARONEXUS_BASE_URL || "http://localhost:3001"}/api/constants/municipios`

/**
 * Consulta a API oficial do IBGE contornando restrições de certificado ICP-Brasil e timeouts no Node.js
 */
function fetchIbgeAllMunicipalities(timeoutMs = 8000): Promise<Municipio[]> {
  return new Promise((resolve, reject) => {
    const url = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome"

    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          "User-Agent": "RaroGestao/1.0",
          Accept: "application/json",
        },
      },
      (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          return reject(new Error(`IBGE retornou status ${res.statusCode}`))
        }
        let raw = ""
        res.setEncoding("utf8")
        res.on("data", (chunk) => {
          raw += chunk
        })
        res.on("end", () => {
          try {
            const data = JSON.parse(raw)
            if (!Array.isArray(data)) {
              return reject(new Error("IBGE não retornou array"))
            }
            const list: Municipio[] = data
              .map((m: any) => {
                const ufSigla =
                  m.microrregiao?.mesorregiao?.UF?.sigla ||
                  m["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ||
                  m.uf ||
                  ""
                const nome = String(m.nome || "").trim()
                const nomeCompleto = ufSigla ? `${nome}/${ufSigla}` : nome
                return {
                  id: Number(m.id || 0),
                  nome,
                  uf: ufSigla,
                  nomeCompleto,
                  _searchIndex: normalizeText(`${nome} ${ufSigla} ${nomeCompleto}`),
                }
              })
              .filter((m) => Boolean(m.nome))
            resolve(list)
          } catch (e) {
            reject(e)
          }
        })
      }
    )

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout de ${timeoutMs}ms ao consultar IBGE`))
    })

    req.on("error", (err) => {
      reject(err)
    })
  })
}

/**
 * Extrai municípios a partir do payload de constantes do RaroNexus
 */
function extractMunicipalitiesFromRaronexus(data: any): Municipio[] {
  const result: Municipio[] = []

  const parseItem = (m: any, defaultUf = "") => {
    const nome = String(m.nome || m.name || "").trim()
    const uf = String(m.uf || m.state || defaultUf || "").toUpperCase().trim()
    if (!nome) return
    const id = Number(m.codigoIbge || m.id || m.codigo || 0)
    const nomeCompleto = uf ? `${nome}/${uf}` : nome
    result.push({
      id,
      nome,
      uf,
      nomeCompleto,
      _searchIndex: normalizeText(`${nome} ${uf} ${nomeCompleto}`),
    })
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === "object") {
        const keys = Object.keys(item)
        if (keys.length === 1 && Array.isArray(item[keys[0]])) {
          const uf = keys[0]
          item[uf].forEach((m: any) => parseItem(m, uf))
        } else {
          parseItem(item)
        }
      }
    }
  } else if (data && typeof data === "object") {
    for (const uf of Object.keys(data)) {
      if (Array.isArray(data[uf])) {
        data[uf].forEach((m: any) => parseItem(m, uf))
      }
    }
  }

  return result
}

/**
 * Consulta a API de constantes do RaroNexus
 */
async function fetchRaronexusConstants(request: NextRequest): Promise<Municipio[]> {
  const token =
    request.cookies.get("rarogestao_global_session")?.value ||
    request.cookies.get("raronexus_global_session")?.value ||
    process.env.RARONEXUS_SESSION_TOKEN

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "RaroGestao/1.0",
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
    headers["Cookie"] = `raronexus_global_session=${token}`
  }

  const res = await fetch(RARONEXUS_CONSTANTS_URL, {
    method: "GET",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  })

  if (!res.ok) {
    throw new Error(`RaroNexus retornou status ${res.status}`)
  }

  const data = await res.json()
  return extractMunicipalitiesFromRaronexus(data)
}

/**
 * Fallback de busca em tempo real via Photon (OpenStreetMap) caso os catálogos completos falhem
 */
async function searchPhoton(search: string, limit = 30): Promise<Municipio[]> {
  const url = new URL("https://photon.komoot.io/api/")
  url.searchParams.set("q", search)
  url.searchParams.set("limit", String(limit))
  url.searchParams.set("lang", "default")

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "RaroGestao/1.0" },
    signal: AbortSignal.timeout(3500),
  })

  if (!response.ok) {
    throw new Error(`Photon retornou status ${response.status}`)
  }

  const data = await response.json()
  const features = Array.isArray(data.features) ? data.features : []

  const seen = new Set<string>()
  const results: Municipio[] = []

  for (const f of features) {
    const props = f.properties || {}
    if (props.countrycode && props.countrycode !== "BR") continue

    const nome = props.city || props.town || props.municipality || props.name || ""
    const uf = toUf(props.state)
    if (!nome || !uf) continue

    const key = `${normalizeText(nome)}_${uf}`
    if (seen.has(key)) continue
    seen.add(key)

    const nomeCompleto = `${nome}/${uf}`
    results.push({
      id: Number(props.osm_id || Math.floor(Math.random() * 1000000)),
      nome,
      uf,
      nomeCompleto,
      _searchIndex: normalizeText(`${nome} ${uf} ${nomeCompleto}`),
    })
  }

  return results
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get("search") || ""
    const uf = searchParams.get("uf")?.toUpperCase().trim() || ""
    const limit = parseInt(searchParams.get("limit") || "50")

    // 1. Carrega catálogo completo se cache estiver vazio ou expirado
    if (!cachedMunicipios || !cacheTimestamp || Date.now() - cacheTimestamp >= CACHE_DURATION) {
      let loaded: Municipio[] = []

      // Tenta 1: IBGE via https nativo resiliente
      try {
        console.log("[Municipios] Buscando catálogo completo no IBGE...")
        loaded = await fetchIbgeAllMunicipalities(7000)
        console.log("[Municipios] IBGE retornou", loaded.length, "municípios")
      } catch (ibgeErr) {
        console.warn("[Municipios] Falha no IBGE, tentando RaroNexus:", ibgeErr)

        // Tenta 2: RaroNexus
        try {
          loaded = await fetchRaronexusConstants(request)
          console.log("[Municipios] RaroNexus retornou", loaded.length, "municípios")
        } catch (nexusErr) {
          console.warn("[Municipios] Falha no RaroNexus:", nexusErr)
        }
      }

      if (loaded.length > 0) {
        cachedMunicipios = loaded.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto))
        cacheTimestamp = Date.now()
      }
    }

    // 2. Se temos o catálogo em cache, filtra localmente com normalização (acentos-insensível)
    if (cachedMunicipios && cachedMunicipios.length > 0) {
      const normSearch = normalizeText(search)
      let result = cachedMunicipios

      if (uf) {
        result = result.filter((m) => m.uf === uf)
      }

      if (normSearch && normSearch.length >= 2) {
        result = result.filter((m) => {
          const idx = m._searchIndex || normalizeText(`${m.nome} ${m.uf}`)
          return idx.includes(normSearch)
        })
      }

      return NextResponse.json(result.slice(0, limit))
    }

    // 3. Fallback dinâmico: se o catálogo completo não carregou e há busca ativa, usa Photon (OSM)
    if (search.trim().length >= 2) {
      try {
        console.log("[Municipios] Usando fallback dinâmico Photon para termo:", search)
        let photonResults = await searchPhoton(search, limit)
        if (uf) {
          photonResults = photonResults.filter((m) => m.uf === uf)
        }
        return NextResponse.json(photonResults.slice(0, limit))
      } catch (photonErr) {
        console.warn("[Municipios] Falha no fallback Photon:", photonErr)
      }
    }

    // Retorna array vazio em vez de 500 para proteger o frontend contra falhas
    return NextResponse.json([])
  } catch (error) {
    console.error("[Municipios API] Erro inesperado:", error)
    return NextResponse.json([])
  }
}
