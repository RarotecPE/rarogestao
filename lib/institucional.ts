export interface InstitucionalInfo {
  nome: string
  razao_social: string
  cnpj: string
  email: string
  telefone: string
  endereco: string
  site?: string
  sistema?: {
    nome?: string
    sigla?: string
    descricao?: string
  }
}

/**
 * Normaliza e valida rigorosamente os dados da constante institucional do RaroNexus.
 * Dispara erro caso a estrutura ou campos essenciais estejam ausentes.
 */
export function normalizeInstitucional(raw: any): InstitucionalInfo {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      "A constante 'informacoes-institucionais' do RaroNexus não contém um objeto JSON válido."
    )
  }

  const emp = raw.empresa && typeof raw.empresa === "object" ? raw.empresa : raw
  const sis = raw.sistema && typeof raw.sistema === "object" ? raw.sistema : {}

  const nome = (emp.nome || emp.nome_fantasia || emp.nomeFantasia || "").trim()
  const razao_social = (emp.razao_social || emp.razaoSocial || emp.razao || "").trim()
  const cnpj = (emp.cnpj || "").trim()
  const email = (emp.email || emp.email_contato || emp.emailContato || "").trim()
  const telefone = (emp.telefone || emp.telefone_contato || emp.telefoneContato || "").trim()
  const endereco = (emp.endereco || emp.logradouro || "").trim()
  const site = (emp.site || emp.website || "").trim() || undefined

  if (!nome || !razao_social || !cnpj || !email || !telefone || !endereco) {
    const camposFaltando: string[] = []
    if (!nome) camposFaltando.push("nome")
    if (!razao_social) camposFaltando.push("razao_social")
    if (!cnpj) camposFaltando.push("cnpj")
    if (!email) camposFaltando.push("email")
    if (!telefone) camposFaltando.push("telefone")
    if (!endereco) camposFaltando.push("endereco")

    throw new Error(
      `A constante 'informacoes-institucionais' no RaroNexus está incompleta. Campos ausentes: ${camposFaltando.join(", ")}.`
    )
  }

  return {
    nome,
    razao_social,
    cnpj,
    email,
    telefone,
    endereco,
    site,
    sistema: {
      nome: sis.nome || "RaroGestão",
      sigla: sis.sigla || "RaroGestão",
      descricao: sis.descricao || "Sistema de Gestão Administrativa da Rarotec",
    },
  }
}

/**
 * Busca as informações institucionais obrigatórias da constante do RaroNexus em tempo real.
 * - No browser: consulta `/api/institucional` com cache: "no-store".
 * - No servidor: consulta diretamente a API de constantes do RaroNexus com cache: "no-store".
 * - Dispara erro explícito caso não consiga carregar a constante ou faltem campos obrigatórios.
 */
export async function fetchInstitucionalInfo(): Promise<InstitucionalInfo> {
  // 1. Execução no navegador (Client-side)
  if (typeof window !== "undefined") {
    let response: Response
    try {
      response = await fetch(`/api/institucional?_t=${Date.now()}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
    } catch (networkError: any) {
      throw new Error(
        `Falha de conexão ao buscar constantes institucionais: ${networkError?.message || "Servidor inacessível"}`
      )
    }

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null)
      throw new Error(
        errorPayload?.error ||
          `Não foi possível carregar as informações institucionais do RaroNexus (HTTP ${response.status}). Verifique a constante 'informacoes-institucionais'.`
      )
    }

    const json = await response.json()
    return normalizeInstitucional(json)
  }

  // 2. Execução no servidor (Server-side)
  const nexusBaseUrl = process.env.RARONEXUS_BASE_URL || "http://localhost:3001"
  const targetUrl = new URL("/api/constants/informacoes-institucionais", nexusBaseUrl)

  let serverRes: Response
  try {
    serverRes = await fetch(targetUrl.toString(), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    })
  } catch (serverNetworkError: any) {
    throw new Error(
      `Falha ao conectar ao RaroNexus (${nexusBaseUrl}): ${serverNetworkError?.message || "Conexão recusada"}`
    )
  }

  if (!serverRes.ok) {
    throw new Error(
      `Não foi possível obter a constante institucional do RaroNexus (status ${serverRes.status}). Verifique se a constante 'informacoes-institucionais' foi criada e está como pública.`
    )
  }

  const serverJson = await serverRes.json()
  return normalizeInstitucional(serverJson)
}
