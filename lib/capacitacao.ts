// Modelo e helpers do submodulo "Capacitacao e Tutoriais" (Documentos Institucionais).

// Uma pessoa vinculada a um treinamento/tutorial: tecnico da Rarotec ou externo.
export interface PessoaVinculada {
  nome: string
  externo: boolean // true = pessoa externa (digitada manualmente); false = tecnico da Rarotec
}

export interface Capacitacao {
  id: number
  titulo: string
  data_treinamento: string
  instrutores: PessoaVinculada[]
  participantes: PessoaVinculada[]
  setores: string[]
  motivo?: string | null
  observacoes?: string | null
  video_url?: string | null
  created_by?: number | null
  created_by_nome?: string | null
  created_at?: string
}

export interface Tutorial {
  id: number
  titulo: string
  data_tutorial: string
  responsaveis: PessoaVinculada[]
  setores: string[]
  blob_pathname?: string | null
  video_url?: string | null
  nome_arquivo?: string | null
  tipo_arquivo?: string | null
  tamanho?: number | null
  observacoes?: string | null
  created_by?: number | null
  created_by_nome?: string | null
  created_at?: string
}

// Normaliza uma lista de pessoas recebida do cliente, descartando entradas invalidas.
export function normalizarPessoas(valor: unknown): PessoaVinculada[] {
  if (!Array.isArray(valor)) return []
  const vistos = new Set<string>()
  const out: PessoaVinculada[] = []
  for (const p of valor) {
    const nome = String((p as any)?.nome ?? "").trim()
    if (!nome) continue
    const chave = nome.toLowerCase()
    if (vistos.has(chave)) continue
    vistos.add(chave)
    out.push({ nome, externo: Boolean((p as any)?.externo) })
  }
  return out
}

// Normaliza a lista de setores, removendo vazios e duplicados.
export function normalizarSetores(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  const vistos = new Set<string>()
  const out: string[] = []
  for (const s of valor) {
    const nome = String(s ?? "").trim()
    if (!nome || vistos.has(nome)) continue
    vistos.add(nome)
    out.push(nome)
  }
  return out
}

// Tipos de arquivo aceitos no anexo do tutorial (PDF ou Word).
export const TIPOS_ANEXO_TUTORIAL = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const

export function extensaoAceitaTutorial(nomeArquivo: string): boolean {
  return /\.(pdf|doc|docx)$/i.test(nomeArquivo)
}

// Rotulo curto de uma pessoa (marca externos).
export function labelPessoa(p: PessoaVinculada): string {
  return p.externo ? `${p.nome} (externo)` : p.nome
}

// Extrai o ID de 11 caracteres de um link do YouTube nos formatos comuns:
// youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID, /live/ID.
export function extrairYoutubeId(url?: string | null): string | null {
  if (!url) return null
  const s = String(url).trim()
  // Ja e apenas o ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s
  const padroes = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of padroes) {
    const m = s.match(p)
    if (m) return m[1]
  }
  return null
}

// URL de embed "sem cookies" para o player. Retorna null se o link nao for YouTube.
export function youtubeEmbedUrl(url?: string | null): string | null {
  const id = extrairYoutubeId(url)
  if (!id) return null
  // nocookie + parametros que reduzem a exposicao do link/branding.
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    controls: "1",
    vq: "hd1080",
  })
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`
}
