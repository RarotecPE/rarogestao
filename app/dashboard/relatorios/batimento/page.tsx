"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, isWeekend, parseISO, isSameDay, startOfWeek, endOfWeek, startOfYear, endOfYear, isWithinInterval } from "date-fns"
import { ptBR } from "date-fns/locale"

import { 
  FileText, 
  Search, 
  CheckCircle2,
  XCircle,
  Calendar,
  AlertTriangle,
  Users,
  MapPin,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  Building2,
  User,
  FileCheck,
  FileX,
  TrendingUp,
  BarChart3,
  ShieldCheck,
  ShieldAlert,
  Link2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSession } from "@/lib/auth-context"
import { RelatorioView } from "../relatorio-view"
import { ListPagination, usePagination } from "@/components/list-pagination"
import { isGestor } from "@/lib/permissions"
import { calcularGruposRelatorio, chaveParFixo, type EventoAgrupavel } from "@/lib/relatorio-grupos"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

// Helper para obter nome + sobrenome (evita duplicatas como "Felipe" e "Felipe")
const getNomeSobrenome = (nomeCompleto: string) => {
  const partes = nomeCompleto.trim().split(" ")
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[partes.length - 1]}`
}

// Função para normalizar string removendo acentos e convertendo para minúsculo
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .trim()
}

interface AgendaEvento {
  id: number
  titulo: string
  data_inicio: string
  data_fim: string
  tecnico_id: number
  tecnico_rarotec_id: number
  tecnico_nome: string
  cliente_id: number
  cliente_nome: string
  local: string  // campo real da tabela
  municipio?: string // alias para compatibilidade
  tipo: string
  status: string
  relatorio_grupo_id?: string | null
}

interface Relatorio {
  id: number
  data_visita: string
  data_relatorio: string
  tecnico_id: number
  tecnico_nome: string
  tecnico_rarotec_id?: number
  cliente_id: number
  cliente_nome: string
  municipio: string
  status: string
  numero_autenticacao: string
  tecnicos_rarotec_ids?: number[] | string
  tecnicos_rarotec?: { id: number; nome: string; email: string }[]
  tecnicos_rarotec_nomes?: { id: number; nome: string; email: string }[]
}

interface Tecnico {
  id: number
  nome: string
  email: string
  cargo: string
}

export default function BatimentoPage() {
  const { user } = useSession()
  const userIsGestor = user?.nome ? isGestor(user.nome, user.cargo) : false
  
  const [mesReferencia, setMesReferencia] = useState<Date>(new Date())
  const [tecnicoFilter, setTecnicoFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [municipioFilter, setMunicipioFilter] = useState<string>("all")
  const [clienteFilter, setClienteFilter] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  
  // Filtros de data
  const [periodoFilter, setPeriodoFilter] = useState<string>("mes") // mes, hoje, semana, ano, personalizado
  const [dataInicio, setDataInicio] = useState<Date | undefined>(undefined)
  const [dataFim, setDataFim] = useState<Date | undefined>(undefined)
  
  // Modal de visualização do relatório
  const [relatorioSelecionado, setRelatorioSelecionado] = useState<any>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  
  // Estado para controlar qual popover de abono está aberto
  const [abonarPopoverOpen, setAbonarPopoverOpen] = useState<number | null>(null)
  const [desabonarPopoverOpen, setDesabonarPopoverOpen] = useState<number | null>(null)
  
  // Estado para abonos - carregado do banco de dados
  const { data: abonosDb, mutate: mutateAbonos } = useSWR<{ agenda_evento_id: number; tecnico_id: number; motivo: string }[]>(
    '/api/agenda-abonos',
    fetcher
  )
  
  // Converter abonos do banco para o formato de mapa
  const abonos = useMemo(() => {
    if (!abonosDb) return {}
    return abonosDb.reduce((acc, abono) => {
      acc[`${abono.agenda_evento_id}-${abono.tecnico_id}`] = abono.motivo
      return acc
    }, {} as Record<string, string>)
  }, [abonosDb])
  
  // Função para salvar abono no banco
  const salvarAbono = async (agendaEventoId: number, tecnicoId: number, motivo: string) => {
    try {
      await fetch('/api/agenda-abonos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agenda_evento_id: agendaEventoId,
          tecnico_id: tecnicoId,
          motivo
        })
      })
      mutateAbonos()
    } catch (error) {
      console.error("Erro ao salvar abono:", error)
    }
  }

  // Função para remover abono (desabonar)
  const removerAbono = async (agendaEventoId: number, tecnicoId: number) => {
    try {
      await fetch(`/api/agenda-abonos?agenda_evento_id=${agendaEventoId}&tecnico_id=${tecnicoId}`, {
        method: 'DELETE'
      })
      mutateAbonos()
    } catch (error) {
      console.error("Erro ao remover abono:", error)
    }
  }

  // Calcular período de busca baseado no filtro selecionado
  const periodoBusca = useMemo(() => {
    const hoje = new Date()
    switch (periodoFilter) {
      case "hoje":
        return { inicio: format(hoje, "yyyy-MM-dd"), fim: format(hoje, "yyyy-MM-dd") }
      case "semana":
        const inicioSemana = startOfWeek(hoje, { weekStartsOn: 0 })
        const fimSemana = endOfWeek(hoje, { weekStartsOn: 0 })
        return { inicio: format(inicioSemana, "yyyy-MM-dd"), fim: format(fimSemana, "yyyy-MM-dd") }
      case "ano":
        const inicioAno = startOfYear(hoje)
        return { inicio: format(inicioAno, "yyyy-MM-dd"), fim: format(hoje, "yyyy-MM-dd") }
      case "personalizado":
        if (dataInicio && dataFim) {
          return { inicio: format(dataInicio, "yyyy-MM-dd"), fim: format(dataFim, "yyyy-MM-dd") }
        }
        // Fallback para o mês se não tiver datas personalizadas
        return { inicio: format(startOfMonth(mesReferencia), "yyyy-MM-dd"), fim: format(endOfMonth(mesReferencia), "yyyy-MM-dd") }
      case "mes":
      default:
        return { inicio: format(startOfMonth(mesReferencia), "yyyy-MM-dd"), fim: format(endOfMonth(mesReferencia), "yyyy-MM-dd") }
    }
  }, [periodoFilter, mesReferencia, dataInicio, dataFim])

  // Buscar dados com período dinâmico
  const { data: agendaEventos, isLoading: loadingAgenda } = useSWR<AgendaEvento[]>(
    `/api/agenda?data_inicio=${periodoBusca.inicio}&data_fim=${periodoBusca.fim}`,
    fetcher
  )
  const { data: relatorios, isLoading: loadingRelatorios } = useSWR<Relatorio[]>(
    `/api/relatorios?data_inicio=${periodoBusca.inicio}&data_fim=${periodoBusca.fim}`,
    fetcher
  )
  const { data: tecnicos } = useSWR<Tecnico[]>("/api/tecnicos-rarotec", fetcher)
  // Pares fixos (tecnico <-> cliente) para relatorio semanal unico
  const { data: paresFixos } = useSWR<{ tecnico_rarotec_id: number; cliente_id: number }[]>(
    "/api/tecnico-clientes-fixos",
    fetcher
  )
  const paresFixosSet = useMemo(() => {
    const s = new Set<string>()
    ;(paresFixos || []).forEach((p) => s.add(chaveParFixo(p.tecnico_rarotec_id, p.cliente_id)))
    return s
  }, [paresFixos])

  const isLoading = loadingAgenda || loadingRelatorios

  // Calcular período do mês
  const inicioMes = startOfMonth(mesReferencia)
  const fimMes = endOfMonth(mesReferencia)
  const diasUteis = eachDayOfInterval({ start: inicioMes, end: fimMes })
    .filter(dia => !isWeekend(dia))

  // Cruzar agenda com relatórios - CORRIGIDO para verificar tecnicos_rarotec_ids
  const batimentoData = useMemo(() => {
    if (!agendaEventos || !relatorios) return []

    // Data de hoje no formato YYYY-MM-DD para comparação segura
    const hoje = new Date()
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

    // Funcao para extrair municipio do evento
    // Prioriza a CIDADE do cliente (fonte confiavel), depois o campo local, depois o titulo
    const extrairMunicipio = (evento: AgendaEvento): string => {
      // 1) Cidade do cliente vinculado (mais confiavel)
      const cidadeCliente = (evento as any).cliente_cidade
      if (cidadeCliente) {
        return cidadeCliente
      }
      // 2) Campo local
      if (evento.local) {
        return evento.local
      }
      // 3) Extrair do titulo (formato: "Tipo - Municipio/UF")
      if (evento.titulo && evento.titulo.includes(' - ')) {
        const partes = evento.titulo.split(' - ')
        if (partes.length >= 2) {
          return partes.slice(1).join(' - ') // Pega tudo depois do primeiro " - "
        }
      }
      return ''
    }

    // Remove separadores (-, _, espaco, ponto) e acentos para comparar tipos de forma robusta.
    // O tipo gravado no banco pode vir como 'home_office', 'home-office' ou 'homeoffice';
    // todos devem ser reconhecidos como internos (nao exigem relatorio).
    const normalizarTipo = (s: string) =>
      String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_.-]/g, '')

    // Predicado: o evento exige relatorio? (sem considerar data futura)
    const exigeRelatorio = (evento: AgendaEvento): boolean => {
      const tipoNorm = normalizarTipo(evento.tipo || '')
      const tituloEvento = (evento.titulo || '').toLowerCase()
      const tiposInternos = ['interno', 'folga', 'ferias', 'atestado', 'consulta_medica', 'consulta medica', 'consulta', 'escritorio', 'home-office', 'homeoffice', 'lic. maternidade', 'lic. paternidade', 'licenca_maternidade', 'licenca_paternidade', 'licenca medica', 'suspensao', 'indisponivel', 'feriado']
      if (tiposInternos.some(t => { const tn = normalizarTipo(t); return tipoNorm.includes(tn) || tipoNorm === tn })) return false
      const titulosInternos = ['home-office', 'home office', 'homeoffice', 'escritorio', 'escritório', 'folga', 'férias', 'ferias', 'atestado', 'consulta médica', 'consulta medica', 'lic. maternidade', 'lic. paternidade', 'licença maternidade', 'licenca maternidade', 'licença paternidade', 'licenca paternidade', 'licenca medica', 'licença médica', 'suspensao', 'suspensão', 'indisponivel', 'indisponível', 'feriado']
      if (titulosInternos.some(t => tituloEvento === t || tituloEvento.startsWith(t))) return false
      if (!evento.cliente_id && !evento.local && !evento.municipio) {
        const tiposExternos = ['visita', 'treinamento', 'reuniao', 'implantacao', 'processo_licitatorio']
        if (!tiposExternos.some(t => tipoNorm.includes(normalizarTipo(t)))) return false
      }
      return true
    }

    // Encontra o relatorio correspondente a um evento (mesma data, municipio e tecnico)
    const encontrarRelatorio = (evento: AgendaEvento): Relatorio | undefined => {
      const dataEvento = evento.data_inicio.split('T')[0]
      const municipioEvento = extrairMunicipio(evento)
      return relatorios.find(rel => {
        const dataRelatorio = (rel.data_visita || rel.data_relatorio || '').split('T')[0]
        if (dataRelatorio !== dataEvento) return false
        const municipioEventoNome = normalizeString(municipioEvento.split('/')[0])
        const municipioRelatorioNome = normalizeString((rel.municipio || '').split('/')[0])
        const mesmoMunicipio = municipioEventoNome && municipioRelatorioNome &&
          (municipioRelatorioNome.includes(municipioEventoNome) || municipioEventoNome.includes(municipioRelatorioNome))
        if (!mesmoMunicipio) return false
        let tecnicoNoRelatorio = false
        const tecnicoId = evento.tecnico_rarotec_id || evento.tecnico_id
        if (rel.tecnicos_rarotec_ids) {
          let ids: number[] = []
          try {
            ids = typeof rel.tecnicos_rarotec_ids === 'string'
              ? JSON.parse(rel.tecnicos_rarotec_ids)
              : rel.tecnicos_rarotec_ids
          } catch { ids = [] }
          tecnicoNoRelatorio = Array.isArray(ids) && ids.includes(tecnicoId)
        }
        if (!tecnicoNoRelatorio && rel.tecnicos_rarotec_nomes && Array.isArray(rel.tecnicos_rarotec_nomes)) {
          tecnicoNoRelatorio = rel.tecnicos_rarotec_nomes.some((t: any) => t.id === tecnicoId)
        }
        if (!tecnicoNoRelatorio && rel.tecnicos_rarotec && Array.isArray(rel.tecnicos_rarotec)) {
          tecnicoNoRelatorio = rel.tecnicos_rarotec.some((t: any) => t.id === tecnicoId)
        }
        if (!tecnicoNoRelatorio) {
          tecnicoNoRelatorio = rel.tecnico_rarotec_id === tecnicoId
        }
        return tecnicoNoRelatorio
      })
    }

    // TODOS os eventos que exigem relatorio (inclui dias futuros p/ calcular o grupo)
    const eventosComRelatorio = agendaEventos.filter(exigeRelatorio)

    // Mapa eventoId -> relatorio correspondente (para status e para o grupo)
    const relatorioPorEvento = new Map<number, Relatorio | undefined>()
    eventosComRelatorio.forEach(ev => relatorioPorEvento.set(ev.id, encontrarRelatorio(ev)))

    // Cobertura por municipio: se UMA visita do mesmo tecnico+municipio+dia tem relatorio,
    // todas as visitas daquele municipio no mesmo dia sao consideradas cobertas (1 relatorio serve).
    const chaveMunicipioDia = (ev: AgendaEvento) => {
      const tecnicoId = ev.tecnico_rarotec_id || ev.tecnico_id
      const data = ev.data_inicio.split('T')[0]
      const municipio = normalizeString(extrairMunicipio(ev).split('/')[0])
      return `${tecnicoId}__${data}__${municipio}`
    }
    const relatorioPorMunicipioDia = new Map<string, Relatorio>()
    eventosComRelatorio.forEach(ev => {
      const rel = relatorioPorEvento.get(ev.id)
      const municipio = normalizeString(extrairMunicipio(ev).split('/')[0])
      if (rel && municipio) {
        relatorioPorMunicipioDia.set(chaveMunicipioDia(ev), rel)
      }
    })

    // Evento satisfeito = tem relatorio proprio OU coberto pelo municipio/dia
    const eventoSatisfeito = (ev: AgendaEvento): boolean =>
      !!relatorioPorEvento.get(ev.id) || relatorioPorMunicipioDia.has(chaveMunicipioDia(ev))
    const idsSatisfeitos = new Set<number>()
    eventosComRelatorio.forEach(ev => { if (eventoSatisfeito(ev)) idsSatisfeitos.add(ev.id) })

    // Calcular os grupos (fixo/esporadico/individual) e o status de cada evento
    const eventosAgrupaveis: EventoAgrupavel[] = eventosComRelatorio.map(ev => ({
      id: ev.id,
      tecnicoId: ev.tecnico_rarotec_id || ev.tecnico_id,
      clienteId: ev.cliente_id ?? null,
      data: ev.data_inicio.split('T')[0],
      relatorioGrupoId: ev.relatorio_grupo_id ?? null,
    }))
    const gruposMap = calcularGruposRelatorio({
      eventos: eventosAgrupaveis,
      paresFixos: paresFixosSet,
      temRelatorio: (id) => idsSatisfeitos.has(id),
      hojeStr,
    })

    const resultadoFinal = eventosComRelatorio
      .filter(evento => evento.data_inicio.split('T')[0] <= hojeStr) // exibir apenas passado/hoje
      .map(evento => {
        const dataEvento = evento.data_inicio.split('T')[0]
        const municipioEvento = extrairMunicipio(evento)
        const relatorioCorrespondente = relatorioPorEvento.get(evento.id)
        // Relatorio de outra visita no mesmo municipio/dia (1 relatorio cobre o municipio)
        const relatorioCoberturaMunicipio = !relatorioCorrespondente
          ? relatorioPorMunicipioDia.get(chaveMunicipioDia(evento))
          : undefined
        const relatorioEfetivo = relatorioCorrespondente || relatorioCoberturaMunicipio

        // Verificar se foi abonado
        const abonoKey = `${evento.id}-${evento.tecnico_rarotec_id || evento.tecnico_id}`
        const foiAbonado = !!abonos[abonoKey]

        // Status considerando o agrupamento (relatorio unico)
        const grupo = gruposMap.get(evento.id)
        let status: string
        if (relatorioEfetivo) {
          // Tem relatorio proprio OU coberto por outra visita do mesmo municipio/dia
          status = 'ok'
        } else if (foiAbonado) {
          status = 'abonado'
        } else if (grupo && grupo.grupoTipo !== 'individual' && grupo.status === 'ok') {
          // Outro dia do mesmo grupo ja tem o relatorio
          status = 'ok'
        } else if (grupo && grupo.status === 'agrupado') {
          status = 'agrupado' // dia intermediario, cobranca so no ultimo dia
        } else if (grupo && grupo.status === 'aguardando') {
          status = 'agrupado' // dia de cobranca ainda nao chegou
        } else {
          status = 'pendente'
        }

        return {
          ...evento,
          municipio: municipioEvento,
          dataFormatada: dataEvento,
          temRelatorio: !!relatorioEfetivo,
          relatorio: relatorioEfetivo || null,
          coberturaMunicipio: !!relatorioCoberturaMunicipio,
          status,
          abonado: foiAbonado,
          motivoAbono: abonos[abonoKey] || null,
          // Info de agrupamento para exibicao
          grupoTipo: grupo?.grupoTipo || 'individual',
          grupoDueDate: grupo?.dueDate || dataEvento,
          grupoIsDueDay: grupo?.isDueDay ?? true,
          grupoTamanho: grupo?.tamanhoGrupo || 1,
        }
      })
    return resultadoFinal
  }, [agendaEventos, relatorios, abonos, paresFixosSet])

  // Filtrar dados
  const dadosFiltrados = useMemo(() => {
    return batimentoData.filter(item => {
      const tecnicoId = item.tecnico_rarotec_id || item.tecnico_id
      const matchesTecnico = tecnicoFilter === "all" || 
        tecnicoId?.toString() === tecnicoFilter ||
        item.tecnico_nome?.toLowerCase().includes(tecnicoFilter.toLowerCase())
      
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "ok" && item.status === 'ok') ||
        (statusFilter === "pendente" && item.status === 'pendente') ||
        (statusFilter === "abonado" && item.status === 'abonado') ||
        (statusFilter === "agrupado" && item.status === 'agrupado')
      
      const matchesMunicipio = municipioFilter === "all" ||
        item.municipio?.toLowerCase() === municipioFilter.toLowerCase()
      
      const matchesCliente = clienteFilter === "all" ||
        item.cliente_nome?.toLowerCase() === clienteFilter.toLowerCase()
      
      const matchesSearch = !searchTerm || 
        item.tecnico_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.municipio?.toLowerCase().includes(searchTerm.toLowerCase())

      // Filtro de data
      const dataStr = item.dataFormatada || item.data_inicio?.split('T')[0]
      if (!dataStr) return false
      const itemDate = parseISO(dataStr)
      const hoje = new Date()
      let matchesData = true
      
      switch (periodoFilter) {
        case "hoje":
          matchesData = isSameDay(itemDate, hoje)
          break
        case "semana":
          matchesData = isWithinInterval(itemDate, {
            start: startOfWeek(hoje, { weekStartsOn: 0 }),
            end: endOfWeek(hoje, { weekStartsOn: 0 })
          })
          break
        case "mes":
          matchesData = isWithinInterval(itemDate, {
            start: startOfMonth(mesReferencia),
            end: endOfMonth(mesReferencia)
          })
          break
        case "ano":
          matchesData = isWithinInterval(itemDate, {
            start: startOfYear(hoje),
            end: endOfYear(hoje)
          })
          break
        case "personalizado":
          if (dataInicio && dataFim) {
            matchesData = isWithinInterval(itemDate, { start: dataInicio, end: dataFim })
          } else if (dataInicio) {
            matchesData = itemDate >= dataInicio
          } else if (dataFim) {
            matchesData = itemDate <= dataFim
          }
          break
        default:
          matchesData = true
      }

      return matchesTecnico && matchesStatus && matchesMunicipio && matchesCliente && matchesSearch && matchesData
    })
  }, [batimentoData, tecnicoFilter, statusFilter, municipioFilter, clienteFilter, searchTerm, periodoFilter, mesReferencia, dataInicio, dataFim])

  // Estatísticas
  const stats = useMemo(() => {
    const total = batimentoData.length
    const comRelatorio = batimentoData.filter(b => b.status === 'ok').length
    const abonados = batimentoData.filter(b => b.status === 'abonado').length
    const agrupados = batimentoData.filter(b => b.status === 'agrupado').length
    const semRelatorio = batimentoData.filter(b => b.status === 'pendente').length
    // Taxa de conformidade ignora dias agrupados (ainda nao vencidos)
    const baseConformidade = total - agrupados
    const taxaConformidade = baseConformidade > 0 ? Math.round(((comRelatorio + abonados) / baseConformidade) * 100) : 0

    // Agrupar por técnico
    const porTecnico = batimentoData.reduce((acc, item) => {
      const nome = item.tecnico_nome || 'Não identificado'
      if (!acc[nome]) {
        acc[nome] = { total: 0, ok: 0, pendente: 0, abonado: 0, agrupado: 0 }
      }
      acc[nome].total++
      if (item.status === 'ok') {
        acc[nome].ok++
      } else if (item.status === 'abonado') {
        acc[nome].abonado++
      } else if (item.status === 'agrupado') {
        acc[nome].agrupado++
      } else {
        acc[nome].pendente++
      }
      return acc
    }, {} as Record<string, { total: number; ok: number; pendente: number; abonado: number; agrupado: number }>)

    // Lista de municípios únicos
    const municipios = [...new Set(batimentoData.map(item => item.municipio).filter(Boolean))]
    
    // Lista de clientes únicos
    const clientes = [...new Set(batimentoData.map(item => item.cliente_nome).filter(Boolean))]

    return { total, comRelatorio, semRelatorio, abonados, agrupados, taxaConformidade, porTecnico, municipios, clientes }
  }, [batimentoData])

  const batimentoPagination = usePagination(dadosFiltrados, {
    initialPageSize: 20,
    resetKey: `${tecnicoFilter}|${statusFilter}|${municipioFilter}|${clienteFilter}|${searchTerm}|${periodoFilter}|${mesReferencia.getTime()}|${dataInicio?.getTime() ?? ""}|${dataFim?.getTime() ?? ""}`,
  })

  // Navegar entre meses
  const mesAnterior = () => {
    setPeriodoFilter("mes")
    setMesReferencia(subMonths(mesReferencia, 1))
  }
  const mesProximo = () => {
    setPeriodoFilter("mes")
    setMesReferencia(new Date(mesReferencia.getFullYear(), mesReferencia.getMonth() + 1, 1))
  }

  // Verificar acesso (apos todos os hooks, para nao violar as Regras dos Hooks)
  if (!userIsGestor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <ShieldAlert className="h-16 w-16 text-amber-500 mb-4" />
        <h1 className="text-2xl font-semibold text-foreground mb-2">Acesso Restrito</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Apenas coordenadores, gerentes e diretores podem acessar a tela de Batimento.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Batimento de Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conferência entre agenda e relatórios emitidos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={mesAnterior}
            disabled={periodoFilter !== "mes"}
            title={periodoFilter !== "mes" ? "Navegação disponível apenas no filtro 'Este Mês'" : "Mês anterior"}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[180px]">
                <Calendar className="h-4 w-4 mr-2" />
                {periodoFilter === "ano" 
                  ? `Ano de ${format(new Date(), "yyyy")}`
                  : periodoFilter === "semana"
                  ? "Esta Semana"
                  : periodoFilter === "hoje"
                  ? format(new Date(), "dd/MM/yyyy")
                  : periodoFilter === "personalizado" && dataInicio && dataFim
                  ? `${format(dataInicio, "dd/MM")} - ${format(dataFim, "dd/MM")}`
                  : format(mesReferencia, "MMMM 'de' yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <CalendarComponent
                mode="single"
                selected={mesReferencia}
                onSelect={(date) => {
                  if (date) {
                    setPeriodoFilter("mes")
                    setMesReferencia(date)
                  }
                }}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={mesProximo}
            disabled={periodoFilter !== "mes"}
            title={periodoFilter !== "mes" ? "Navegação disponível apenas no filtro 'Este Mês'" : "Próximo mês"}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Agendamentos</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                <FileCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Com Relatório</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.comRelatorio}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
                <FileX className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Sem Relatório</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.semRelatorio}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 dark:bg-purple-500/15 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Conformidade</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.taxaConformidade}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 space-y-3">
          {/* Linha 1: Busca e Status */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por técnico, cliente, município..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-10">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="ok">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    Com Relatório
                  </span>
                </SelectItem>
                <SelectItem value="pendente">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    Sem Relatório
                  </span>
                </SelectItem>
                <SelectItem value="abonado">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-3 w-3 text-blue-500" />
                    Abonado
                  </span>
                </SelectItem>
                <SelectItem value="agrupado">
                  <span className="flex items-center gap-2">
                    <Link2 className="h-3 w-3 text-violet-500" />
                    Agrupado (Relatorio Unico)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Linha 2: Filtros de Período */}
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Período:</span>
            
            <Button
              variant={periodoFilter === "mes" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodoFilter("mes")}
            >
              Este Mês
            </Button>
            <Button
              variant={periodoFilter === "hoje" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodoFilter("hoje")}
            >
              Hoje
            </Button>
            <Button
              variant={periodoFilter === "semana" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodoFilter("semana")}
            >
              Esta Semana
            </Button>
            <Button
              variant={periodoFilter === "ano" ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodoFilter("ano")}
            >
              Este Ano
            </Button>
            
            {/* Período personalizado */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant={periodoFilter === "personalizado" ? "default" : "outline"} 
                  size="sm"
                  className="gap-2"
                >
                  <Filter className="h-3.5 w-3.5" />
                  {periodoFilter === "personalizado" && dataInicio && dataFim 
                    ? `${format(dataInicio, "dd/MM")} - ${format(dataFim, "dd/MM")}`
                    : periodoFilter === "personalizado" && dataInicio
                    ? `A partir de ${format(dataInicio, "dd/MM")}`
                    : "Personalizado"
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 border-b bg-muted/30">
                  <p className="text-sm font-medium">Selecione o período</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {dataInicio && dataFim 
                      ? `${format(dataInicio, "dd 'de' MMM", { locale: ptBR })} até ${format(dataFim, "dd 'de' MMM", { locale: ptBR })}`
                      : dataInicio 
                      ? `Início: ${format(dataInicio, "dd 'de' MMM", { locale: ptBR })} - Selecione o fim`
                      : "Clique na data inicial"
                    }
                  </p>
                </div>
                <CalendarComponent
                  mode="range"
                  selected={{ from: dataInicio, to: dataFim }}
                  onSelect={(range) => {
                    setDataInicio(range?.from)
                    setDataFim(range?.to)
                    if (range?.from) {
                      setPeriodoFilter("personalizado")
                    }
                  }}
                  locale={ptBR}
                  numberOfMonths={1}
                  className="p-3"
                />
                <div className="p-3 border-t flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => {
                      setDataInicio(undefined)
                      setDataFim(undefined)
                      setPeriodoFilter("mes")
                    }}
                  >
                    Limpar
                  </Button>
                  <Button 
                    size="sm" 
                    className="flex-1"
                    disabled={!dataInicio}
                    onClick={() => {
                      if (!dataFim && dataInicio) {
                        setDataFim(dataInicio)
                      }
                    }}
                  >
                    Aplicar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            
            {/* Resultado do filtro de data */}
            <span className="text-xs text-muted-foreground ml-2">
              {dadosFiltrados.length} registro(s) encontrado(s)
            </span>
          </div>
          
          {/* Linha 2: Filtros específicos */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={tecnicoFilter} onValueChange={setTecnicoFilter}>
              <SelectTrigger className="w-full sm:w-[200px] h-10">
                <User className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Técnico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Técnicos</SelectItem>
                {tecnicos?.map(tec => (
                  <SelectItem key={tec.id} value={tec.id.toString()}>
                    {getNomeSobrenome(tec.nome)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={municipioFilter} onValueChange={setMunicipioFilter}>
              <SelectTrigger className="w-full sm:w-[200px] h-10">
                <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Município" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Municípios</SelectItem>
                {stats.municipios?.map(municipio => (
                  <SelectItem key={municipio} value={municipio}>
                    {municipio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={clienteFilter} onValueChange={setClienteFilter}>
              <SelectTrigger className="w-full sm:w-[220px] h-10">
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Cliente/Órgão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Clientes</SelectItem>
                {stats.clientes?.map(cliente => (
                  <SelectItem key={cliente} value={cliente}>
                    {cliente}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Botão limpar filtros */}
            {(tecnicoFilter !== "all" || statusFilter !== "all" || municipioFilter !== "all" || clienteFilter !== "all" || searchTerm || periodoFilter !== "mes") && (
              <Button 
                variant="ghost" 
                size="sm"
                className="h-10 px-3 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setTecnicoFilter("all")
                  setStatusFilter("all")
                  setMunicipioFilter("all")
                  setClienteFilter("all")
                  setSearchTerm("")
                  setPeriodoFilter("mes")
                  setDataInicio(undefined)
                  setDataFim(undefined)
                }}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Limpar Tudo
              </Button>
            )}
          </div>
          
          {/* Indicador de filtros ativos */}
          {(tecnicoFilter !== "all" || statusFilter !== "all" || municipioFilter !== "all" || clienteFilter !== "all" || periodoFilter === "personalizado") && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground">Filtros ativos:</span>
              {periodoFilter === "personalizado" && dataInicio && (
                <Badge variant="secondary" className="text-xs">
                  Período: {format(dataInicio, "dd/MM")} {dataFim ? `- ${format(dataFim, "dd/MM")}` : ""}
                  <button className="ml-1" onClick={() => { setPeriodoFilter("mes"); setDataInicio(undefined); setDataFim(undefined) }}>×</button>
                </Badge>
              )}
              {tecnicoFilter !== "all" && (
                <Badge variant="secondary" className="text-xs">
                  Técnico: {getNomeSobrenome(tecnicos?.find(t => t.id.toString() === tecnicoFilter)?.nome || tecnicoFilter)}
                  <button className="ml-1" onClick={() => setTecnicoFilter("all")}>×</button>
                </Badge>
              )}
              {statusFilter !== "all" && (
                <Badge variant="secondary" className="text-xs">
                  Status: {statusFilter === "ok" ? "Com Relatório" : "Sem Relatório"}
                  <button className="ml-1" onClick={() => setStatusFilter("all")}>×</button>
                </Badge>
              )}
              {municipioFilter !== "all" && (
                <Badge variant="secondary" className="text-xs">
                  Município: {municipioFilter}
                  <button className="ml-1" onClick={() => setMunicipioFilter("all")}>×</button>
                </Badge>
              )}
              {clienteFilter !== "all" && (
                <Badge variant="secondary" className="text-xs">
                  Cliente: {clienteFilter}
                  <button className="ml-1" onClick={() => setClienteFilter("all")}>×</button>
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumo por Técnico */}
      {Object.keys(stats.porTecnico).length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Resumo por Técnico
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Object.entries(stats.porTecnico).map(([nome, data]) => (
                <div 
                  key={nome} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors cursor-pointer"
                  onClick={() => setTecnicoFilter(nome)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium truncate">{nome}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
                            {data.ok}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>Com relatório</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {data.pendente > 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300">
                              {data.pendente}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Sem relatório</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela de Batimento */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Detalhamento
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              {dadosFiltrados.length} registro(s)
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : dadosFiltrados.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-medium mb-2">Nenhum agendamento encontrado</h3>
              <p className="text-sm text-muted-foreground">
                Não há agendamentos para o período selecionado.
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[90px]">Data</TableHead>
                    <TableHead className="hidden sm:table-cell">Técnico</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead className="hidden md:table-cell">Evento</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batimentoPagination.paginatedItems.map((item, idx) => {
                    const dataFormatada = (() => {
                      const dataStr = item.dataFormatada
                      if (dataStr && /^\d{4}-\d{2}-\d{2}/.test(dataStr)) {
                        const [ano, mes, dia] = dataStr.split('-')
                        return `${dia}/${mes}/${ano}`
                      }
                      return dataStr || '-'
                    })()

                    return (
                      <TableRow 
                        key={`${item.id}-${idx}`}
                        className={item.status === 'pendente' ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}
                      >
                        <TableCell className="font-medium text-sm">
                          {dataFormatada}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-sm truncate max-w-[120px]">
                              {getNomeSobrenome(item.tecnico_nome || 'Não identificado')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate max-w-[150px]">
                              {item.municipio || item.local || item.cliente_nome || '-'}
                            </span>
                          </div>
                          {/* Mobile: show tecnico name under location */}
                          <div className="sm:hidden text-xs text-muted-foreground mt-1">
                            {getNomeSobrenome(item.tecnico_nome || 'Técnico não identificado')}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm text-muted-foreground truncate max-w-[150px] block">
                            {item.titulo || 'Visita agendada'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.temRelatorio ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              OK
                            </Badge>
                          ) : item.status === 'ok' ? (
                            // Coberto pelo relatorio do grupo (par fixo / mesmo municipio-dia)
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
                                    <Link2 className="h-3 w-3 mr-1" />
                                    OK (grupo)
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">
                                    {item.grupoTipo === 'fixo'
                                      ? `Coberto pelo relatorio semanal unico (cobrado em ${item.grupoDueDate?.split('-').reverse().join('/')})`
                                      : `Coberto pelo relatorio do grupo (cobrado em ${item.grupoDueDate?.split('-').reverse().join('/')})`}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : item.abonado ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge className="bg-blue-500/15 text-blue-700 hover:bg-blue-500/20 dark:text-blue-300">
                                    <ShieldCheck className="h-3 w-3 mr-1" />
                                    Abonado
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{item.motivoAbono || "Visita sem necessidade de relatório"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : item.status === 'agrupado' ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge className="bg-violet-500/15 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300">
                                    <Link2 className="h-3 w-3 mr-1" />
                                    Agrupado
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">
                                    {item.grupoTipo === 'fixo'
                                      ? `Relatorio semanal unico - cobrado em ${item.grupoDueDate?.split('-').reverse().join('/')}`
                                      : `Relatorio unico - cobrado em ${item.grupoDueDate?.split('-').reverse().join('/')}`}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Pendente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center gap-2">
                            {item.relatorio ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-sm text-primary hover:underline flex items-center gap-1 h-auto p-1"
                                onClick={() => {
                                  setRelatorioSelecionado(item.relatorio)
                                  setViewModalOpen(true)
                                }}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {item.relatorio.numero_autenticacao}
                              </Button>
                            ) : item.status === 'agrupado' ? (
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Link2 className="h-3 w-3 text-violet-500" />
                                {item.grupoTipo === 'fixo'
                                  ? `Relatorio semanal unico (cobrado em ${item.grupoDueDate?.split('-').reverse().join('/')})`
                                  : `Relatorio unico (cobrado em ${item.grupoDueDate?.split('-').reverse().join('/')})`}
                              </span>
                            ) : item.status === 'ok' ? (
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Link2 className="h-3 w-3 text-emerald-500" />
                                {item.grupoTipo === 'fixo'
                                  ? `Coberto pelo relatorio semanal (cobrado em ${item.grupoDueDate?.split('-').reverse().join('/')})`
                                  : `Coberto pelo relatorio do grupo`}
                              </span>
                            ) : !item.abonado ? (
                              <Popover open={abonarPopoverOpen === item.id} onOpenChange={(open) => setAbonarPopoverOpen(open ? item.id : null)}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                  >
                                    <ShieldCheck className="h-3 w-3" />
                                    Abonar
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72" align="end">
                                  <form 
                                    className="space-y-3"
                                    onSubmit={async (e) => {
                                      e.preventDefault()
                                      const form = e.target as HTMLFormElement
                                      const input = form.elements.namedItem('motivo') as HTMLInputElement
                                      const motivo = input?.value || "Visita sem necessidade de relatório"
                                      const tecId = item.tecnico_rarotec_id || item.tecnico_id
                                      await salvarAbono(item.id, tecId, motivo)
                                      setAbonarPopoverOpen(null)
                                    }}
                                  >
                                    <div>
                                      <p className="font-medium text-sm">Abonar falta de relatório</p>
                                      <p className="text-xs text-muted-foreground">
                                        Informe o motivo (ex: entrega de documento, visita rápida)
                                      </p>
                                    </div>
                                    <Input
                                      placeholder="Motivo do abono..."
                                      name="motivo"
                                      className="h-8 text-sm"
                                      defaultValue=""
                                    />
                                    <Button
                                      type="submit"
                                      size="sm"
                                      className="w-full"
                                    >
                                      Confirmar Abono
                                    </Button>
                                  </form>
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <Popover open={desabonarPopoverOpen === item.id} onOpenChange={(open) => setDesabonarPopoverOpen(open ? item.id : null)}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                                  >
                                    <XCircle className="h-3 w-3" />
                                    Desabonar
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72" align="end">
                                  <div className="space-y-3">
                                    <div>
                                      <p className="font-medium text-sm">Remover abono</p>
                                      <p className="text-xs text-muted-foreground">
                                        Tem certeza que deseja remover o abono desta visita?
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        <strong>Motivo atual:</strong> {item.motivoAbono || "Não informado"}
                                      </p>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => setDesabonarPopoverOpen(null)}
                                      >
                                        Cancelar
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="flex-1"
                                        onClick={async () => {
                                          const tecId = item.tecnico_rarotec_id || item.tecnico_id
                                          await removerAbono(item.id, tecId)
                                          setDesabonarPopoverOpen(null)
                                        }}
                                      >
                                        Confirmar
                                      </Button>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
              <ListPagination
                page={batimentoPagination.page}
                pageSize={batimentoPagination.pageSize}
                totalItems={batimentoPagination.totalItems}
                onPageChange={batimentoPagination.setPage}
                onPageSizeChange={batimentoPagination.setPageSize}
                itemLabel="registros"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Visualização do Relatório */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Visualizar Relatório</DialogTitle>
          </DialogHeader>
          {relatorioSelecionado && (
            <RelatorioView relatorioId={relatorioSelecionado.id} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
