export const AVISO_CENTRAL_KEYS = [
  "vencidas",
  "mes_atual",
  "sem_observacao",
  "pendencia_externa",
  "contratos",
  "relatorios",
  "medica",
  "medica_analise",
  "agenda",
  "ouve",
] as const

export type AvisoCentralKey = (typeof AVISO_CENTRAL_KEYS)[number]

export type AvisoCentralTom =
  | "red"
  | "amber"
  | "orange"
  | "sky"
  | "rose"
  | "indigo"
  | "pink"
  | "teal"
  | "blue"
  | "violet"

export interface ContextoAvisosUsuario {
  isGestor: boolean
  podeApuracao: boolean
  ouveAtivo?: boolean
}

export interface AvisoCentralDefinicao {
  chave: AvisoCentralKey
  tom: AvisoCentralTom
  titulo: string
  tituloTecnico?: string
  descricao: string
  descricaoTecnico?: string
  disponivelPara: (ctx: ContextoAvisosUsuario) => boolean
}

export const AVISOS_CENTRAL_CATALOGO: AvisoCentralDefinicao[] = [
  {
    chave: "vencidas",
    tom: "red",
    titulo: "Checklist em Atraso",
    tituloTecnico: "Seus checklists em atraso",
    descricao: "Checklists vencidos de competências anteriores com itens pendentes.",
    disponivelPara: () => true,
  },
  {
    chave: "mes_atual",
    tom: "amber",
    titulo: "Checklist em Pendências",
    descricao: "Checklists da competência atual com itens obrigatórios a responder.",
    disponivelPara: () => true,
  },
  {
    chave: "sem_observacao",
    tom: "orange",
    titulo: "Sem observação",
    descricao: "Itens de checklist marcados como “Não atendido” sem justificativa.",
    disponivelPara: () => true,
  },
  {
    chave: "pendencia_externa",
    tom: "sky",
    titulo: "Checklist com Pendências Externas",
    descricao: "Itens de checklist aguardando retorno de terceiros.",
    disponivelPara: () => true,
  },
  {
    chave: "contratos",
    tom: "rose",
    titulo: "Contratos no limite",
    descricao: "Contratos que atingiram 80% ou mais do valor previsto.",
    disponivelPara: (ctx) => ctx.podeApuracao,
  },
  {
    chave: "relatorios",
    tom: "indigo",
    titulo: "Batimento de Relatórios Pendentes",
    descricao: "Visitas registradas na agenda sem relatório correspondente.",
    disponivelPara: () => true,
  },
  {
    chave: "medica",
    tom: "pink",
    titulo: "Documentação médica",
    descricao: "Eventos médicos na agenda sem documento anexado.",
    descricaoTecnico: "Seus eventos médicos na agenda ainda sem documento anexado.",
    disponivelPara: () => true,
  },
  {
    chave: "medica_analise",
    tom: "teal",
    titulo: "Docs. médicos p/ análise",
    descricao: "Documentos médicos enviados por técnicos aguardando validação.",
    disponivelPara: (ctx) => ctx.isGestor,
  },
  {
    chave: "agenda",
    tom: "blue",
    titulo: "Solicitações de agenda",
    descricao: "Pedidos de alteração ou novo agendamento feitos por técnicos.",
    disponivelPara: (ctx) => ctx.isGestor,
  },
  {
    chave: "ouve",
    tom: "violet",
    titulo: "OuveRarotec em aberto",
    descricao: "Manifestações do canal OuveRarotec aguardando análise ou resposta.",
    disponivelPara: (ctx) => ctx.isGestor && ctx.ouveAtivo !== false,
  },
]

const VALID_KEYS_SET = new Set<string>(AVISO_CENTRAL_KEYS)

export function getAvisosDisponiveis(ctx: ContextoAvisosUsuario): AvisoCentralDefinicao[] {
  return AVISOS_CENTRAL_CATALOGO.filter((item) => item.disponivelPara(ctx))
}

export function sanitizarAvisosOcultos(raw: unknown): AvisoCentralKey[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<AvisoCentralKey>()
  const result: AvisoCentralKey[] = []
  for (const item of raw) {
    if (typeof item === "string" && VALID_KEYS_SET.has(item)) {
      const key = item as AvisoCentralKey
      if (!seen.has(key)) {
        seen.add(key)
        result.push(key)
      }
    }
  }
  return result
}
