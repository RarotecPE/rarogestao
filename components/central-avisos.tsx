"use client"

import Link from "next/link"
import { useState } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileWarning,
  MapPin,
  MessagesSquare,
  Stethoscope,
  TrendingUp,
  Users2,
  X,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useSession } from "@/lib/auth-context"
import { isGestor, canApuracaoMensal } from "@/lib/permissions"
import { LABEL_TIPO_MEDICO } from "@/lib/documentos-medicos"
import { formatBRL } from "@/lib/apuracao"
import { STATUS_OUVE } from "@/lib/ouve-rarotec"

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || "Erro ao carregar avisos")
  return data
}

const passiveSWRConfig = {
  dedupingInterval: 30000,
  revalidateOnFocus: false,
  shouldRetryOnError: false,
}

const checklistSWRConfig = {
  ...passiveSWRConfig,
  refreshInterval: 60000,
}

// Paleta por tom — strings literais completas para o JIT do Tailwind detectar.
// chip/ring/count: cores do ícone, anel e número. border/base: borda e cor de fundo sólida.
type ToneDef = {
  chip: string
  ring: string
  count: string
  border: string
  base: string
}
const TONE: Record<string, ToneDef> = {
  red: {
    chip: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    ring: "ring-red-400",
    count: "text-red-700 dark:text-red-300",
    border: "border-red-300 dark:border-red-800",
    base: "bg-red-50/60 dark:bg-red-950/30",
  },
  amber: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    ring: "ring-amber-400",
    count: "text-amber-700 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-800",
    base: "bg-amber-50/60 dark:bg-amber-950/30",
  },
  orange: {
    chip: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
    ring: "ring-orange-400",
    count: "text-orange-700 dark:text-orange-300",
    border: "border-orange-300 dark:border-orange-800",
    base: "bg-orange-50/60 dark:bg-orange-950/30",
  },
  sky: {
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    ring: "ring-sky-400",
    count: "text-sky-700 dark:text-sky-300",
    border: "border-sky-300 dark:border-sky-800",
    base: "bg-sky-50/60 dark:bg-sky-950/30",
  },
  rose: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    ring: "ring-rose-400",
    count: "text-rose-700 dark:text-rose-300",
    border: "border-rose-300 dark:border-rose-800",
    base: "bg-rose-50/60 dark:bg-rose-950/30",
  },
  indigo: {
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
    ring: "ring-indigo-400",
    count: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-300 dark:border-indigo-800",
    base: "bg-indigo-50/60 dark:bg-indigo-950/30",
  },
  pink: {
    chip: "bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300",
    ring: "ring-pink-400",
    count: "text-pink-700 dark:text-pink-300",
    border: "border-pink-300 dark:border-pink-800",
    base: "bg-pink-50/60 dark:bg-pink-950/30",
  },
  teal: {
    chip: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
    ring: "ring-teal-400",
    count: "text-teal-700 dark:text-teal-300",
    border: "border-teal-300 dark:border-teal-800",
    base: "bg-teal-50/60 dark:bg-teal-950/30",
  },
  blue: {
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    ring: "ring-blue-400",
    count: "text-blue-700 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-800",
    base: "bg-blue-50/60 dark:bg-blue-950/30",
  },
  violet: {
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    ring: "ring-violet-400",
    count: "text-violet-700 dark:text-violet-300",
    border: "border-violet-300 dark:border-violet-800",
    base: "bg-violet-50/60 dark:bg-violet-950/30",
  },
}

function dataCurta(valor: string) {
  return format(new Date(String(valor).slice(0, 10) + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
}

interface Grupo {
  chave: string
  tom: keyof typeof TONE
  icon: typeof AlertTriangle
  titulo: string
  total: number
  resumo: string
  href: string
  cta: string
  detalhe: React.ReactNode
}

// Linha compacta reutilizada nos painéis de detalhe.
function LinhaDetalhe({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
      {children}
    </div>
  )
}

// Central de avisos do dashboard: quadros compactos que expandem o detalhe inline,
// sem tirar o usuário da tela. Consolida checklist, financeiro, relatórios,
// documentação médica, solicitações de agenda e chamados do OuveRarotec.
export function CentralAvisos() {
  const { user, loading } = useSession()
  const userIsGestor = user?.nome ? isGestor(user.nome, user.cargo) : false
  const podeApuracao = user ? canApuracaoMensal(user.cargo, user.apuracao_mensal) : false
  const tecnicoId = user?.tecnico_rarotec_id

  const { data: checklist } = useSWR(user ? "/api/checklists/alertas" : null, fetcher, checklistSWRConfig)
  const { data: contratos } = useSWR(
    user && podeApuracao ? "/api/dashboard/contratos-alerta" : null,
    fetcher,
    passiveSWRConfig,
  )
  const pendUrl = !user
    ? null
    : userIsGestor
      ? "/api/dashboard/pendencias?is_gestor=true"
      : tecnicoId
        ? `/api/dashboard/pendencias?tecnico_id=${tecnicoId}`
        : null
  const { data: pendencias } = useSWR(pendUrl, fetcher, passiveSWRConfig)
  const pendMedUrl = !user
    ? null
    : userIsGestor
      ? "/api/dashboard/pendencias-medicas"
      : tecnicoId
        ? `/api/dashboard/pendencias-medicas?tecnico_id=${tecnicoId}`
        : null
  const { data: pendenciasMedicas } = useSWR(pendMedUrl, fetcher, passiveSWRConfig)
  const { data: documentosAnalise } = useSWR(
    user && userIsGestor ? "/api/dashboard/documentos-analise" : null,
    fetcher,
    passiveSWRConfig,
  )
  const { data: solicitacoes, mutate: mutateSolic } = useSWR(
    user && userIsGestor ? "/api/agenda-solicitacoes/pendentes" : null,
    fetcher,
    passiveSWRConfig,
  )
  const { data: ouve } = useSWR(user && userIsGestor ? "/api/dashboard/ouve-abertos" : null, fetcher, passiveSWRConfig)

  const [aberto, setAberto] = useState<string | null>(null)

  if (loading || !user) {
    return null
  }

  async function responderSolicitacao(id: number, acao: "aprovar" | "rejeitar") {
    await fetch("/api/agenda-solicitacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        status: acao === "aprovar" ? "aprovado" : "rejeitado",
        aprovado_por: user?.id,
      }),
    })
    mutateSolic()
  }

  const grupos: Grupo[] = []
  const cl = checklist?.resumo

  if (cl?.vencidas > 0) {
    grupos.push({
      chave: "vencidas",
      tom: "red",
      icon: AlertTriangle,
      titulo: userIsGestor ? "Checklist em Atraso" : "Seus checklists em atraso",
      total: cl.vencidas,
      resumo: "Passaram do mês de competência e ainda têm itens obrigatórios pendentes.",
      href: "/dashboard/checklists",
      cta: "Abrir checklist",
      detalhe: (
        <div className="space-y-1.5">
          {(checklist.vencidas ?? []).slice(0, 6).map((item: any) => (
            <LinhaDetalhe key={item.execucao_id}>
              <span className="min-w-0">
                <span className="font-medium">{item.cliente_nome}</span>
                <span className="text-muted-foreground"> · {item.modulo}</span>
              </span>
              <span className="flex items-center gap-2">
                {userIsGestor && <span className="text-xs text-muted-foreground">{item.tecnico_nome}</span>}
                <Badge variant="outline" className="border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-300 dark:bg-red-500/10">
                  {item.competencia} · {item.pendentes} pendente(s)
                </Badge>
              </span>
            </LinhaDetalhe>
          ))}
        </div>
      ),
    })
  }
  if (cl?.mes_atual > 0) {
    grupos.push({
      chave: "mes_atual",
      tom: "amber",
      icon: Clock3,
      titulo: "Checklist em Pendências",
      total: cl.mes_atual,
      resumo: "Checklists da competência atual (mês corrente) com itens obrigatórios a responder.",
      href: "/dashboard/checklists",
      cta: "Abrir checklist",
      detalhe: (
        <p className="text-sm text-muted-foreground">
          Há {cl.mes_atual} checklist(s) da competência atual com itens obrigatórios ainda não respondidos.
        </p>
      ),
    })
  }
  if (cl?.sem_observacao > 0) {
    grupos.push({
      chave: "sem_observacao",
      tom: "orange",
      icon: FileWarning,
      titulo: "Sem observação",
      total: cl.sem_observacao,
      resumo: "Itens marcados como “Não atendido” que exigem justificativa.",
      href: "/dashboard/checklists",
      cta: "Abrir checklist",
      detalhe: (
        <p className="text-sm text-muted-foreground">
          {cl.sem_observacao} item(ns) “Não atendido” estão sem a observação obrigatória.
        </p>
      ),
    })
  }
  if (cl?.pendencia_externa > 0) {
    grupos.push({
      chave: "pendencia_externa",
      tom: "sky",
      icon: Users2,
      titulo: "Checklist com Pendências Externas",
      total: cl.pendencia_externa,
      resumo: "Aguardando terceiros — cobre o agente externo responsável.",
      href: "/dashboard/checklists",
      cta: "Abrir checklist",
      detalhe: (
        <div className="space-y-1.5">
          {(checklist.externas ?? []).slice(0, 6).map((item: any) => {
            const nomeCliente = String(item.cliente_nome || "")
            const clienteGenerico = /^prefeitura(?:\s|$)/i.test(nomeCliente)
            const localExibicao = clienteGenerico && item.cliente_cidade
              ? item.cliente_cidade
              : nomeCliente || item.cliente_cidade || "Local não informado"
            return (
            <LinhaDetalhe key={item.execucao_id}>
              <span className="min-w-0">
                <span className="font-medium">{localExibicao}</span>
                <span className="text-muted-foreground"> · {item.modulo}</span>
                <span className="text-muted-foreground"> — {item.tecnico_nome || "Sem responsável"}</span>
              </span>
              <Badge variant="outline" className="border-sky-300 text-sky-700 dark:border-sky-500/40 dark:text-sky-300 dark:bg-sky-500/10">
                {item.competencia}
              </Badge>
            </LinhaDetalhe>
            )
          })}
        </div>
      ),
    })
  }
  if (podeApuracao && contratos?.length > 0) {
    grupos.push({
      chave: "contratos",
      tom: "rose",
      icon: TrendingUp,
      titulo: "Contratos no limite",
      total: contratos.length,
      resumo: "Contratos que já consumiram 80% ou mais do valor total previsto.",
      href: "/dashboard/relatorios/apuracao/modelos",
      cta: "Ver modelos de apuração",
      detalhe: (
        <div className="space-y-1.5">
          {contratos.slice(0, 6).map((c: any) => {
            const pct = `${(c.percentual * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
            return (
              <LinhaDetalhe key={c.id}>
                <span className="min-w-0 truncate font-medium">
                  {c.cliente_nome ? `${c.cliente_nome} — ` : ""}
                  {c.nome}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatBRL(c.consumido)} / {formatBRL(c.total)}
                  </span>
                  <Badge variant="outline" className={c.esgotado ? "border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-300 dark:bg-red-500/10" : "border-orange-300 text-orange-700 dark:border-orange-500/40 dark:text-orange-300 dark:bg-orange-500/10"}>
                    {pct}
                  </Badge>
                </span>
              </LinhaDetalhe>
            )
          })}
        </div>
      ),
    })
  }
  if (pendencias?.length > 0) {
    grupos.push({
      chave: "relatorios",
      tom: "indigo",
      icon: MapPin,
      titulo: "Batimento de Relatórios Pendentes",
      total: pendencias.length,
      resumo: "Visitas a clientes/municípios sem relatório correspondente (batimento agenda × relatórios).",
      href: userIsGestor ? "/dashboard/relatorios/batimento" : "/dashboard/relatorios/novo",
      cta: userIsGestor ? "Abrir batimento" : "Criar relatório",
      detalhe: (
        <div className="space-y-1.5">
          {pendencias.map((p: any) => (
            <LinhaDetalhe key={p.id}>
              <span className="min-w-0 truncate">
                <span className="font-medium">{p.local || p.titulo}</span>
                {userIsGestor && p.tecnico_nome && (
                  <span className="text-muted-foreground"> · {p.tecnico_nome}</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{dataCurta(p.data_inicio)}</span>
            </LinhaDetalhe>
          ))}
        </div>
      ),
    })
  }
  if (pendenciasMedicas?.length > 0) {
    grupos.push({
      chave: "medica",
      tom: "pink",
      icon: Stethoscope,
      titulo: "Documentação médica",
      total: pendenciasMedicas.length,
      resumo: userIsGestor
        ? "Eventos médicos na agenda sem documento (atestado/licença) anexado."
        : "Você possui eventos médicos na agenda sem documento anexado.",
      href: "/dashboard/documentos-medicos/anexos",
      cta: "Anexar documento",
      detalhe: (
        <div className="space-y-1.5">
          {pendenciasMedicas.slice(0, 6).map((p: any) => (
            <LinhaDetalhe key={p.id}>
              <span className="min-w-0">
                <span className="font-medium">{LABEL_TIPO_MEDICO[p.tipo] || p.tipo}</span>
                {userIsGestor && p.tecnico_nome && (
                  <span className="text-muted-foreground"> · {p.tecnico_nome}</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{dataCurta(p.data_inicio)}</span>
            </LinhaDetalhe>
          ))}
        </div>
      ),
    })
  }
  if (userIsGestor && documentosAnalise?.length > 0) {
    grupos.push({
      chave: "medica_analise",
      tom: "teal",
      icon: ClipboardCheck,
      titulo: "Docs. médicos p/ análise",
      total: documentosAnalise.length,
      resumo: "Documentos anexados por técnicos aguardando validação da coordenação/gerência.",
      href: "/dashboard/documentos-medicos/batimento",
      cta: "Analisar documentos",
      detalhe: (
        <div className="space-y-1.5">
          {documentosAnalise.slice(0, 6).map((d: any) => (
            <LinhaDetalhe key={d.id}>
              <span className="min-w-0">
                <span className="font-medium">{LABEL_TIPO_MEDICO[d.tipo] || d.tipo}</span>
                {d.tecnico_nome && <span className="text-muted-foreground"> · {d.tecnico_nome}</span>}
              </span>
              <span className="text-xs text-muted-foreground">{dataCurta(d.data_inicio)}</span>
            </LinhaDetalhe>
          ))}
        </div>
      ),
    })
  }
  if (userIsGestor && solicitacoes?.length > 0) {
    grupos.push({
      chave: "agenda",
      tom: "blue",
      icon: BellRing,
      titulo: "Solicitações de agenda",
      total: solicitacoes.length,
      resumo: "Técnicos solicitaram alterações em suas agendas.",
      href: "/dashboard/agenda",
      cta: "Ver agenda",
      detalhe: (
        <div className="space-y-1.5">
          {solicitacoes.slice(0, 6).map((s: any) => {
            const alteracao = typeof s.dados_alteracao === "string"
              ? (() => { try { return JSON.parse(s.dados_alteracao) } catch { return {} } })()
              : s.dados_alteracao || {}
            const dataSolicitada = alteracao.data_sugerida || alteracao.data || s.evento_data
            const normalizarTipoLocal = (valor: unknown) => String(valor || "")
              .toLowerCase()
              .replace(/[\s_-]/g, "")
            const formatarLocal = (local: unknown, tipo: unknown) => {
              const localNormalizado = normalizarTipoLocal(local)
              const tipoNormalizado = normalizarTipoLocal(tipo)
              if (localNormalizado === "homeoffice" || tipoNormalizado === "homeoffice") {
                return "Homeoffice"
              }
              if (localNormalizado === "escritorio" || tipoNormalizado === "escritorio") {
                return "Escritório"
              }
              return String(local || "Não informado")
            }
            const data = dataSolicitada ? dataCurta(dataSolicitada) : "Não informado"
            const semAgendamentoAtual = !s.evento_local && s.tipo_solicitacao === "novo"
            const localAtual = semAgendamentoAtual
              ? "Sem Agendamento Atual - Data Futura"
              : formatarLocal(s.evento_local, s.evento_tipo)
            const localNovo = formatarLocal(
              alteracao.municipio || alteracao.local,
              alteracao.tipo || alteracao.tipo_evento,
            )
            return (
            <LinhaDetalhe key={s.id}>
              <div className="w-full min-w-0 flex-1 space-y-1 sm:w-auto">
                <div>
                  <span className="font-medium">{s.tecnico_nome || "Técnico"}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {s.tipo_solicitacao === "novo"
                      ? "Novo agendamento"
                      : s.tipo_solicitacao === "alteracao"
                        ? "Alteração"
                        : s.tipo_solicitacao === "cancelamento"
                          ? "Cancelamento"
                          : "Outro"}
                  </span>
                </div>
                <div className="grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_minmax(0,1fr)]">
                  <span className="whitespace-nowrap"><strong className="font-medium text-foreground">Local atual:</strong> {localAtual}</span>
                  <span><strong className="font-medium text-foreground">Data:</strong> {data}</span>
                  <span className="sm:col-span-2"><strong className="font-medium text-foreground">Novo local:</strong> {localNovo}</span>
                </div>
              </div>
              <span className="flex w-full shrink-0 justify-end gap-1 sm:w-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300"
                  onClick={() => responderSolicitacao(s.id, "aprovar")}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-500/15 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/20 dark:hover:text-rose-300"
                  onClick={() => responderSolicitacao(s.id, "rejeitar")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </span>
            </LinhaDetalhe>
            )
          })}
        </div>
      ),
    })
  }
  if (userIsGestor && ouve?.total > 0) {
    grupos.push({
      chave: "ouve",
      tom: "violet",
      icon: MessagesSquare,
      titulo: "OuveRarotec em aberto",
      total: ouve.total,
      resumo: "Manifestações aguardando análise ou resposta da gestão.",
      href: "/dashboard/ouve-rarotec",
      cta: "Abrir OuveRarotec",
      detalhe: (
        <div className="space-y-1.5">
          {(ouve.itens ?? []).slice(0, 6).map((m: any) => {
            const st = STATUS_OUVE[m.status]
            return (
              <LinhaDetalhe key={m.id}>
                <span className="min-w-0">
                  <span className="font-mono text-xs font-semibold">{m.codigo}</span>
                  <span className="text-muted-foreground"> · {m.natureza}</span>
                </span>
                <span className="flex items-center gap-2">
                  {st && (
                    <Badge variant="outline" className={st.badge}>
                      {st.label}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{dataCurta(m.created_at)}</span>
                </span>
              </LinhaDetalhe>
            )
          })}
        </div>
      ),
    })
  }

  const carregou = checklist !== undefined
  const totalGeral = grupos.reduce((soma, g) => soma + g.total, 0)
  const temUrgente = grupos.some((g) => g.tom === "red")

  // Nada pendente: uma faixa discreta de confirmação (evita flash antes de carregar).
  if (grupos.length === 0) {
    if (!carregou) return null
    return (
      <Card className="mb-8 border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-950/40">
        <CardContent className="flex items-center gap-3 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            Tudo em dia — nenhum aviso pendente.
          </p>
        </CardContent>
      </Card>
    )
  }

  const grupoAberto = grupos.find((g) => g.chave === aberto) ?? null

  return (
    <Card className="mb-8">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                temUrgente ? "bg-red-100 dark:bg-red-950/50" : "bg-primary/10"
              }`}
            >
              <BellRing className={`h-4 w-4 ${temUrgente ? "text-red-600 dark:text-red-400" : "text-primary"}`} />
            </div>
            <h2 className="font-semibold">Central de avisos</h2>
            <Badge
              variant={temUrgente ? "destructive" : "secondary"}
              className="tabular-nums"
            >
              {totalGeral}
            </Badge>
          </div>
          {userIsGestor && (
            <Badge variant="outline" className="text-xs">
              Visão geral
            </Badge>
          )}
        </div>

        {/* Quadros compactos */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {grupos.map((g) => {
            const tom = TONE[g.tom]
            const ativo = g.chave === aberto
            const Icon = g.icon
            return (
              <button
                key={g.chave}
                type="button"
                onClick={() => setAberto(ativo ? null : g.chave)}
                aria-expanded={ativo}
                className={`relative flex flex-col gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-md ${tom.border} ${tom.base} ${
                  ativo ? `ring-2 ${tom.ring} shadow-sm` : ""
                }`}
              >
                <div className="relative flex items-start justify-between">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tom.chip}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className={`text-2xl font-bold tabular-nums ${tom.count}`}>{g.total}</span>
                </div>
                <span className="relative text-sm font-medium leading-tight text-foreground">{g.titulo}</span>
              </button>
            )
          })}
        </div>

        {/* Detalhe inline expansível (rola dentro do card, sem sair da tela) */}
        {grupoAberto && (
          <div className="mt-4 animate-in fade-in-0 slide-in-from-top-1 duration-200">
            <div className="rounded-xl border bg-muted/30 p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{grupoAberto.titulo}</p>
                  <p className="text-xs text-muted-foreground">{grupoAberto.resumo}</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={grupoAberto.href} className="gap-1">
                    {grupoAberto.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="max-h-72 overflow-y-auto pr-1">{grupoAberto.detalhe}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
