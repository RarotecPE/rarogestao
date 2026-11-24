"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Loader2,
  Save,
  Search,
  Settings2,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"
import { ChecklistExecucao, ChecklistItemStatus } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FiltroCompetencia, periodoParaQuery, type Periodo } from "@/components/filtro-competencia"
import { ListPagination, usePagination } from "@/components/list-pagination"

const statusLabels: Record<ChecklistItemStatus, string> = {
  pendente: "Pendente",
  atendido: "Atendido",
  nao_atendido: "Não atendido",
  nao_se_aplica: "Não se aplica",
  pendencia_externa: "Pendência externa",
}

// Status que exigem observação preenchida ao salvar.
// "Não atendido" só exige quando o item marca exige_observacao_negativa;
// "Pendência externa" sempre exige (registro do que está pendente com o terceiro).
function exigeObservacao(item: { status: ChecklistItemStatus; exige_observacao_negativa: boolean }) {
  if (item.status === "pendencia_externa") return true
  if (item.status === "nao_atendido") return item.exige_observacao_negativa
  return false
}

interface Opcoes {
  tecnicos: { id: number; nome: string }[]
}

export default function ChecklistsPage() {
  const agora = new Date()
  const [periodo, setPeriodo] = useState<Periodo>({
    modo: "mes",
    ano: String(agora.getFullYear()),
    mes: String(agora.getMonth() + 1),
  })
  const anos = Array.from({ length: 5 }, (_, index) => String(agora.getFullYear() - 2 + index))
  const [tecnicoId, setTecnicoId] = useState("all")
  const [status, setStatus] = useState("all")
  const [municipio, setMunicipio] = useState("all")
  const [modulo, setModulo] = useState("all")
  const [busca, setBusca] = useState("")
  const [dados, setDados] = useState<ChecklistExecucao[]>([])
  const [opcoes, setOpcoes] = useState<Opcoes>({ tecnicos: [] })
  const [gestor, setGestor] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [abertos, setAbertos] = useState<Set<number>>(new Set())

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(periodoParaQuery(periodo))
      if (tecnicoId !== "all") params.set("tecnico_id", tecnicoId)
      if (status !== "all") params.set("status", status)
      const response = await fetch(`/api/checklists/mensal?${params.toString()}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Erro ao carregar o checklist")
      setDados(result.data || [])
      setGestor(Boolean(result.gestor))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar o checklist")
    } finally {
      setLoading(false)
    }
  }, [periodo, tecnicoId, status])

  useEffect(() => {
    fetch("/api/responsabilidades/opcoes").then((response) => response.json()).then(setOpcoes).catch(() => null)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function atualizarItem(execucaoId: number, itemId: number, patch: { status?: ChecklistItemStatus; observacao?: string }) {
    setDados((atuais) => atuais.map((execucao) => execucao.id !== execucaoId ? execucao : {
      ...execucao,
      itens: execucao.itens.map((item) => item.id === itemId ? { ...item, ...patch } : item),
    }))
  }

  function atualizarObservacaoGeral(execucaoId: number, observacao_geral: string) {
    setDados((atuais) => atuais.map((item) => item.id === execucaoId ? { ...item, observacao_geral } : item))
  }

  async function salvar(execucao: ChecklistExecucao) {
    const semObservacao = execucao.itens.find((item) => exigeObservacao(item) && !(item.observacao || "").trim())
    if (semObservacao) {
      toast.error(`Informe a observação do item "${semObservacao.titulo}" (${statusLabels[semObservacao.status]})`)
      return
    }
    setSavingId(execucao.id)
    try {
      const response = await fetch("/api/checklists/mensal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          execucao_id: execucao.id,
          observacao_geral: execucao.observacao_geral,
          itens: execucao.itens.map((item) => ({ id: item.id, status: item.status, observacao: item.observacao })),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar")
      toast.success("Checklist salvo")
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar")
    } finally {
      setSavingId(null)
    }
  }

  // Municípios e módulos disponíveis são derivados dos checklists da competência.
  const municipios = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const item of dados) {
      if (item.cliente_cidade) {
        mapa.set(item.cliente_cidade, [item.cliente_cidade, item.cliente_estado].filter(Boolean).join(" - "))
      }
    }
    return Array.from(mapa, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
  }, [dados])

  const modulos = useMemo(
    () => Array.from(new Set(dados.map((item) => item.modulo))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [dados],
  )

  const dadosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return dados.filter((item) => {
      if (municipio !== "all" && item.cliente_cidade !== municipio) return false
      if (modulo !== "all" && item.modulo !== modulo) return false
      if (termo) {
        const alvo = [item.cliente_nome, item.cliente_cidade, item.modulo, item.tecnico_nome, item.orgao_nome]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!alvo.includes(termo)) return false
      }
      return true
    })
  }, [dados, municipio, modulo, busca])

  const metricas = useMemo(() => ({
    total: dadosFiltrados.length,
    concluidos: dadosFiltrados.filter((item) => item.status === "concluido").length,
    andamento: dadosFiltrados.filter((item) => item.status === "em_andamento").length,
    pendentes: dadosFiltrados.filter((item) => item.status === "pendente").length,
  }), [dadosFiltrados])

  const checklistsPagination = usePagination(dadosFiltrados, {
    initialPageSize: 10,
    resetKey: `${JSON.stringify(periodo)}|${tecnicoId}|${status}|${municipio}|${modulo}|${busca}`,
  })

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Checklist mensal do responsável</h1>
          <p className="mt-1 text-sm text-muted-foreground">Registre o atendimento de cada cliente e módulo na competência selecionada.</p>
        </div>
        {gestor && <Button variant="outline" asChild><Link href="/dashboard/checklists/configuracao"><Settings2 className="mr-2 h-4 w-4" />Configurar itens</Link></Button>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Checklists", value: metricas.total, icon: ClipboardCheck, color: "bg-primary/10 text-primary" },
          { label: "Concluídos", value: metricas.concluidos, icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
          { label: "Em andamento", value: metricas.andamento, icon: Clock3, color: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" },
          { label: "Pendentes", value: metricas.pendentes, icon: TriangleAlert, color: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
        ].map(({ label, value, icon: Icon, color }) => <Card key={label} className="shadow-sm"><CardContent className="flex items-center gap-4 p-4"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div></CardContent></Card>)}
      </div>

      <Card className="shadow-sm"><CardContent className="space-y-3 p-4">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar por cliente, município, módulo ou responsável..." className="pl-9" /></div>
        <div className="flex flex-wrap gap-3">
          <FiltroCompetencia periodo={periodo} onChange={setPeriodo} anos={anos} />
          <Select value={municipio} onValueChange={setMunicipio}><SelectTrigger className="min-w-[11rem] flex-1"><SelectValue placeholder="Município" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os municípios</SelectItem>{municipios.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
          <Select value={modulo} onValueChange={setModulo}><SelectTrigger className="min-w-[11rem] flex-1"><SelectValue placeholder="Módulo" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os módulos</SelectItem>{modulos.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          {gestor && <Select value={tecnicoId} onValueChange={setTecnicoId}><SelectTrigger className="min-w-[11rem] flex-1"><SelectValue placeholder="Responsável" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os responsáveis</SelectItem>{opcoes.tecnicos.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.nome}</SelectItem>)}</SelectContent></Select>}
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="min-w-[10rem] flex-1"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="pendente">Pendentes</SelectItem><SelectItem value="em_andamento">Em andamento</SelectItem><SelectItem value="concluido">Concluídos</SelectItem></SelectContent></Select>
        </div>
      </CardContent></Card>

      {loading ? <Card><CardContent className="flex h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></CardContent></Card> : !dadosFiltrados.length ? <Card><CardContent className="flex h-48 flex-col items-center justify-center gap-2 text-center"><ClipboardCheck className="h-10 w-10 text-muted-foreground/40" /><p className="font-medium">{dados.length ? "Nenhum checklist para os filtros aplicados" : "Nenhum checklist nesta competência"}</p><p className="text-sm text-muted-foreground">{dados.length ? "Ajuste o município, o módulo ou a busca." : "Verifique se existem responsáveis atribuídos aos módulos."}</p></CardContent></Card> : <div className="space-y-4">
        {checklistsPagination.paginatedItems.map((execucao) => {
          const obrigatorios = execucao.itens.filter((item) => item.obrigatorio)
          const respondidos = obrigatorios.filter((item) => item.status !== "pendente").length
          const progresso = obrigatorios.length ? Math.round((respondidos / obrigatorios.length) * 100) : 100
          const aberto = abertos.has(execucao.id)
          return <Collapsible key={execucao.id} open={aberto} onOpenChange={(open) => setAbertos((atuais) => { const novo = new Set(atuais); if (open) novo.add(execucao.id); else novo.delete(execucao.id); return novo })}>
            <Card className="overflow-hidden shadow-sm">
              <CollapsibleTrigger asChild><button className="w-full p-5 text-left transition-colors hover:bg-muted/30"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{execucao.cliente_nome}</h2><Badge variant="outline">{execucao.modulo}</Badge>{execucao.orgao_nome && <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300">Exceção: {execucao.orgao_nome}</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{execucao.cliente_cidade ? `${[execucao.cliente_cidade, execucao.cliente_estado].filter(Boolean).join(" - ")} · ` : ""}Responsável: {execucao.tecnico_nome}</p></div><div className="flex w-full items-center gap-4 md:w-auto"><div className="w-full md:w-52"><div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="whitespace-nowrap">{respondidos}/{obrigatorios.length} obrigatórios</span><span className="whitespace-nowrap font-medium tabular-nums text-foreground">{progresso}%</span></div><Progress value={progresso} /></div><Badge className={execucao.status === "concluido" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : execucao.status === "em_andamento" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}>{execucao.status === "concluido" ? "Concluído" : execucao.status === "em_andamento" ? "Em andamento" : "Pendente"}</Badge><ChevronDown className={`h-5 w-5 transition-transform ${aberto ? "rotate-180" : ""}`} /></div></div></button></CollapsibleTrigger>
              <CollapsibleContent><CardContent className="space-y-4 border-t bg-muted/10 p-5">
                {execucao.itens.map((item, index) => <div key={item.id} className="rounded-lg border bg-background p-4"><div className="grid gap-4 lg:grid-cols-[1fr_190px]"><div><p className="font-medium"><span className="mr-2 text-muted-foreground">{index + 1}.</span>{item.titulo}</p>{item.descricao && <p className="mt-1 text-sm text-muted-foreground">{item.descricao}</p>}</div><Select value={item.status} onValueChange={(value) => atualizarItem(execucao.id, item.id, { status: value as ChecklistItemStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="mt-3"><Label className="text-xs text-muted-foreground">Observação {exigeObservacao(item) ? "(obrigatória)" : ""}</Label><Textarea className="mt-1 min-h-20" value={item.observacao || ""} onChange={(event) => atualizarItem(execucao.id, item.id, { observacao: event.target.value })} placeholder={item.status === "pendencia_externa" ? "Descreva a pendência e de quem se aguarda (cliente/órgão externo)..." : "Registre ocorrências, pendências ou evidências do atendimento..."} />{item.status === "pendencia_externa" && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Item aguardando terceiros — não afeta a produtividade, mas deve ser cobrado do agente externo.</p>}</div></div>)}
                <div className="space-y-2"><Label>Observação geral da competência</Label><Textarea value={execucao.observacao_geral || ""} onChange={(event) => atualizarObservacaoGeral(execucao.id, event.target.value)} placeholder="Resumo opcional do atendimento mensal..." /></div>
                <div className="flex justify-end"><Button onClick={() => salvar(execucao)} disabled={savingId === execucao.id}>{savingId === execucao.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar checklist</Button></div>
              </CardContent></CollapsibleContent>
            </Card>
          </Collapsible>
        })}
        <ListPagination
          page={checklistsPagination.page}
          pageSize={checklistsPagination.pageSize}
          totalItems={checklistsPagination.totalItems}
          onPageChange={checklistsPagination.setPage}
          onPageSizeChange={checklistsPagination.setPageSize}
          itemLabel="checklists"
          className="rounded-lg border bg-card"
        />
      </div>}
    </div>
  )
}
