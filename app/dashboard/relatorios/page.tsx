"use client"

import { useState } from "react"
import useSWR from "swr"
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO, startOfWeek, endOfWeek } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import {
  Eye,
  Trash2,
  Mail,
  FileText, 
  Search, 
  Download,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  Sparkles,
  TrendingUp,
  Users,
  MapPin,
  MoreHorizontal,
  ExternalLink,

  AlertCircle,
  Filter,
  CalendarDays,
  BarChart3,
  RefreshCw
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RelatorioView } from "./relatorio-view"
import { EnviarEmailDialog } from "@/components/enviar-email-dialog"
import type { RelatorioVisita } from "@/lib/types"
import { ExportButton } from "@/components/export-button"
import { useSession } from "@/lib/auth-context"
import { isGestor } from "@/lib/permissions"
import { toast } from "sonner"

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || "Erro ao carregar relatórios")
  return data
}

export default function RelatoriosPage() {
  const { user } = useSession()
  const isAdmin = user?.cargo === "Administrador" || user?.cargos?.includes("Administrador")
  const userIsGestor = user?.nome ? isGestor(user.nome, user.cargo) : false
  const { data: relatorios, mutate } = useSWR<RelatorioVisita[]>("/api/relatorios", fetcher)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [selectedRelatorio, setSelectedRelatorio] = useState<RelatorioVisita | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [temaFilter, setTemaFilter] = useState("")
  const [periodoFilter, setPeriodoFilter] = useState<string>("todos")
  const [dataInicio, setDataInicio] = useState<Date | undefined>(undefined)
  const [dataFim, setDataFim] = useState<Date | undefined>(undefined)

  // Função para verificar se data está no período selecionado
  const matchesPeriodo = (relatorio: RelatorioVisita) => {
    const dataStr = relatorio.data_visita || relatorio.data_relatorio || relatorio.created_at
    
    // Extrair data diretamente da string ISO para evitar problemas de timezone
    let dataRelatorioStr: string
    if (typeof dataStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dataStr)) {
      dataRelatorioStr = dataStr.split('T')[0] // "2026-05-15"
    } else {
      dataRelatorioStr = format(new Date(dataStr), "yyyy-MM-dd")
    }
    
    // Criar data a partir da string extraída (meio-dia para evitar timezone)
    const [ano, mes, dia] = dataRelatorioStr.split('-').map(Number)
    const dataRelatorio = new Date(ano, mes - 1, dia, 12, 0, 0)
    
    const hoje = new Date()
    const hojeStr = format(hoje, "yyyy-MM-dd")
    
    switch (periodoFilter) {
      case "hoje":
        return dataRelatorioStr === hojeStr
      case "semana":
        return isWithinInterval(dataRelatorio, { 
          start: startOfWeek(hoje, { weekStartsOn: 0 }), 
          end: endOfWeek(hoje, { weekStartsOn: 0 }) 
        })
      case "mes":
        return isWithinInterval(dataRelatorio, { 
          start: startOfMonth(hoje), 
          end: endOfMonth(hoje) 
        })
      case "mesPassado":
        const mesPassado = subMonths(hoje, 1)
        return isWithinInterval(dataRelatorio, { 
          start: startOfMonth(mesPassado), 
          end: endOfMonth(mesPassado) 
        })
      case "personalizado":
        if (dataInicio && dataFim) {
          return isWithinInterval(dataRelatorio, { start: dataInicio, end: dataFim })
        }
        if (dataInicio) {
          return dataRelatorio >= dataInicio
        }
        if (dataFim) {
          return dataRelatorio <= dataFim
        }
        return true
      default:
        return true
    }
  }

  const filteredRelatorios = relatorios?.filter((relatorio) => {
    // Registros sem motivo/tipo são órfãos de origem indeterminada (reenvio,
    // reimpressão ou duplicação). Preservamos no banco, mas não os exibimos
    // no histórico até que possam ser classificados com segurança.
    if (!relatorio.tipo_servico?.trim()) return false

    // Se não for gestor, filtrar apenas relatórios onde o usuário está vinculado
    if (!userIsGestor && user?.tecnico_rarotec_id) {
      // Verificar se o usuário está no array de técnicos do relatório
      let tecnicoIds: number[] = []
      if (relatorio.tecnicos_rarotec_ids) {
        try {
          tecnicoIds = typeof relatorio.tecnicos_rarotec_ids === 'string'
            ? JSON.parse(relatorio.tecnicos_rarotec_ids)
            : relatorio.tecnicos_rarotec_ids
        } catch { tecnicoIds = [] }
      }
      
      const usuarioNoRelatorio = 
        tecnicoIds.includes(user.tecnico_rarotec_id) ||
        relatorio.tecnico_rarotec_id === user.tecnico_rarotec_id ||
        (relatorio.tecnicos_rarotec_nomes && 
          relatorio.tecnicos_rarotec_nomes.some((t: any) => t.id === user.tecnico_rarotec_id))
      
      if (!usuarioNoRelatorio) return false
    }
    
    const matchesSearch =
      relatorio.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      relatorio.tecnico_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      relatorio.municipio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      relatorio.numero_autenticacao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      relatorio.orgao_atendido?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = !statusFilter || statusFilter === "all" || relatorio.status === statusFilter
    const matchesTema = !temaFilter || temaFilter === "all" || relatorio.tema?.includes(temaFilter) || relatorio.tipo_servico?.includes(temaFilter)
    const matchesData = matchesPeriodo(relatorio)
    
    return matchesSearch && matchesStatus && matchesTema && matchesData
  })

  const handleView = (relatorio: RelatorioVisita) => {
    setSelectedRelatorio(relatorio)
    setIsViewOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem excluir relatórios.")
      return
    }
    if (!confirm("Tem certeza que deseja excluir este relatório?")) return

    const previousRelatorios = relatorios ?? []
    mutate(
      previousRelatorios.filter((r) => r.id !== id),
      false
    )

    try {
      const res = await fetch(`/api/relatorios/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || "Erro ao excluir relatório")
      }
      toast.success("Relatório excluído com sucesso")
      await mutate()
    } catch (err) {
      mutate(previousRelatorios, false)
      toast.error(err instanceof Error ? err.message : "Erro ao excluir relatório")
    }
  }

  // Funções de exportação da lista de relatórios
  const handleExportExcel = async () => {
    if (!filteredRelatorios) return
    const { exportToExcel } = await import("@/lib/export-utils")
    exportToExcel({
      filename: "relatorios-visita",
      title: "Lista de Relatórios de Visita - Rarotec",
      columns: [
        { header: "Código", key: "codigo", width: 20 },
        { header: "Data", key: "data_visita", width: 12 },
        { header: "Município", key: "municipio", width: 25 },
        { header: "UF", key: "estado", width: 5 },
        { header: "Cliente/Órgão", key: "orgao", width: 35 },
        { header: "Tipo Serviço", key: "tipo_servico", width: 20 },
        { header: "Técnico(s)", key: "tecnicos", width: 30 },
        { header: "Status", key: "status", width: 12 },
      ],
      data: filteredRelatorios.map(r => ({
        ...r,
        orgao: (typeof r.entidades?.[0] === "object" ? r.entidades[0]?.nome : r.entidades?.[0]) || r.orgao || "-",
        tecnicos: r.tecnicos_rarotec?.map((t: any) => t.nome).join(", ") || "-",
      }))
    })
  }

  const handleExportPDFList = async () => {
    if (!filteredRelatorios) return
    const { exportToPDF } = await import("@/lib/export-utils")
    exportToPDF({
      filename: "relatorios-visita",
      title: "Lista de Relatórios de Visita - Rarotec",
      columns: [
        { header: "Código", key: "codigo" },
        { header: "Data", key: "data_visita" },
        { header: "Município/UF", key: "municipio_uf" },
        { header: "Cliente/Órgão", key: "orgao" },
        { header: "Tipo", key: "tipo_servico" },
        { header: "Status", key: "status" },
      ],
      data: filteredRelatorios.map(r => ({
        ...r,
        municipio_uf: `${r.municipio || "-"}/${r.estado || "-"}`,
        orgao: (typeof r.entidades?.[0] === "object" ? r.entidades[0]?.nome : r.entidades?.[0]) || r.orgao || "-",
      }))
    })
  }

  const handleDownloadPDF = async (relatorio: RelatorioVisita) => {
    try {
      const res = await fetch(`/api/relatorios/${relatorio.id}`)
      const fullRelatorio = await res.json()
      
      const modulos = typeof fullRelatorio.modulos === 'string' 
        ? JSON.parse(fullRelatorio.modulos) 
        : fullRelatorio.modulos || []
      
      const pdfData = {
        tiposRelatorio: fullRelatorio.tema ? fullRelatorio.tema.split(", ") : [fullRelatorio.tipo_servico || "Visita Técnica"],
        dataInicio: fullRelatorio.data_visita || fullRelatorio.data_relatorio || "",
        dataFim: fullRelatorio.data_fim || fullRelatorio.data_visita || "",
        horaInicio: fullRelatorio.hora_inicio || "",
        horaFim: fullRelatorio.hora_fim || "",
        estado: fullRelatorio.estado || "PE",
        municipio: fullRelatorio.municipio || fullRelatorio.cliente_cidade || "",
        cliente: fullRelatorio.cliente_nome ? {
          nome: fullRelatorio.cliente_nome,
          cnpj: fullRelatorio.cliente_cnpj || "-",
          endereco: fullRelatorio.cliente_endereco,
        } : null,
        entidades: fullRelatorio.orgao_atendido ? fullRelatorio.orgao_atendido.split("; ").map((o: string, idx: number) => {
          const match = o.match(/^(.+?) \(CNPJ: (.+?)\)$/)
          if (match) {
            // Tratar "undefined" que pode ter sido salvo anteriormente
            let nome = match[1] === "undefined" ? "" : match[1]
            const cnpj = match[2]
            // Retornar nome SEM o CNPJ no campo nome, e CNPJ separado
            return { tipo: nome, nome: nome, cnpj: cnpj }
          }
          return { tipo: o, nome: o, cnpj: "-" }
        }) : [],
        modulos: modulos,
        servicos: fullRelatorio.tipo_servico ? fullRelatorio.tipo_servico.split(", ") : [],
        tecnicosRarotec: fullRelatorio.tecnicos_rarotec_nomes 
          ? fullRelatorio.tecnicos_rarotec_nomes.map((t: any) => ({ nome: t.nome, email: t.email }))
          : fullRelatorio.tecnico_nome 
            ? [{ nome: fullRelatorio.tecnico_nome, email: fullRelatorio.tecnico_email }]
            : [],
        tecnicosCliente: (() => {
          // Tentar usar tecnicos_cliente_info (JSONB)
          if (fullRelatorio.tecnicos_cliente_info) {
            const info = typeof fullRelatorio.tecnicos_cliente_info === 'string'
              ? JSON.parse(fullRelatorio.tecnicos_cliente_info)
              : fullRelatorio.tecnicos_cliente_info
            return info.map((t: any) => ({ nome: t.nome, cpf: t.cpf, email: t.email }))
          }
          // Fallback para técnico único
          if (fullRelatorio.tecnico_cliente_nome) {
            return [{ 
              nome: fullRelatorio.tecnico_cliente_nome, 
              cpf: fullRelatorio.tecnico_cliente_cpf, 
              email: fullRelatorio.tecnico_cliente_email 
            }]
          }
          return []
        })(),
        descricaoServicos: fullRelatorio.historico || fullRelatorio.descricao_servico || "",
        observacoes: fullRelatorio.observacoes || "",
        anexos: fullRelatorio.anexos 
          ? fullRelatorio.anexos.map((a: any) => ({ name: a.nome_arquivo, type: a.tipo_arquivo }))
          : [],
        // Buscar arquivos reais do Vercel Blob para embutir no PDF
        anexosFiles: await (async () => {
          if (!fullRelatorio.anexos || fullRelatorio.anexos.length === 0) return []
          
          const files: File[] = []
          for (const anexo of fullRelatorio.anexos) {
            try {
              // Buscar arquivo diretamente da API (que faz streaming do blob privado)
              const response = await fetch(`/api/relatorios/anexos/${anexo.id}`)
              if (!response.ok) continue
              
              const blob = await response.blob()
              const file = new File([blob], anexo.nome_arquivo, { type: anexo.tipo_arquivo || blob.type || "application/pdf" })
              files.push(file)
            } catch (error) {
              console.error(`Erro ao buscar anexo ${anexo.nome_arquivo}:`, error)
            }
          }
          return files
        })(),
        numeroAutenticacao: fullRelatorio.numero_autenticacao,
        // Rastreabilidade - usuário que criou o relatório (salvo no banco)
        usuarioEmissor: fullRelatorio.criado_por_nome || "Não registrado",
        dataEmissaoRelatorio: fullRelatorio.created_at 
          ? new Date(fullRelatorio.created_at).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
            })
          : undefined,
        usuarioDownload: user?.nome || "Usuário do Sistema",
      }
      
      const { generateRelatorioPDF, downloadPDF } = await import("@/lib/pdf-generator")
      const blob = await generateRelatorioPDF(pdfData)
      const dataFormatada = (() => {
        const raw = fullRelatorio.data_visita || fullRelatorio.data_relatorio
        if (!raw) return format(new Date(), "yyyy-MM-dd")
        const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (m) return `${m[1]}-${m[2]}-${m[3]}`
        const br = String(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`
        const d = new Date(raw)
        return isNaN(d.getTime()) ? format(new Date(), "yyyy-MM-dd") : format(d, "yyyy-MM-dd")
      })()
      const clienteNome = (fullRelatorio.cliente_nome || fullRelatorio.municipio || "relatorio")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
      const filename = `relatorio-${clienteNome || "relatorio"}-${dataFormatada}.pdf`
      downloadPDF(blob, filename)
    } catch (error) {
      console.error("Erro ao gerar PDF:", error)
      alert("Erro ao gerar PDF. Tente novamente.")
    }
  }

  // Parse temas do relatório (pode ser múltiplos separados por vírgula)
  const getTemas = (relatorio: RelatorioVisita) => {
    const tema = relatorio.tema || relatorio.tipo_servico || ""
    return tema.split(", ").filter(Boolean)
  }

  // Estatísticas melhoradas
  const hoje = new Date()
  const inicioMes = startOfMonth(hoje)
  const fimMes = endOfMonth(hoje)
  const mesPassado = subMonths(hoje, 1)
  const inicioMesPassado = startOfMonth(mesPassado)
  const fimMesPassado = endOfMonth(mesPassado)
  
  // Para estatísticas, usar apenas os relatórios que o usuário tem acesso (não os filtros de busca)
  const relatoriosDoUsuario = relatorios?.filter((relatorio) => {
    // Se não for gestor, filtrar apenas relatórios onde o usuário está vinculado
    if (!userIsGestor && user?.tecnico_rarotec_id) {
      let tecnicoIds: number[] = []
      if (relatorio.tecnicos_rarotec_ids) {
        try {
          tecnicoIds = typeof relatorio.tecnicos_rarotec_ids === 'string'
            ? JSON.parse(relatorio.tecnicos_rarotec_ids)
            : relatorio.tecnicos_rarotec_ids
        } catch { tecnicoIds = [] }
      }
      
      const usuarioNoRelatorio = 
        tecnicoIds.includes(user.tecnico_rarotec_id) ||
        relatorio.tecnico_rarotec_id === user.tecnico_rarotec_id ||
        (relatorio.tecnicos_rarotec_nomes && 
          relatorio.tecnicos_rarotec_nomes.some((t: any) => t.id === user.tecnico_rarotec_id))
      
      return usuarioNoRelatorio
    }
    return true
  })
  
  const stats = {
    total: relatoriosDoUsuario?.length || 0,
    concluidos: relatoriosDoUsuario?.filter(r => r.status === "aprovado" || r.status === "concluido").length || 0,
    esteMes: relatoriosDoUsuario?.filter(r => {
      const dataRelatorio = new Date(r.data_visita || r.data_relatorio || r.created_at)
      return isWithinInterval(dataRelatorio, { start: inicioMes, end: fimMes })
    }).length || 0,
    mesPassado: relatoriosDoUsuario?.filter(r => {
      const dataRelatorio = new Date(r.data_visita || r.data_relatorio || r.created_at)
      return isWithinInterval(dataRelatorio, { start: inicioMesPassado, end: fimMesPassado })
    }).length || 0,
  }
  
  // Calcular variação percentual
  const variacaoMes = stats.mesPassado > 0 
    ? Math.round(((stats.esteMes - stats.mesPassado) / stats.mesPassado) * 100)
    : stats.esteMes > 0 ? 100 : 0

  // Extrair órgãos de forma limpa
  const getOrgaos = (orgaoAtendido: string | undefined | null) => {
    if (!orgaoAtendido) return []
    return orgaoAtendido.split("; ").map(o => {
      const match = o.match(/^(.+?) \(CNPJ: (.+?)\)$/)
      return match ? { nome: match[1], cnpj: match[2] } : { nome: o, cnpj: "" }
    }).filter(o => o.nome && o.nome !== "undefined")
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios de Visita</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {userIsGestor 
              ? "Gerencie e acompanhe os relatórios de visitas técnicas" 
              : "Visualize os relatórios de visitas em que você participou"}
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDFList}
            disabled={!filteredRelatorios || filteredRelatorios.length === 0}
          />
          <Button asChild size="lg" className="shadow-sm">
            <Link href="/dashboard/relatorios/novo">
              <Sparkles className="mr-2 h-4 w-4" />
              Novo Relatório
            </Link>
          </Button>
        </div>
      </div>

      {/* Cards de Estatísticas - Design melhorado */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-500/10 dark:bg-slate-500/15 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Total de Relatórios</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Concluídos</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.concluidos}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center shrink-0">
                <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Este Mês ({format(hoje, "MMM", { locale: ptBR })})</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.esteMes}</p>
                  {variacaoMes !== 0 && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${variacaoMes > 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}`}>
                      {variacaoMes > 0 ? '+' : ''}{variacaoMes}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-500/10 dark:bg-slate-500/15 flex items-center justify-center shrink-0">
                <BarChart3 className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Mês Passado ({format(mesPassado, "MMM", { locale: ptBR })})</p>
                <p className="text-2xl font-bold">{stats.mesPassado}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Relatórios */}
      <div className="space-y-4">
          {/* Filtros */}
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                {/* Linha 1: Busca e filtros básicos */}
                <div className="flex flex-col lg:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por código, município, técnico, órgão..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 h-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full lg:w-[140px] h-10">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Status</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={temaFilter} onValueChange={setTemaFilter}>
                    <SelectTrigger className="w-full lg:w-[180px] h-10">
                      <SelectValue placeholder="Tipo de Serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Tipos</SelectItem>
                      <SelectItem value="Visita Técnica">Visita Técnica</SelectItem>
                      <SelectItem value="Treinamento">Treinamento</SelectItem>
                      <SelectItem value="Implantação">Implantação</SelectItem>
                      <SelectItem value="Migração">Migração</SelectItem>
                      <SelectItem value="Atendimento Remoto">Atendimento Remoto</SelectItem>
                      <SelectItem value="Cadastro de Usuário">Cadastro de Usuário</SelectItem>
                      <SelectItem value="Reunião">Reunião</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Linha 2: Filtros de período */}
                <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">Período:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      variant={periodoFilter === "todos" ? "default" : "outline"} 
                      size="sm"
                      onClick={() => setPeriodoFilter("todos")}
                    >
                      Todos
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
                      variant={periodoFilter === "mes" ? "default" : "outline"} 
                      size="sm"
                      onClick={() => setPeriodoFilter("mes")}
                    >
                      Este Mês
                    </Button>
                    <Button 
                      variant={periodoFilter === "mesPassado" ? "default" : "outline"} 
                      size="sm"
                      onClick={() => setPeriodoFilter("mesPassado")}
                    >
                      Mês Passado
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
                              setPeriodoFilter("todos")
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
                  </div>
                  
                  {/* Contador de resultados */}
                  <div className="lg:ml-auto">
                    <span className="text-sm text-muted-foreground">
                      {filteredRelatorios?.length || 0} relatório(s) encontrado(s)
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Relatórios em Cards */}
          <div className="space-y-3">
            {filteredRelatorios?.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground">Nenhum relatório encontrado</p>
                  <Button asChild variant="link" className="mt-2">
                    <Link href="/dashboard/relatorios/novo">Criar primeiro relatório</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {filteredRelatorios?.map((relatorio) => {
              const orgaos = getOrgaos(relatorio.orgao_atendido)
              const temas = getTemas(relatorio)
              const isCompleto = relatorio.status === "aprovado" || relatorio.status === "concluido"
              
              // Formatar data corretamente (evitar problema de timezone)
              const dataVisita = relatorio.data_visita || relatorio.data_relatorio || relatorio.created_at
              let dataFormatada = "-"
              if (dataVisita) {
                // Se a data está no formato ISO (YYYY-MM-DD), extrair partes diretamente para evitar timezone
                if (typeof dataVisita === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dataVisita)) {
                  const [ano, mes, dia] = dataVisita.split('T')[0].split('-')
                  dataFormatada = `${dia}/${mes}/${ano}`
                } else {
                  dataFormatada = format(new Date(dataVisita), "dd/MM/yyyy", { locale: ptBR })
                }
              }
              
              return (
                <Card 
                  key={relatorio.id} 
                  className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group border"
                  onClick={() => handleView(relatorio)}
                >
                  <CardContent className="p-0">
                    <div className="flex items-stretch">
                      {/* Indicador de status lateral */}
                      <div className={`w-1 shrink-0 ${isCompleto ? 'bg-emerald-500' : relatorio.status === 'pendente' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                      
                      <div className="flex-1 p-4 min-w-0">
                        {/* Layout Desktop */}
                        <div className="hidden lg:grid lg:grid-cols-[1fr_180px_200px_100px_40px] lg:items-center gap-4">
                          {/* Info principal */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded whitespace-nowrap">
                                {relatorio.numero_autenticacao || `#${relatorio.id}`}
                              </span>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {dataFormatada}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-1.5">
                              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="font-medium truncate">
                                {relatorio.municipio || relatorio.cliente_nome || "Local não informado"}
                                {relatorio.estado && <span className="text-muted-foreground">/{relatorio.estado}</span>}
                              </span>
                            </div>
                            
                            {orgaos.length > 0 && (
                              <p className="text-sm text-muted-foreground mt-0.5 truncate pl-6">
                                {orgaos.map(o => o.nome).join(", ")}
                              </p>
                            )}
                          </div>

                          {/* Técnico */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm truncate">{relatorio.tecnico_nome || "-"}</span>
                            </div>
                          </div>

                          {/* Temas/Tipos */}
                          <div className="min-w-0">
                            <div className="flex flex-wrap gap-1">
                              {temas.slice(0, 2).map((tema, i) => (
                                <Badge 
                                  key={i} 
                                  variant="secondary" 
                                  className="text-xs font-normal truncate max-w-[90px]"
                                >
                                  {tema}
                                </Badge>
                              ))}
                              {temas.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{temas.length - 2}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Status */}
                          <div>
                            {isCompleto ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 whitespace-nowrap">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Concluído
                              </Badge>
                            ) : relatorio.status === "pendente" ? (
                              <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 whitespace-nowrap">
                                <Clock className="h-3 w-3 mr-1" />
                                Pendente
                              </Badge>
                            ) : (
                              <Badge variant="secondary">{relatorio.status}</Badge>
                            )}
                          </div>

                          {/* Ações */}
                          <div onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleView(relatorio)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Visualizar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownloadPDF(relatorio)}>
                                  <Download className="h-4 w-4 mr-2" />
                                  Baixar PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/validar/${relatorio.numero_autenticacao}`} target="_blank">
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Link de Validação
                                  </Link>
                                </DropdownMenuItem>
                                <EnviarEmailDialog
                                  relatorioId={relatorio.id}
                                  numeroAutenticacao={relatorio.numero_autenticacao || undefined}
                                  tecnicos={relatorio.tecnicos_rarotec_nomes?.map((t: any) => ({ nome: t.nome, email: t.email || "" })) || []}
                                  clienteNome={relatorio.cliente_nome}
                                  clienteEmail={relatorio.cliente_email || undefined}
                                  representantes={relatorio.representantes_cliente?.map((r: any) => ({ nome: r.nome, email: r.email || "" })) || []}
                                  municipio={relatorio.municipio || undefined}
                                  tipoServico={relatorio.tipo_servico || undefined}
                                  dataAtendimento={relatorio.data_visita}
                                  trigger={
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                      <Mail className="h-4 w-4 mr-2" />
                                      Enviar por Email
                                    </DropdownMenuItem>
                                  }
                                />
                                {isAdmin && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => handleDelete(relatorio.id)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Excluir
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        
                        {/* Layout Mobile */}
                        <div className="lg:hidden space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                {relatorio.numero_autenticacao || `#${relatorio.id}`}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {dataFormatada}
                              </span>
                            </div>
                            {isCompleto ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 shrink-0">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Concluído
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 shrink-0">
                                <Clock className="h-3 w-3 mr-1" />
                                Pendente
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate">
                              {relatorio.municipio || relatorio.cliente_nome || "Local não informado"}
                              {relatorio.estado && <span className="text-muted-foreground">/{relatorio.estado}</span>}
                            </span>
                          </div>
                          
                          {orgaos.length > 0 && (
                            <p className="text-sm text-muted-foreground truncate pl-6">
                              {orgaos.map(o => o.nome).join(", ")}
                            </p>
                          )}
                          
                          <div className="flex items-center justify-between gap-2 pt-2 border-t">
                            <div className="flex items-center gap-2 min-w-0">
                              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm truncate">{relatorio.tecnico_nome || "-"}</span>
                            </div>
                            <div className="flex flex-wrap gap-1 justify-end">
                              {temas.slice(0, 2).map((tema, i) => (
                                <Badge key={i} variant="secondary" className="text-xs font-normal">
                                  {tema}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
      </div>

      {/* Dialog Visualizar Relatório */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Visualizar Relatório</DialogTitle>
          </DialogHeader>
          {selectedRelatorio && (
            <RelatorioView relatorioId={selectedRelatorio.id} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
