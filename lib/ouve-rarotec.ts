// OuveRarotec — Manifestacoes Eletronicas (NR-01)
// Constantes, tipos e helpers puros (sem acesso a banco).

export type TipoSigilo = "identificavel_aberta" | "identificavel_sigilosa" | "anonima"

export interface OuveManifestacao {
  id: number
  codigo: string
  tipo_sigilo: TipoSigilo
  natureza: string
  categoria: string
  tipo_vida: string
  mensagem: string
  setor?: string | null
  autor_id?: number | null
  autor_nome?: string | null
  autor_email?: string | null
  autor_cargo?: string | null
  status: string
  created_at: string
  anexos?: OuveAnexo[]
  respostas?: OuveResposta[]
}

export interface OuveAnexo {
  id: number
  manifestacao_id: number
  blob_pathname: string
  nome_arquivo?: string | null
  tipo_arquivo?: string | null
  tamanho?: number | null
}

export interface OuveResposta {
  id: number
  manifestacao_id: number
  autor_id?: number | null
  autor_nome?: string | null
  mensagem: string
  created_at: string
}

// Opcoes de formulario
export const NATUREZAS = [
  "Crítica",
  "Denúncia",
  "Elogio",
  "Sugestão",
  "Reclamação",
  "Informação",
  "Solicitação",
  "Dúvida",
  "Outro",
] as const

export const CATEGORIAS = ["Individual", "Setorizado", "Grupo", "Corporação"] as const

export const TIPOS_VIDA = ["Vida Pessoal", "Vida no Trabalho", "Vida Pessoal e Trabalho"] as const

export const TIPOS_SIGILO: { value: TipoSigilo; label: string; descricao: string }[] = [
  {
    value: "identificavel_aberta",
    label: "Identificável e Aberta",
    descricao: "Sua identidade e a manifestação ficam visíveis para todos os colaboradores.",
  },
  {
    value: "identificavel_sigilosa",
    label: "Identificável e Sigilosa",
    descricao: "Você se identifica, mas apenas a gestão (coordenação, gerência, diretoria) vê seus dados.",
  },
  {
    value: "anonima",
    label: "Anônima",
    descricao: "Nenhuma identificação é registrada. Apenas o código de acompanhamento é gerado.",
  },
]

export const STATUS_OUVE: Record<string, { label: string; badge: string }> = {
  aberta: { label: "Aberta", badge: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800" },
  em_analise: { label: "Em análise", badge: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800" },
  respondida: { label: "Respondida", badge: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800" },
  encerrada: { label: "Encerrada", badge: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700" },
}

export function labelSigilo(tipo: string): string {
  return TIPOS_SIGILO.find((t) => t.value === tipo)?.label ?? tipo
}

// Gera um codigo de acompanhamento legivel: OUV-XXXXXX (base32 sem ambiguidades)
export function gerarCodigoOuve(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sem I,O,0,1
  let s = ""
  for (let i = 0; i < 8; i++) {
    s += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  }
  return `OUV-${s}`
}

// Formata o codigo para exibicao: "Código OuveRarotec nº OUV-XXXX"
export function rotuloCodigo(codigo: string): string {
  return `Código OuveRarotec nº ${codigo}`
}
