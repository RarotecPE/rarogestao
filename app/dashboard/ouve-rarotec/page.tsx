"use client"

import useSWR from "swr"
import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MessagesSquare, Plus, Search, EyeOff, Lock, User, Paperclip, CalendarClock } from "lucide-react"
import { OuveNovaManifestacaoDialog } from "@/components/ouve-nova-manifestacao-dialog"
import { OuveDetalheDialog } from "@/components/ouve-detalhe-dialog"
import { ListPagination, usePagination } from "@/components/list-pagination"
import { STATUS_OUVE, labelSigilo, rotuloCodigo, type OuveManifestacao } from "@/lib/ouve-rarotec"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface BoardResponse {
  ativo: boolean
  manifestacoes: OuveManifestacao[]
  isGestor?: boolean
}

export default function OuveRarotecPage() {
  const { data, mutate, isLoading } = useSWR<BoardResponse>("/api/ouve/manifestacoes", fetcher)
  const { data: setoresData } = useSWR<string[]>("/api/setores", fetcher)
  const [novaOpen, setNovaOpen] = useState(false)
  const [detalheId, setDetalheId] = useState<number | null>(null)
  const [detalheOpen, setDetalheOpen] = useState(false)
  const [busca, setBusca] = useState("")
  const [filtroTipo, setFiltroTipo] = useState("all")
  const [filtroStatus, setFiltroStatus] = useState("all")

  const isGestor = data?.isGestor ?? false
  const ativo = data?.ativo ?? false

  const manifestacoes = useMemo(() => {
    let lista = data?.manifestacoes ?? []
    if (filtroTipo !== "all") lista = lista.filter((m) => m.tipo_sigilo === filtroTipo)
    if (filtroStatus !== "all") lista = lista.filter((m) => m.status === filtroStatus)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      lista = lista.filter(
        (m) =>
          m.codigo.toLowerCase().includes(q) ||
          m.natureza.toLowerCase().includes(q) ||
          (m.autor_nome || "").toLowerCase().includes(q) ||
          m.mensagem.toLowerCase().includes(q),
      )
    }
    return lista
  }, [data, filtroTipo, filtroStatus, busca])

  const manifestacoesPagination = usePagination(manifestacoes, {
    initialPageSize: 12,
    pageSizeOptions: [12, 24, 48, 96],
    resetKey: `${filtroTipo}|${filtroStatus}|${busca}`,
  })

  function abrirDetalhe(id: number) {
    setDetalheId(id)
    setDetalheOpen(true)
  }

  if (!isLoading && !ativo) {
    return (
      <div className="p-6 lg:p-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MessagesSquare className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">OuveRarotec indisponível</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                O canal ainda não foi ativado. Procure a coordenação ou gerência.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <MessagesSquare className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">OuveRarotec</h1>
            <p className="text-sm text-muted-foreground">
              Canal de manifestações eletrônicas — sua voz melhora a Rarotec
            </p>
          </div>
        </div>
        <Button onClick={() => setNovaOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova manifestação
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, natureza, mensagem…"
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as identificações</SelectItem>
            <SelectItem value="identificavel_aberta">Identificável e Aberta</SelectItem>
            <SelectItem value="identificavel_sigilosa">Identificável e Sigilosa</SelectItem>
            <SelectItem value="anonima">Anônima</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="aberta">Aberta</SelectItem>
            <SelectItem value="em_analise">Em análise</SelectItem>
            <SelectItem value="respondida">Respondida</SelectItem>
            <SelectItem value="encerrada">Encerrada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quadro */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : manifestacoes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma manifestação encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {manifestacoesPagination.paginatedItems.map((m) => {
            const status = STATUS_OUVE[m.status]
            const anonima = m.tipo_sigilo === "anonima"
            const semId = !m.autor_nome
            return (
              <button
                key={m.id}
                onClick={() => abrirDetalhe(m.id)}
                className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">{m.codigo}</span>
                  {status && (
                    <Badge variant="outline" className={status.badge}>
                      {status.label}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-xs">
                    {m.natureza}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {m.categoria}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{m.mensagem}</p>
                <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-1">
                    {anonima ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5 shrink-0" /> Anônima
                      </>
                    ) : semId ? (
                      <>
                        <Lock className="h-3.5 w-3.5 shrink-0" /> Sigilosa
                      </>
                    ) : (
                      <>
                        <User className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{m.autor_nome}</span>
                      </>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {new Date(m.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
        <ListPagination
          page={manifestacoesPagination.page}
          pageSize={manifestacoesPagination.pageSize}
          totalItems={manifestacoesPagination.totalItems}
          onPageChange={manifestacoesPagination.setPage}
          onPageSizeChange={manifestacoesPagination.setPageSize}
          pageSizeOptions={manifestacoesPagination.pageSizeOptions}
          itemLabel="manifestações"
          className="rounded-lg border bg-card"
        />
        </div>
      )}

      <OuveNovaManifestacaoDialog
        open={novaOpen}
        onOpenChange={setNovaOpen}
        setores={setoresData ?? []}
        onCreated={() => mutate()}
      />
      <OuveDetalheDialog
        manifestacaoId={detalheId}
        open={detalheOpen}
        onOpenChange={setDetalheOpen}
        isGestor={isGestor}
        onChanged={() => mutate()}
      />
    </div>
  )
}
