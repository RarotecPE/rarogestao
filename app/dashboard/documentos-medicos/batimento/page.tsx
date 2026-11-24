"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfYear,
  endOfYear,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Stethoscope,
  Search,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  XCircle,
  Filter,
  MessageSquare,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useSession } from "@/lib/auth-context"
import { isGestor } from "@/lib/permissions"
import {
  isTipoMedico,
  toYMD,
  LABEL_TIPO_MEDICO,
  type DocumentoMedico,
} from "@/lib/documentos-medicos"
import { DocumentoMedicoDetalhe } from "@/components/documento-medico-detalhe"
import { ListPagination, usePagination } from "@/components/list-pagination"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface AgendaEvento {
  id: number
  titulo: string
  tipo: string
  data_inicio: string
  tecnico_rarotec_id: number
  tecnico_id?: number
  tecnico_nome: string
}

export default function BatimentoMedicoPage() {
  const { user } = useSession()
  const userIsGestor = user?.nome ? isGestor(user.nome, user.cargo) : false

  const [periodoFilter, setPeriodoFilter] = useState("ano")
  const [tecnicoFilter, setTecnicoFilter] = useState("all")
  const [tipoFilter, setTipoFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [docSelecionado, setDocSelecionado] = useState<DocumentoMedico | null>(null)
  const [detalheOpen, setDetalheOpen] = useState(false)

  const periodoBusca = useMemo(() => {
    const hoje = new Date()
    switch (periodoFilter) {
      case "semana":
        return {
          inicio: format(startOfWeek(hoje, { weekStartsOn: 0 }), "yyyy-MM-dd"),
          fim: format(endOfWeek(hoje, { weekStartsOn: 0 }), "yyyy-MM-dd"),
        }
      case "ano":
        return {
          inicio: format(startOfYear(hoje), "yyyy-MM-dd"),
          fim: format(endOfYear(hoje), "yyyy-MM-dd"),
        }
      case "mes":
      default:
        return {
          inicio: format(startOfMonth(hoje), "yyyy-MM-dd"),
          fim: format(endOfMonth(hoje), "yyyy-MM-dd"),
        }
    }
  }, [periodoFilter])

  const {
    data: agendaEventos,
    isLoading: loadingAgenda,
    mutate: mutateAgenda,
  } = useSWR<AgendaEvento[]>(
    `/api/agenda?data_inicio=${periodoBusca.inicio}&data_fim=${periodoBusca.fim}`,
    fetcher,
  )
  const { data: documentos, isLoading: loadingDocs, mutate: mutateDocumentos } = useSWR<DocumentoMedico[]>(
    "/api/documentos-medicos",
    fetcher,
  )
  const { data: tecnicos } = useSWR<{ id: number; nome: string }[]>("/api/tecnicos-rarotec", fetcher)

  const isLoading = loadingAgenda || loadingDocs

  const batimentoData = useMemo(() => {
    if (!agendaEventos || !documentos) return []
    // Ids de documentos ja associados a um evento no periodo (para nao duplicar)
    const docsUsados = new Set<number>()
    // Eventos medicos (licenca, atestado, consulta) exigem documentacao
    // independentemente de a data ser passada ou futura.
    const linhasAgenda = agendaEventos
      .filter((ev) => isTipoMedico(ev.tipo))
      .map((ev) => {
        const tecnicoId = ev.tecnico_rarotec_id || ev.tecnico_id || 0
        const dataISO = toYMD(ev.data_inicio)
        // Documento com anexo (nao recusado) que cobre a data
        const docCobertura = documentos.find(
          (d) =>
            d.tecnico_rarotec_id === tecnicoId &&
            !!d.blob_pathname &&
            d.status_validacao !== "recusado" &&
            toYMD(d.data_inicio) <= dataISO &&
            toYMD(d.data_fim) >= dataISO,
        )
        // Documento recusado que cobre (para exibir o estado recusado)
        const docRecusado = documentos.find(
          (d) =>
            d.tecnico_rarotec_id === tecnicoId &&
            !!d.blob_pathname &&
            d.status_validacao === "recusado" &&
            toYMD(d.data_inicio) <= dataISO &&
            toYMD(d.data_fim) >= dataISO,
        )
        const doc = docCobertura || docRecusado
        if (doc) docsUsados.add(doc.id)
        // status: sem_documento | pendente (aguardando validacao) | validado | recusado
        let status: string
        if (!doc) status = "sem_documento"
        else status = doc.status_validacao || "pendente"
        return {
          ...ev,
          id: `ev-${ev.id}`,
          tecnicoId,
          dataISO,
          dataFimISO: dataISO,
          status,
          doc,
          foraDoPeriodo: false,
        }
      })

    // Documentos que exigem acao do gestor mas cujo evento ainda nao esta na agenda
    // ou esta fora do periodo filtrado. Eles nao podem "sumir" do batimento.
    const statusQueExigemAcao = ["pendente", "aguardando_tecnico", "recusado"]
    const linhasOrfas = documentos
      .filter(
        (d) =>
          !!d.blob_pathname &&
          !docsUsados.has(d.id) &&
          statusQueExigemAcao.includes(d.status_validacao || "pendente"),
      )
      .map((d) => {
        const tecnicoNome =
          tecnicos?.find((t) => t.id === d.tecnico_rarotec_id)?.nome || d.tecnico_nome || "—"
        const dataISO = toYMD(d.data_inicio)
        const dataFimISO = toYMD(d.data_fim) || dataISO
        const foraDoPeriodo =
          dataFimISO < periodoBusca.inicio || dataISO > periodoBusca.fim
        return {
          id: `doc-${d.id}`,
          tipo: d.tipo,
          tecnico_nome: tecnicoNome,
          tecnicoId: d.tecnico_rarotec_id,
          dataISO,
          dataFimISO,
          data_inicio: d.data_inicio,
          status: d.status_validacao || "pendente",
          doc: d,
          foraDoPeriodo,
        }
      })

    return [...linhasAgenda, ...linhasOrfas].sort((a, b) => (a.dataISO < b.dataISO ? 1 : -1))
  }, [agendaEventos, documentos, tecnicos, periodoBusca])

  // Prioridade de ordenacao: itens que exigem acao primeiro, validados por ultimo
  const prioridadeStatus: Record<string, number> = {
    pendente: 0, // aguardando validacao do gestor
    sem_documento: 1, // pendencia critica
    recusado: 2,
    aguardando_tecnico: 3, // correcao solicitada (bola com o tecnico)
    validado: 4, // ja resolvido, vai para o fim
  }

  const dadosFiltrados = useMemo(() => {
    return batimentoData
      .filter((item) => {
        const matchTecnico = tecnicoFilter === "all" || String(item.tecnicoId) === tecnicoFilter
        const matchTipo = tipoFilter === "all" || item.tipo === tipoFilter
        const matchStatus = statusFilter === "all" || item.status === statusFilter
        const termo = searchTerm.toLowerCase()
        const matchSearch =
          !termo ||
          item.tecnico_nome?.toLowerCase().includes(termo) ||
          (LABEL_TIPO_MEDICO[item.tipo] || item.tipo).toLowerCase().includes(termo)
        return matchTecnico && matchTipo && matchStatus && matchSearch
      })
      .sort((a, b) => {
        const pa = prioridadeStatus[a.status] ?? 9
        const pb = prioridadeStatus[b.status] ?? 9
        if (pa !== pb) return pa - pb
        // dentro do mesmo status, mais recente primeiro
        return a.dataISO < b.dataISO ? 1 : -1
      })
  }, [batimentoData, tecnicoFilter, tipoFilter, statusFilter, searchTerm])

  const stats = useMemo(() => {
    const total = batimentoData.length
    const validados = batimentoData.filter((d) => d.status === "validado").length
    const aguardando = batimentoData.filter((d) => d.status === "pendente").length
    const pendencias = batimentoData.filter(
      (d) => d.status === "sem_documento" || d.status === "recusado",
    ).length
    const taxa = total > 0 ? Math.round((validados / total) * 100) : 0
    return { total, validados, aguardando, pendencias, taxa }
  }, [batimentoData])

  const batimentoPagination = usePagination(dadosFiltrados, {
    initialPageSize: 20,
    resetKey: `${periodoFilter}|${tecnicoFilter}|${tipoFilter}|${statusFilter}|${searchTerm}`,
  })

  const formatarData = (v: string) => {
    try {
      return format(new Date(v + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
    } catch {
      return v
    }
  }

  if (!userIsGestor) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
        <ShieldAlert className="mb-4 h-16 w-16 text-amber-500" />
        <h1 className="mb-2 text-2xl font-semibold text-foreground">Acesso Restrito</h1>
        <p className="max-w-md text-center text-muted-foreground">
          Apenas coordenadores, gerentes e diretores podem acessar o batimento médico.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Stethoscope className="h-6 w-6 text-primary" />
          Batimento Médico
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conferência de eventos médicos da agenda contra os documentos anexados
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total de dias</p>
            <p className="mt-1 text-2xl font-semibold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Validados</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-600">{stats.validados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Aguardando validação</p>
            <p className="mt-1 text-2xl font-semibold text-amber-600">{stats.aguardando}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pendências</p>
            <p className="mt-1 text-2xl font-semibold text-red-600">{stats.pendencias}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative flex-1 lg:min-w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por técnico ou tipo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={periodoFilter} onValueChange={setPeriodoFilter}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semana">Esta semana</SelectItem>
            <SelectItem value="mes">Este mês</SelectItem>
            <SelectItem value="ano">Este ano</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tecnicoFilter} onValueChange={setTecnicoFilter}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="Todos os técnicos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os técnicos</SelectItem>
            {tecnicos?.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="atestado">Atestado Médico</SelectItem>
            <SelectItem value="consulta_medica">Consulta Médica</SelectItem>
            <SelectItem value="licenca_medica">Licença Médica</SelectItem>
            <SelectItem value="licenca_maternidade">Licença Maternidade</SelectItem>
            <SelectItem value="licenca_paternidade">Licença Paternidade</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="validado">Validado</SelectItem>
            <SelectItem value="pendente">Aguardando validação</SelectItem>
            <SelectItem value="aguardando_tecnico">Correção solicitada</SelectItem>
            <SelectItem value="sem_documento">Sem documento</SelectItem>
            <SelectItem value="recusado">Recusado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : dadosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Filter className="h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhum evento médico no período selecionado
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batimentoPagination.paginatedItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      <div className="flex flex-col">
                        <span>
                          {formatarData(item.dataISO)}
                          {item.dataFimISO && item.dataFimISO !== item.dataISO
                            ? ` a ${formatarData(item.dataFimISO)}`
                            : ""}
                        </span>
                        {item.foraDoPeriodo && (
                          <span className="text-xs font-normal text-muted-foreground">
                            fora do período
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{item.tecnico_nome}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{LABEL_TIPO_MEDICO[item.tipo] || item.tipo}</Badge>
                    </TableCell>
                    <TableCell>
                      {item.status === "validado" ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          Validado
                        </span>
                      ) : item.status === "pendente" ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
                          <Clock className="h-4 w-4" />
                          Aguardando validação
                        </span>
                      ) : item.status === "aguardando_tecnico" ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700">
                          <MessageSquare className="h-4 w-4" />
                          Correção solicitada
                        </span>
                      ) : item.status === "recusado" ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700">
                          <XCircle className="h-4 w-4" />
                          Recusado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700">
                          <AlertTriangle className="h-4 w-4" />
                          Sem documento
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.doc ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDocSelecionado({ ...item.doc!, tecnico_nome: item.tecnico_nome })
                            setDetalheOpen(true)
                          }}
                        >
                          Analisar
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && dadosFiltrados.length > 0 && (
            <ListPagination
              page={batimentoPagination.page}
              pageSize={batimentoPagination.pageSize}
              totalItems={batimentoPagination.totalItems}
              onPageChange={batimentoPagination.setPage}
              onPageSizeChange={batimentoPagination.setPageSize}
              itemLabel="registros"
            />
          )}
        </CardContent>
      </Card>

      <DocumentoMedicoDetalhe
        documento={docSelecionado}
        open={detalheOpen}
        onOpenChange={setDetalheOpen}
        papel="gestor"
        onUpdated={() => {
          mutateDocumentos()
          mutateAgenda()
        }}
      />
    </div>
  )
}
