"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Autocomplete } from "@/components/ui/autocomplete"
import { MultiSelect } from "@/components/ui/multi-select"
import { 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Check, 
  X, 
  Plus, 
  Upload, 
  Calendar as CalendarIcon,
  FileText,
  Mail,
  Download,
  Trash2,
  Building2,
  MapPin,
  FileCheck,
  Users
} from "lucide-react"
import { MunicipioCombobox } from "@/components/municipio-combobox"
import type { TecnicoRarotec, Cliente } from "@/lib/types"
import { useSession } from "@/lib/auth-context"
import { EnviarEmailDialog } from "@/components/enviar-email-dialog"

interface OrgaoCliente {
  id: number
  cliente_id: number
  tipo: string
  nome: string
  cnpj: string | null
}

interface TecnicoClienteDB {
  id: number
  cliente_id: number
  nome: string
  cpf: string | null
  cargo: string | null
  email: string | null
  ativo: boolean
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const ESTADOS_BRASIL = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
]

const TIPOS_RELATORIO = [
  { value: "visita", label: "Visita Técnica" },
  { value: "treinamento", label: "Treinamento" },
  { value: "reuniao", label: "Reunião" },
  { value: "cadastro_usuario", label: "Cadastro de Usuário" },
  { value: "atendimento_remoto", label: "Atendimento Remoto" },
  { value: "migracao", label: "Migração" },
  { value: "implantacao", label: "Implantação" },
  { value: "outro", label: "Outro" },
]

const TIPOS_ORGAO = [
  { value: "prefeitura", label: "Prefeitura Municipal" },
  { value: "camara", label: "Câmara Municipal" },
  { value: "instituto_previdencia", label: "Instituto de Previdência" },
  { value: "secretaria_saude", label: "Secretaria/Fundo de Saúde" },
  { value: "secretaria_educacao", label: "Secretaria/Fundo de Educação" },
  { value: "secretaria_assistencia_social", label: "Secretaria/Fundo de Assistência Social" },
  { value: "secretaria_transporte", label: "Secretaria/Fundo de Transporte" },
  { value: "secretaria_agricultura", label: "Secretaria/Fundo de Agricultura e Abastecimento" },
  { value: "secretaria_energia", label: "Secretaria/Fundo de Energia e Iluminação" },
  { value: "secretaria_aguas", label: "Secretaria/Fundo de Águas e Esgoto" },
  { value: "consorcio", label: "Consórcio" },
  { value: "governo_estadual", label: "Governo Estadual (Executivo, Legislativo e Autarquia)" },
  { value: "escritorio", label: "Escritório Contábil/Jurídico" },
  { value: "outro", label: "Outro" },
]

const MODULOS = [
  "Contabilidade",
  "Controle Interno",
  "Assinatura Digital",
  "Recursos Humanos",
  "Portal do Servidor",
  "Patrimônio",
  "Almoxarifado",
  "Contratos e Convênios",
  "Plano de Contratações Anuais",
  "Licitação e Pregão Gerencial",
  "Frota de Veículos",
  "Protocolo",
  "Processos e Documentos Digitais",
  "Gerenciador Eletrônico de Documentos",
  "Business Intelligence",
  "Tributos",
  "Nota Fiscal Eletrônica",
  "Rimob",
  "PagTributos",
  "Portal da Transparência",
  "eSocial",
  "SICONFI",
  "Tesouraria",
  "Gestão de Pessoas",
  "Outro",
]

const STEPS = [
  { id: 1, title: "Tipo", subtitle: "Tipo de relatório" },
  { id: 2, title: "Localização", subtitle: "Estado e município" },
  { id: 3, title: "Entidades", subtitle: "Órgãos e CNPJs" },
  { id: 4, title: "Módulos", subtitle: "Sistemas atendidos" },
  { id: 5, title: "Detalhes", subtitle: "Resumo e data" },
  { id: 6, title: "Equipe", subtitle: "Técnicos responsáveis" },
  { id: 7, title: "Anexos", subtitle: "Documentos e email" },
]

interface Entidade {
  tipo: string
  cnpj: string
  nome?: string
}

interface TecnicoClienteForm {
  nome: string
  cpf: string
  email?: string
}

export default function NovoRelatorioPage() {
  const router = useRouter()
  const { user } = useSession()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [createdRelatorioId, setCreatedRelatorioId] = useState<number | null>(null)
  const [createdNumeroAutenticacao, setCreatedNumeroAutenticacao] = useState<string | null>(null)
  const [createdDataEmissao, setCreatedDataEmissao] = useState<string | null>(null)

  // Form data
  const [tiposRelatorio, setTiposRelatorio] = useState<string[]>([])
  const [modoLocalizacao, setModoLocalizacao] = useState<"manual" | "cliente">("cliente")
  const [estado, setEstado] = useState("PE")
  const [municipio, setMunicipio] = useState("")
  const [clienteId, setClienteId] = useState("")
  const [clientesIds, setClientesIds] = useState<string[]>([])
  const [municipioFiltro, setMunicipioFiltro] = useState("")
  const [clienteSearch, setClienteSearch] = useState("")
  const [entidades, setEntidades] = useState<Entidade[]>([])
  const [novaEntidadeTipo, setNovaEntidadeTipo] = useState("")
  const [novaEntidadeCnpj, setNovaEntidadeCnpj] = useState("")
  const [modulosSelecionados, setModulosSelecionados] = useState<string[]>([])

  const [resumo, setResumo] = useState("")
  const [dataServico, setDataServico] = useState<Date>(new Date())
  const [tecnicosSelecionados, setTecnicosSelecionados] = useState<number[]>([])
  const [tecnicosCliente, setTecnicosCliente] = useState<TecnicoClienteForm[]>([])
  const [novoTecnicoNome, setNovoTecnicoNome] = useState("")
  const [novoTecnicoCpf, setNovoTecnicoCpf] = useState("")
  const [novoTecnicoEmail, setNovoTecnicoEmail] = useState("")
  const [emailCliente, setEmailCliente] = useState("")
  const [emailsInternos, setEmailsInternos] = useState("")
  const [anexos, setAnexos] = useState<File[]>([])

  const { data: tecnicos } = useSWR<TecnicoRarotec[]>("/api/tecnicos-rarotec", fetcher)
  const { data: clientes } = useSWR<Cliente[]>("/api/clientes", fetcher)
  const { data: orgaosCliente } = useSWR<OrgaoCliente[]>(
    clienteId ? `/api/orgaos?cliente_id=${clienteId}` : null, 
    fetcher
  )
  const { data: tecnicosClienteDB } = useSWR<TecnicoClienteDB[]>(
    clienteId ? `/api/tecnicos-clientes?cliente_id=${clienteId}` : null, 
    fetcher
  )
  
  const tecnicosClienteAtivos = tecnicosClienteDB?.filter(t => t.ativo) || []

  const tecnicosAtivos = tecnicos?.filter(t => t.ativo) || []
  const clientesAtivos = clientes?.filter(c => c.ativo) || []

  // Opções formatadas para o Autocomplete
  const clientesOptions = useMemo(() => {
    return clientesAtivos.map(c => ({
      value: c.id.toString(),
      label: c.nome_fantasia || c.razao_social || "",
      description: `${c.cidade}/${c.estado}${c.cnpj ? ` - CNPJ: ${c.cnpj}` : ""}`
    }))
  }, [clientesAtivos])

  const clienteSelecionado = clienteId ? clientesAtivos.find(c => c.id === parseInt(clienteId)) : null

  // Todos os clientes selecionados (multi). O primeiro (clienteId) e o principal.
  const clientesSelecionados = useMemo(
    () => clientesIds.map(id => clientesAtivos.find(c => c.id === parseInt(id))).filter(Boolean) as Cliente[],
    [clientesIds, clientesAtivos]
  )

  // Todos os orgaos (para preencher entidades de todos os clientes selecionados)
  const { data: orgaosTodos } = useSWR<OrgaoCliente[]>(
    clientesIds.length > 0 ? "/api/orgaos" : null,
    fetcher
  )
  // Alterna a selecao de um cliente; mantem clienteId sincronizado com o 1o da lista
  const toggleCliente = (id: string) => {
    setClientesIds(prev => {
      const existe = prev.includes(id)
      const next = existe ? prev.filter(x => x !== id) : [...prev, id]
      setClienteId(next[0] || "")
      return next
    })
  }

  // Sincroniza automaticamente os clientes selecionados (e seus orgaos) com as entidades.
  // Cliente marcado na etapa anterior ja entra como entidade aqui; cliente desmarcado sai.
  // Remocoes manuais de entidades individuais sao preservadas (so removemos ao desmarcar o cliente).
  const clientesSincronizadosRef = useRef<string[]>([])
  useEffect(() => {
    if (modoLocalizacao !== "cliente") {
      clientesSincronizadosRef.current = []
      return
    }
    // Aguarda o carregamento dos orgaos antes de sincronizar (evita adicionar cliente sem seus orgaos)
    if (clientesIds.length > 0 && orgaosTodos === undefined) return

    const prev = clientesSincronizadosRef.current
    const adicionados = clientesIds.filter(id => !prev.includes(id))
    const removidos = prev.filter(id => !clientesIds.includes(id))
    if (adicionados.length === 0 && removidos.length === 0) return

    setEntidades(atual => {
      let novas = [...atual]

      // Remove entidades dos clientes desmarcados (cliente + orgaos vinculados)
      if (removidos.length > 0) {
        const cnpjsRemover = new Set<string>()
        removidos.forEach(id => {
          const c = clientesAtivos.find(x => x.id === parseInt(id))
          if (c?.cnpj) cnpjsRemover.add(c.cnpj)
          ;(orgaosTodos || [])
            .filter(o => String(o.cliente_id) === id)
            .forEach(o => { if (o.cnpj) cnpjsRemover.add(o.cnpj) })
        })
        novas = novas.filter(e => !e.cnpj || !cnpjsRemover.has(e.cnpj))
      }

      // Adiciona entidades dos novos clientes (cliente + orgaos vinculados), sem duplicar
      if (adicionados.length > 0) {
        const existentes = new Set(novas.map(e => e.cnpj).filter(Boolean))
        adicionados.forEach(id => {
          const c = clientesAtivos.find(x => x.id === parseInt(id))
          if (c?.cnpj && !existentes.has(c.cnpj)) {
            novas.push({ tipo: "Cliente", cnpj: c.cnpj, nome: c.nome_fantasia || c.razao_social })
            existentes.add(c.cnpj)
          }
          ;(orgaosTodos || [])
            .filter(o => String(o.cliente_id) === id)
            .forEach(o => {
              if (o.cnpj && !existentes.has(o.cnpj)) {
                novas.push({ tipo: o.tipo, cnpj: o.cnpj, nome: o.nome || TIPOS_ORGAO.find(t => t.value === o.tipo)?.label })
                existentes.add(o.cnpj)
              }
            })
        })
      }

      return novas
    })

    clientesSincronizadosRef.current = clientesIds
  }, [clientesIds, orgaosTodos, clientesAtivos, modoLocalizacao])

  // Municipios distintos disponiveis (a partir dos clientes cadastrados)
  const municipiosDisponiveis = useMemo(() => {
    const set = new Map<string, { cidade: string; estado: string }>()
    clientesAtivos.forEach(c => {
      if (c.cidade) {
        const estado = c.estado || ""
        set.set(`${c.cidade}/${estado}`, { cidade: c.cidade, estado })
      }
    })
    return Array.from(set.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.cidade.localeCompare(b.cidade))
  }, [clientesAtivos])

  // Filtra clientes pela busca e pelo municipio selecionado
  const clientesFiltrados = useMemo(() => {
    let lista = clientesAtivos
    if (municipioFiltro) {
      lista = lista.filter(c => `${c.cidade}/${c.estado || ""}` === municipioFiltro)
    }
    if (clienteSearch) {
      const search = clienteSearch.toLowerCase()
      lista = lista.filter(c => 
        c.nome_fantasia?.toLowerCase().includes(search) ||
        c.razao_social?.toLowerCase().includes(search) ||
        c.cidade?.toLowerCase().includes(search) ||
        c.cnpj?.includes(search)
      )
    }
    return lista
  }, [clientesAtivos, clienteSearch, municipioFiltro])

  // Auto-preencher email do cliente com emails dos técnicos/gestores selecionados
  useEffect(() => {
    const emailsTecnicosCliente = tecnicosCliente
      .map(tc => {
        // Busca email do banco se não tiver no objeto
        const tecDB = tecnicosClienteAtivos?.find(t => t.nome === tc.nome || t.cpf === tc.cpf)
        return tc.email || tecDB?.email || ""
      })
      .filter(Boolean)
    
    if (emailsTecnicosCliente.length > 0) {
      setEmailCliente(emailsTecnicosCliente.join(", "))
    }
  }, [tecnicosCliente, tecnicosClienteAtivos])

  // Auto-preencher emails internos com emails dos técnicos Rarotec selecionados
  useEffect(() => {
    const emailsTecnicosRarotec = tecnicosSelecionados
      .map(id => tecnicosAtivos.find(t => t.id === id)?.email)
      .filter(Boolean)
    
    if (emailsTecnicosRarotec.length > 0) {
      setEmailsInternos(emailsTecnicosRarotec.join(", "))
    }
  }, [tecnicosSelecionados, tecnicosAtivos])

  // Auto-selecionar o técnico logado quando a página carregar
  useEffect(() => {
    if (user && tecnicos && tecnicosSelecionados.length === 0) {
      // Buscar técnico pelo ID do usuário ou pelo email
      const tecnicoLogado = tecnicos.find(t => 
        t.id === user.tecnico_rarotec_id || 
        t.email?.toLowerCase() === user.email?.toLowerCase()
      )
      if (tecnicoLogado && tecnicoLogado.ativo) {
        setTecnicosSelecionados([tecnicoLogado.id])
      }
    }
  }, [user, tecnicos])

  // Auto-preencher módulos quando entrar na etapa 4 (baseado nas entidades selecionadas)
  useEffect(() => {
    const fetchModulosEntidades = async () => {
      // Só busca quando está na etapa 4 e tem entidades selecionadas
      if (currentStep !== 4 || entidades.length === 0) return
      
      // Só preenche se ainda não tem módulos selecionados
      if (modulosSelecionados.length > 0) return
      
      // Pegar os CNPJs das entidades selecionadas
      const cnpjs = entidades
        .map(e => e.cnpj)
        .filter(cnpj => cnpj && cnpj !== "-")
      
      if (cnpjs.length === 0) return
      
      try {
        const response = await fetch(`/api/modulos/por-cnpj?cnpjs=${cnpjs.join(",")}`)
        if (response.ok) {
          const data = await response.json()
          if (data.modulos && data.modulos.length > 0) {
            setModulosSelecionados(data.modulos)
          }
        }
      } catch (error) {
        console.error("Erro ao buscar módulos das entidades:", error)
      }
    }
    
    fetchModulosEntidades()
  }, [currentStep, entidades])

  const toggleTipoRelatorio = (tipo: string) => {
    if (tiposRelatorio.includes(tipo)) {
      setTiposRelatorio(tiposRelatorio.filter(t => t !== tipo))
    } else {
      setTiposRelatorio([...tiposRelatorio, tipo])
    }
  }

  const isStepValid = (step: number): boolean => {
    switch (step) {
      case 1: return tiposRelatorio.length > 0
      case 2: return modoLocalizacao === "cliente" ? clientesIds.length > 0 : (!!estado && !!municipio)
      case 3: return entidades.length > 0
      case 4: return modulosSelecionados.length > 0
      case 5: return !!resumo && !!dataServico
      case 6: return tecnicosSelecionados.length > 0
      case 7: return true
      default: return false
    }
  }

  const canProceed = isStepValid(currentStep)

  const addEntidade = () => {
    if (novaEntidadeTipo && novaEntidadeCnpj) {
      setEntidades([...entidades, { tipo: novaEntidadeTipo, cnpj: novaEntidadeCnpj }])
      setNovaEntidadeTipo("")
      setNovaEntidadeCnpj("")
    }
  }

  const removeEntidade = (index: number) => {
    setEntidades(entidades.filter((_, i) => i !== index))
  }

  const addTecnicoCliente = () => {
    if (novoTecnicoNome) {
      setTecnicosCliente([...tecnicosCliente, { nome: novoTecnicoNome, cpf: novoTecnicoCpf, email: novoTecnicoEmail }])
      setNovoTecnicoNome("")
      setNovoTecnicoCpf("")
      setNovoTecnicoEmail("")
    }
  }

  const removeTecnicoCliente = (index: number) => {
    setTecnicosCliente(tecnicosCliente.filter((_, i) => i !== index))
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      const newFiles = Array.from(files).slice(0, 10 - anexos.length)
      setAnexos([...anexos, ...newFiles])
    }
  }

  const removeAnexo = (index: number) => {
    setAnexos(anexos.filter((_, i) => i !== index))
  }

  const formatCnpj = (value: string) => {
    const numbers = value.replace(/\D/g, '')
    return numbers.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5')
  }

  const formatCpf = (value: string) => {
    const numbers = value.replace(/\D/g, '')
    return numbers.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/, '$1.$2.$3-$4')
  }

  const limparDados = () => {
    setTiposRelatorio([])
    setModoLocalizacao("cliente")
    setEstado("PE")
    setMunicipio("")
    setClienteId("")
    setClientesIds([])
    setMunicipioFiltro("")
    setClienteSearch("")
    setEntidades([])
    setModulosSelecionados([])
    setResumo("")
    setDataServico(new Date())
    setTecnicosSelecionados([])
    setTecnicosCliente([])
    setEmailCliente("")
    setEmailsInternos("")
    setAnexos([])
    setCurrentStep(1)
  }

  const handleSubmit = async () => {
    // Determina estado/municipio baseado no modo
    const estadoFinal = modoLocalizacao === "cliente" && clienteSelecionado
      ? clienteSelecionado.estado
      : estado
    const municipioFinal = modoLocalizacao === "cliente" && clienteSelecionado
      ? clienteSelecionado.cidade
      : municipio

    // Validação: todo relatório precisa de um local (cliente ou município).
    // Impede novos registros salvos como "Local não informado".
    if (modoLocalizacao === "cliente" && !clienteId) {
      alert("Selecione o cliente/entidade atendida antes de salvar o relatório.")
      setCurrentStep(1)
      return
    }
    if (modoLocalizacao !== "cliente" && (!municipioFinal || !municipioFinal.trim())) {
      alert("Informe o município do atendimento antes de salvar o relatório.")
      setCurrentStep(1)
      return
    }

    setLoading(true)
    try {

      const formData = {
        tipo_servico: tiposRelatorio.map(t => TIPOS_RELATORIO.find(tr => tr.value === t)?.label).join(", "),
        estado: estadoFinal,
        municipio: municipioFinal,
        cliente_id: modoLocalizacao === "cliente" && clienteId ? parseInt(clienteId) : null,
        orgao_atendido: entidades.map(e => `${e.nome || TIPOS_ORGAO.find(t => t.value === e.tipo)?.label || e.tipo} (CNPJ: ${e.cnpj})`).join("; "),
        modulos: modulosSelecionados,
        tema: tiposRelatorio.map(t => TIPOS_RELATORIO.find(tr => tr.value === t)?.label || t).join(", "),
        descricao_servico: resumo,
        data_visita: format(dataServico, "yyyy-MM-dd"),
        tecnicos_rarotec_ids: tecnicosSelecionados,
        tecnicos_cliente_info: tecnicosCliente.map(tc => {
          const tecDB = tecnicosClienteAtivos?.find(t => t.nome === tc.nome || t.cpf === tc.cpf)
          return {
            nome: tc.nome,
            cpf: tc.cpf || tecDB?.cpf || "",
            email: tc.email || tecDB?.email || ""
          }
        }),
        status: "concluido",
        criado_por_id: user?.id || null,
        criado_por_nome: user?.nome || null
      }

      const res = await fetch("/api/relatorios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })

      if (!res.ok) throw new Error("Erro ao criar relatório")

      const data = await res.json()
      setCreatedRelatorioId(data.id)
      setCreatedNumeroAutenticacao(data.numero_autenticacao)
      setCreatedDataEmissao(new Date().toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
      }))

      // Salvar anexos no banco de dados
      if (anexos.length > 0) {
        const anexosFormData = new FormData()
        anexosFormData.append("relatorio_id", data.id.toString())
        anexos.forEach(file => {
          anexosFormData.append("files", file)
        })
        
        try {
          await fetch("/api/relatorios/anexos", {
            method: "POST",
            body: anexosFormData
          })
        } catch (anexoError) {
          console.error("Erro ao salvar anexos:", anexoError)
        }
      }

      setShowSuccess(true)
    } catch (error) {
      console.error("Erro:", error)
      alert("Erro ao criar relatório")
    } finally {
      setLoading(false)
    }
  }

  const tecnicosSelecionadosData = tecnicosAtivos.filter(t => tecnicosSelecionados.includes(t.id))

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Gerador de Relatórios Técnicos
          </h1>
          <p className="text-muted-foreground">
            Preencha as informações e o sistema criará um PDF profissional automaticamente.
          </p>
        </div>

        {/* Stepper */}
        <div className="bg-card rounded-2xl border p-6 mb-6">
          <div className="flex items-center justify-between relative px-4">
            {/* Background line */}
            <div className="absolute top-5 left-8 right-8 h-0.5 bg-muted" />
            {/* Progress line */}
            <div 
              className="absolute top-5 left-8 h-0.5 bg-primary transition-all duration-500" 
              style={{ width: `calc(${((currentStep - 1) / (STEPS.length - 1)) * 100}% - 32px)` }} 
            />

            {STEPS.map((step) => {
              const isCompleted = currentStep > step.id
              const isCurrent = currentStep === step.id

              return (
                <div 
                  key={step.id} 
                  className="flex flex-col items-center relative z-10 cursor-pointer"
                  onClick={() => {
                    if (step.id < currentStep) setCurrentStep(step.id)
                    else if (step.id === currentStep + 1 && canProceed) setCurrentStep(step.id)
                  }}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all border-2 ${
                      isCompleted
                        ? "bg-primary border-primary text-primary-foreground"
                        : isCurrent
                        ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/30"
                        : "bg-background border-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? <Check className="h-5 w-5" /> : step.id}
                  </div>
                  <div className="mt-2 text-center hidden md:block">
                    <div className={`text-xs font-medium ${isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {step.subtitle}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-card rounded-2xl border p-8 mb-6 min-h-[420px]">
          {/* Step 1: Tipo de Relatório */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <Label className="text-lg font-semibold">Tipo de Relatório *</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Selecione os tipos de serviço que foram realizados (pode selecionar mais de um)
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                {TIPOS_RELATORIO.map((tipo) => {
                  const isSelected = tiposRelatorio.includes(tipo.value)
                  return (
                    <button
                      key={tipo.value}
                      onClick={() => toggleTipoRelatorio(tipo.value)}
                      className={`p-5 rounded-xl border-2 text-left transition-all hover:shadow-md relative ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-md"
                          : "border-muted hover:border-primary/40"
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      <FileText className={`h-6 w-6 mb-3 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <div className={`text-sm font-medium ${isSelected ? "text-primary" : ""}`}>
                        {tipo.label}
                      </div>
                    </button>
                  )
                })}
              </div>
              {tiposRelatorio.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-4 border-t">
                  <span className="text-sm text-muted-foreground">Selecionados:</span>
                  {tiposRelatorio.map(tipo => (
                    <Badge key={tipo} variant="secondary" className="gap-1">
                      {TIPOS_RELATORIO.find(t => t.value === tipo)?.label}
                      <button onClick={() => toggleTipoRelatorio(tipo)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Localização */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* Toggle entre modo manual e cliente */}
              <div className="flex gap-4 p-1 bg-muted rounded-lg w-fit">
                <button
                  onClick={() => { setModoLocalizacao("manual"); setClienteId(""); setClientesIds([]) }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                    modoLocalizacao === "manual" 
                      ? "bg-background shadow text-foreground" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MapPin className="h-4 w-4" />
                  Estado/Município
                </button>
                <button
                  onClick={() => { setModoLocalizacao("cliente"); setEstado("PE"); setMunicipio("") }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                    modoLocalizacao === "cliente" 
                      ? "bg-background shadow text-foreground" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  Selecionar Cliente
                </button>
              </div>

              {modoLocalizacao === "manual" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <Label className="text-lg font-semibold">Estado *</Label>
                    <Select value={estado} onValueChange={(v) => { setEstado(v); setMunicipio("") }}>
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue placeholder="Selecione o estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-64">
                          {ESTADOS_BRASIL.map((e) => (
                            <SelectItem key={e.sigla} value={e.sigla}>
                              {e.nome}
                            </SelectItem>
                          ))}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-lg font-semibold">Município *</Label>
                    <MunicipioCombobox
                      value={municipio ? `${municipio}/${estado}` : ""}
                      onValueChange={(v) => {
                        // Extrai nome e UF do valor "Cidade/UF"
                        const parts = v.split("/")
                        if (parts.length === 2) {
                          setMunicipio(parts[0])
                          setEstado(parts[1])
                        } else {
                          setMunicipio(v)
                        }
                      }}
                      placeholder="Digite o nome do município..."
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Filtro por municipio */}
                  <div className="space-y-3">
                    <Label className="text-lg font-semibold">Município</Label>
                    <p className="text-sm text-muted-foreground">
                      Filtre os clientes por município (opcional)
                    </p>
                    <Select
                      value={municipioFiltro || "todos"}
                      onValueChange={(v) => setMunicipioFiltro(v === "todos" ? "" : v)}
                    >
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue placeholder="Todos os municípios" />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-64">
                          <SelectItem value="todos">Todos os municípios</SelectItem>
                          {municipiosDisponiveis.map((m) => (
                            <SelectItem key={m.key} value={m.key}>
                              {m.cidade}/{m.estado}
                            </SelectItem>
                          ))}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Selecao de clientes (multi) */}
                  <div className="space-y-3">
                    <Label className="text-lg font-semibold">Clientes *</Label>
                    <p className="text-sm text-muted-foreground">
                      Selecione um ou mais clientes. O primeiro selecionado define a localização do relatório.
                    </p>
                    <div className="p-2 border rounded-lg">
                      <Input
                        placeholder="Buscar cliente..."
                        value={clienteSearch}
                        onChange={(e) => setClienteSearch(e.target.value)}
                        className="h-9 mb-2"
                      />
                      <ScrollArea className="h-64">
                        <div className="space-y-1 pr-2">
                          {clientesFiltrados.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground text-center">
                              Nenhum cliente encontrado
                            </div>
                          ) : (
                            clientesFiltrados.map((c) => {
                              const id = c.id.toString()
                              const checked = clientesIds.includes(id)
                              const principal = clientesIds[0] === id
                              return (
                                <label
                                  key={c.id}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors",
                                    checked ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-accent"
                                  )}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => toggleCliente(id)}
                                  />
                                  <div className="flex flex-col">
                                    <span className="font-medium flex items-center gap-2">
                                      {c.nome_fantasia || c.razao_social}
                                      {principal && (
                                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                          Principal
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {c.cidade}/{c.estado} {c.cnpj && `- CNPJ: ${c.cnpj}`}
                                    </span>
                                  </div>
                                </label>
                              )
                            })
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>

                  {/* Chips dos clientes selecionados */}
                  {clientesSelecionados.length > 0 && (
                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
                      <div className="text-sm font-medium text-primary flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {clientesSelecionados.length} cliente(s) selecionado(s)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {clientesSelecionados.map((c, idx) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm"
                          >
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                            <span className="font-medium">{c.nome_fantasia || c.razao_social}</span>
                            {idx === 0 && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                Principal
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleCliente(c.id.toString())}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={`Remover ${c.nome_fantasia || c.razao_social}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Entidades */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <Label className="text-lg font-semibold">Adicionar Entidade *</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Adicione os órgãos/entidades envolvidos no serviço
                </p>
              </div>

              {/* Aviso: clientes selecionados foram adicionados automaticamente */}
              {clientesSelecionados.length > 0 && (
                <div className="border rounded-xl p-4 space-y-1 bg-emerald-50 border-emerald-200">
                  <div className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    {clientesSelecionados.length === 1
                      ? "Cliente selecionado adicionado automaticamente"
                      : `${clientesSelecionados.length} clientes selecionados adicionados automaticamente`}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Os CNPJs dos clientes selecionados e os órgãos vinculados a eles já foram
                    incluídos como entidades. Você pode remover ou adicionar outros manualmente abaixo.
                  </p>
                </div>
              )}

              {/* Opção de vincular o próprio cliente (quando não há órgãos ou como opção adicional) */}
              {clienteSelecionado && clienteSelecionado.cnpj && (
                <div className="border rounded-xl p-4 space-y-3 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
                  <div className="text-sm font-medium text-blue-700 dark:text-blue-400 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Vincular o próprio cliente
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {orgaosCliente && orgaosCliente.length > 0 
                      ? "Você pode adicionar o cliente diretamente como entidade, além dos órgãos vinculados"
                      : "Este cliente não possui órgãos cadastrados. Você pode adicioná-lo diretamente como entidade"
                    }
                  </p>
                  {(() => {
                    const clienteJaAdicionado = entidades.some(e => e.cnpj === clienteSelecionado.cnpj)
                    return (
                      <Button
                        type="button"
                        variant={clienteJaAdicionado ? "outline" : "default"}
                        size="sm"
                        disabled={clienteJaAdicionado}
                        onClick={() => {
                          if (!clienteJaAdicionado) {
                            setEntidades([...entidades, {
                              tipo: "Cliente",
                              cnpj: clienteSelecionado.cnpj || "",
                              nome: clienteSelecionado.nome_fantasia || clienteSelecionado.razao_social
                            }])
                          }
                        }}
                      >
                        {clienteJaAdicionado ? (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Cliente já adicionado
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar {clienteSelecionado.nome_fantasia || clienteSelecionado.razao_social}
                          </>
                        )}
                      </Button>
                    )
                  })()}
                </div>
              )}

              {/* Órgãos vinculados ao cliente (se houver cliente selecionado) */}
              {clienteSelecionado && orgaosCliente && orgaosCliente.length > 0 && (
                <div className="border rounded-xl p-4 space-y-3 bg-primary/5 border-primary/20">
                  <div className="text-sm font-medium text-primary flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Órgãos vinculados a {clienteSelecionado.nome_fantasia || clienteSelecionado.razao_social}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Selecione um órgão para adicionar rapidamente
                  </p>
                  <div className="flex gap-3">
                    <Select
                      value=""
                      onValueChange={(orgaoId) => {
                        const orgao = orgaosCliente.find(o => o.id.toString() === orgaoId)
                        if (orgao && orgao.cnpj) {
                          const jaAdicionado = entidades.some(e => e.cnpj === orgao.cnpj)
                          if (!jaAdicionado) {
                            setEntidades([...entidades, { 
                              tipo: orgao.tipo, 
                              cnpj: orgao.cnpj,
                              nome: orgao.nome || TIPOS_ORGAO.find(t => t.value === orgao.tipo)?.label
                            }])
                          }
                        }
                      }}
                    >
                      <SelectTrigger className="flex-1 h-12">
                        <SelectValue placeholder="Selecione um órgão vinculado..." />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-64">
                          {orgaosCliente.map((orgao) => {
                            const jaAdicionado = entidades.some(e => e.cnpj === orgao.cnpj)
                            return (
                              <SelectItem 
                                key={orgao.id} 
                                value={orgao.id.toString()}
                                disabled={jaAdicionado || !orgao.cnpj}
                              >
                                <div className="flex items-center gap-2 py-1">
                                  {jaAdicionado && <Check className="h-4 w-4 text-primary" />}
                                  <div>
                                    <div className={`font-medium ${jaAdicionado ? "text-primary" : ""}`}>
                                      {orgao.nome || TIPOS_ORGAO.find(t => t.value === orgao.tipo)?.label}
                                    </div>
                                    {orgao.cnpj && (
                                      <div className="text-xs text-muted-foreground">
                                        CNPJ: {orgao.cnpj}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </SelectItem>
                            )
                          })}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Contador de órgãos já adicionados */}
                  {entidades.filter(e => orgaosCliente.some(o => o.cnpj === e.cnpj)).length > 0 && (
                    <div className="text-xs text-primary">
                      {entidades.filter(e => orgaosCliente.some(o => o.cnpj === e.cnpj)).length} de {orgaosCliente.length} órgãos já adicionados
                    </div>
                  )}
                </div>
              )}

              {/* Adicionar entidade manualmente */}
              <div className="border rounded-xl p-4 space-y-4">
                <div className="text-sm font-medium text-muted-foreground">
                  Adicionar manualmente
                </div>
                <div className="flex flex-col md:flex-row gap-3">
                  <Select value={novaEntidadeTipo} onValueChange={setNovaEntidadeTipo}>
                    <SelectTrigger className="md:w-80 h-12">
                      <SelectValue placeholder="Tipo de órgão" />
                    </SelectTrigger>
                    <SelectContent>
                      <ScrollArea className="h-64">
                        {TIPOS_ORGAO.map((tipo) => (
                          <SelectItem key={tipo.value} value={tipo.value}>
                            {tipo.label}
                          </SelectItem>
                        ))}
                      </ScrollArea>
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="00.000.000/0000-00"
                    value={novaEntidadeCnpj}
                    onChange={(e) => setNovaEntidadeCnpj(formatCnpj(e.target.value))}
                    className="flex-1 h-12 text-base"
                    maxLength={18}
                  />

                  <Button 
                    onClick={addEntidade} 
                    disabled={!novaEntidadeTipo || !novaEntidadeCnpj}
                    className="h-12 px-8"
                    variant="secondary"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar
                  </Button>
                </div>
              </div>

              {entidades.length > 0 && (
                <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
                  <div className="text-sm font-medium text-muted-foreground">
                    Entidades adicionadas:
                  </div>
                  {entidades.map((entidade, index) => {
                    // Tenta encontrar o nome nos órgãos do cliente se não tiver nome
                    const orgaoDoCliente = orgaosCliente?.find(o => o.cnpj === entidade.cnpj)
                    const nomeExibicao = entidade.nome || orgaoDoCliente?.nome || TIPOS_ORGAO.find(t => t.value === entidade.tipo)?.label || entidade.tipo
                    const tipoLabel = TIPOS_ORGAO.find(t => t.value === entidade.tipo)?.label
                    
                    return (
                      <div key={index} className="flex items-center justify-between p-4 bg-background rounded-lg border">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-semibold">
                              {nomeExibicao}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {tipoLabel && nomeExibicao !== tipoLabel && (
                                <span className="mr-2">{tipoLabel} -</span>
                              )}
                              CNPJ: {entidade.cnpj}
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeEntidade(index)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Módulos */}
          {currentStep === 4 && (
            <div className="space-y-8">
              <div>
                <Label className="text-lg font-semibold">Módulo(s) Atendido(s) *</Label>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Selecione os módulos/sistemas relacionados ao serviço
                </p>
                <MultiSelect
                  options={MODULOS}
                  selected={modulosSelecionados}
                  onChange={setModulosSelecionados}
                  placeholder="Clique para selecionar módulos..."
                  searchPlaceholder="Buscar módulo..."
                  emptyMessage="Nenhum módulo encontrado"
                  maxDisplay={5}
                />
              </div>
            </div>
          )}

          {/* Step 5: Resumo e Data */}
          {currentStep === 5 && (
            <div className="space-y-8">
              <div>
                <Label className="text-lg font-semibold">Resumo do(s) Serviço(s) Realizado(s) *</Label>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Descreva detalhadamente os serviços realizados
                </p>
                <Textarea
                  value={resumo}
                  onChange={(e) => setResumo(e.target.value)}
                  placeholder="Descreva as atividades realizadas..."
                  className="min-h-[200px] text-base resize-none"
                />
              </div>

              <div>
                <Label className="text-lg font-semibold">Data da Prestação do Serviço *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start h-14 mt-3 text-left font-normal text-base">
                      <CalendarIcon className="mr-3 h-5 w-5" />
                      {format(dataServico, "dd/MM/yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dataServico}
                      onSelect={(date) => date && setDataServico(date)}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Step 6: Equipe */}
          {currentStep === 6 && (
            <div className="space-y-8">
              <div>
                <Label className="text-lg font-semibold">Técnico(s) Especializado(s) da Rarotec *</Label>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Selecione os técnicos que realizaram o serviço
                </p>
                <MultiSelect
                  options={tecnicosAtivos.map(t => t.nome)}
                  selected={tecnicosSelecionados.map(id => tecnicosAtivos.find(t => t.id === id)?.nome || "")}
                  onChange={(nomes) => {
                    const ids = nomes.map(nome => tecnicosAtivos.find(t => t.nome === nome)?.id).filter(Boolean) as number[]
                    setTecnicosSelecionados(ids)
                  }}
                  placeholder="Clique para selecionar técnicos..."
                  searchPlaceholder="Buscar técnico..."
                  emptyMessage="Nenhum técnico encontrado"
                  maxDisplay={4}
                />

                {tecnicosSelecionadosData.length > 0 && (
                  <div className="mt-4 p-4 bg-muted/30 rounded-xl border">
                    <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                      <Mail className="h-4 w-4 text-primary" />
                      Emails dos técnicos selecionados:
                    </div>
                    <div className="space-y-2">
                      {tecnicosSelecionadosData.map((t) => (
                        <div key={t.id} className="text-sm flex items-center gap-2">
                          <span className="font-medium">{t.nome}</span>
                          {t.email && (
                            <>
                              <span className="text-muted-foreground">-</span>
                              <span className="text-primary">{t.email}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-lg font-semibold">Técnico(s)/Gestor(es) do Cliente</Label>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Selecione ou adicione os responsáveis do cliente que acompanharam o serviço (opcional)
                </p>

                {/* Dropdown com técnicos cadastrados do cliente */}
                {clienteSelecionado && tecnicosClienteAtivos.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm font-medium text-muted-foreground mb-2">
                      Técnicos cadastrados de {clienteSelecionado.nome_fantasia || clienteSelecionado.razao_social}:
                    </div>
                    <MultiSelect
                      options={tecnicosClienteAtivos.map(t => `${t.nome}${t.cpf ? ` (CPF: ${t.cpf})` : ""}`)}
                      selected={tecnicosCliente
                        .filter(tc => tecnicosClienteAtivos.some(t => t.nome === tc.nome))
                        .map(tc => {
                          const tecDB = tecnicosClienteAtivos.find(t => t.nome === tc.nome)
                          return `${tc.nome}${tecDB?.cpf ? ` (CPF: ${tecDB.cpf})` : ""}`
                        })}
                      onChange={(selecionados) => {
                        // Remove os que estavam selecionados do DB e adiciona os novos
                        const tecnicosManual = tecnicosCliente.filter(tc => 
                          !tecnicosClienteAtivos.some(t => t.nome === tc.nome)
                        )
                        const tecnicosDB = selecionados.map(s => {
                          const nome = s.split(" (CPF:")[0]
                          const tecDB = tecnicosClienteAtivos.find(t => t.nome === nome)
                          return { nome, cpf: tecDB?.cpf || "", email: tecDB?.email || "" }
                        })
                        setTecnicosCliente([...tecnicosDB, ...tecnicosManual])
                      }}
                      placeholder="Selecione técnicos cadastrados..."
                      searchPlaceholder="Buscar técnico..."
                      emptyMessage="Nenhum técnico cadastrado"
                      maxDisplay={3}
                    />
                  </div>
                )}

                {/* Adicionar técnico manualmente */}
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">
                    Adicionar outro técnico/gestor:
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <Input
                      placeholder="Nome completo"
                      value={novoTecnicoNome}
                      onChange={(e) => setNovoTecnicoNome(e.target.value)}
                      className="md:col-span-4 h-12 text-base"
                    />
                    <Input
                      placeholder="000.000.000-00"
                      value={novoTecnicoCpf}
                      onChange={(e) => setNovoTecnicoCpf(formatCpf(e.target.value))}
                      className="md:col-span-2 h-12 text-base"
                      maxLength={14}
                    />
                    <Input
                      placeholder="email@exemplo.com"
                      type="email"
                      value={novoTecnicoEmail}
                      onChange={(e) => setNovoTecnicoEmail(e.target.value)}
                      className="md:col-span-4 h-12 text-base"
                    />
                    <Button 
                      onClick={addTecnicoCliente} 
                      disabled={!novoTecnicoNome}
                      className="md:col-span-2 h-12"
                      variant="secondary"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar
                    </Button>
                  </div>
                </div>

                {tecnicosCliente.length > 0 && (
                  <div className="border rounded-xl p-4 bg-muted/20 mt-4">
                    <div className="text-sm font-medium text-muted-foreground mb-3">
                      T��cnicos/Gestores selecionados ({tecnicosCliente.length}):
                    </div>
                    {tecnicosCliente.map((tc, index) => {
                      // Busca email do banco se não tiver no objeto
                      const tecDB = tecnicosClienteAtivos?.find(t => t.nome === tc.nome || t.cpf === tc.cpf)
                      const emailExibir = tc.email || tecDB?.email || ""
                      const cpfExibir = tc.cpf || tecDB?.cpf || ""
                      
                      return (
                        <div key={index} className="flex items-center justify-between p-3 bg-background rounded-lg border mb-2 last:mb-0">
                          <div>
                            <div className="font-semibold">{tc.nome}</div>
                            <div className="text-sm text-muted-foreground">
                              {cpfExibir && <span>CPF: {cpfExibir}</span>}
                              {cpfExibir && emailExibir && <span className="mx-2">|</span>}
                              {emailExibir && <span>{emailExibir}</span>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removeTecnicoCliente(index)} className="text-destructive hover:text-destructive h-8 w-8">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 7: Anexos e Email */}
          {currentStep === 7 && (
            <div className="space-y-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="h-5 w-5 text-primary" />
                  <Label className="text-lg font-semibold">Email do Cliente</Label>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  O cliente receberá uma cópia do relatório em PDF nestes emails (pré-preenchido com os técnicos/gestores selecionados)
                </p>
                <Textarea
                  value={emailCliente}
                  onChange={(e) => setEmailCliente(e.target.value)}
                  placeholder="email1@cliente.com, email2@cliente.com"
                  className="min-h-[80px] text-base resize-none"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Separe múltiplos emails com vírgula. Você pode adicionar ou remover emails conforme necessário.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="h-5 w-5 text-primary" />
                  <Label className="text-lg font-semibold">Email(s) internos da Rarotec</Label>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Emails internos que também receberão o relatório (pré-preenchido com os técnicos Rarotec selecionados)
                </p>
                <Textarea
                  value={emailsInternos}
                  onChange={(e) => setEmailsInternos(e.target.value)}
                  placeholder="email1@rarotec.com.br, email2@rarotec.com.br"
                  className="min-h-[80px] text-base resize-none"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Separe múltiplos emails com vírgula. Você pode adicionar ou remover emails conforme necessário.
                </p>
              </div>

              <div>
                <Label className="text-lg font-semibold">Anexar Documento(s)</Label>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Adicione fotos, PDFs ou outros documentos relevantes. As imagens serão incorporadas no relatório final.
                </p>

                <label className="border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all">
                  <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                  <span className="text-base font-medium">
                    Arraste e solte arquivos aqui, ou clique para selecionar
                  </span>
                  <span className="text-sm text-muted-foreground mt-2">
                    Suporta PDF, imagens e documentos (máx. 10 arquivos, 10.00 MB cada)
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {anexos.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {anexos.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-primary" />
                          <span className="font-medium">{file.name}</span>
                          <span className="text-sm text-muted-foreground">
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeAnexo(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {currentStep > 1 && (
              <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)} className="h-12 px-6">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Anterior
              </Button>
            )}
            <Button variant="ghost" onClick={limparDados} className="h-12">
              Limpar Dados
            </Button>
          </div>

          <div>
            {currentStep < 7 ? (
              <Button 
                onClick={() => setCurrentStep(currentStep + 1)} 
                disabled={!canProceed}
                className="h-12 px-8"
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button 
                onClick={handleSubmit} 
                disabled={loading}
                className="h-12 px-8"
              >
                <FileCheck className="h-4 w-4 mr-2" />
                {loading ? "Gerando..." : "Gerar Relatório"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center">
                <FileCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              Relatório Gerado com Sucesso!
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">O que você deseja fazer agora?</p>
          
          <div className="space-y-3 mt-4">
            <Button variant="outline" className="w-full justify-start h-14 text-base" onClick={async () => {
              try {
                // Formatar data
                const dataFormatada = dataServico.toLocaleDateString("pt-BR")
                
                const pdfData = {
                  tiposRelatorio: tiposRelatorio.map(t => TIPOS_RELATORIO.find(tr => tr.value === t)?.label || t),
                  dataInicio: dataFormatada,
                  dataFim: dataFormatada,
                  horaInicio: "",
                  horaFim: "",
                  estado: modoLocalizacao === "cliente" && clienteSelecionado?.estado ? clienteSelecionado.estado : estado,
                  municipio: modoLocalizacao === "cliente" && clienteSelecionado?.cidade ? clienteSelecionado.cidade : municipio,
                  cliente: clienteSelecionado ? {
                    nome: clienteSelecionado.nome_fantasia || clienteSelecionado.razao_social || "",
                    cnpj: clienteSelecionado.cnpj || undefined,
                    endereco: clienteSelecionado.endereco || undefined,
                  } : null,
                  entidades: entidades.map(e => ({
                    tipo: TIPOS_ORGAO.find(t => t.value === e.tipo)?.label || e.tipo,
                    cnpj: e.cnpj,
                    nome: e.nome,
                  })),
                  modulos: modulosSelecionados,
                  servicos: tiposRelatorio.map(t => TIPOS_RELATORIO.find(tr => tr.value === t)?.label || t), // Usa os tipos de relatório selecionados na tela 1
                  tecnicosRarotec: tecnicosSelecionados.map(id => {
                    const tec = tecnicosAtivos.find(t => t.id === id)
                    return { nome: tec?.nome || "", email: tec?.email || undefined }
                  }),
                  tecnicosCliente: tecnicosCliente.map(tc => {
                    const tecDB = tecnicosClienteAtivos?.find(t => t.nome === tc.nome || t.cpf === tc.cpf)
                    return {
                      nome: tc.nome,
                      cpf: tc.cpf || tecDB?.cpf || undefined,
                      email: tc.email || tecDB?.email || undefined,
                    }
                  }),
                  descricaoServicos: resumo,
                  observacoes: "",
                  anexos: anexos.map(f => ({ name: f.name, type: f.type })),
                  anexosFiles: anexos,
                  numeroAutenticacao: createdNumeroAutenticacao || undefined,
                  // Rastreabilidade
                  usuarioEmissor: user?.nome || "Usuário do Sistema",
                  dataEmissaoRelatorio: createdDataEmissao || undefined,
                  usuarioDownload: user?.nome || "Usuário do Sistema",
                }
                
                const { generateRelatorioPDF, downloadPDF } = await import("@/lib/pdf-generator")
                const blob = await generateRelatorioPDF(pdfData)
                const dataFilename = dataServico instanceof Date && !isNaN(dataServico.getTime())
                  ? format(dataServico, "yyyy-MM-dd")
                  : format(new Date(), "yyyy-MM-dd")
                const clienteRaw = clienteSelecionado?.nome_fantasia || clienteSelecionado?.razao_social || municipio || "sem-cliente"
                const clienteNome = clienteRaw
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")
                const filename = `relatorio-${clienteNome || "relatorio"}-${dataFilename}.pdf`
                downloadPDF(blob, filename)
              } catch (error: any) {
                console.error("[v0] Erro ao gerar PDF:", error)
                alert(error instanceof Error ? error.message : (error?.message || "Erro ao gerar PDF. Tente novamente."))
              }
            }}>
              <Download className="h-5 w-5 mr-4" />
              Baixar PDF no computador
            </Button>
            
            {createdRelatorioId && (
              <EnviarEmailDialog
                relatorioId={createdRelatorioId}
                numeroAutenticacao={createdNumeroAutenticacao || undefined}
                tecnicos={tecnicosSelecionados.map(id => {
                  const tecnico = tecnicosAtivos.find(t => t.id === id)
                  return tecnico ? { nome: tecnico.nome, email: tecnico.email || "" } : { nome: "", email: "" }
                }).filter(t => t.nome)}
                clienteNome={clienteSelecionado?.nome_fantasia || clienteSelecionado?.razao_social}
                clienteEmail={clienteSelecionado?.email || undefined}
                representantes={tecnicosCliente.map(tc => ({ nome: tc.nome, email: tc.email || "" })).filter(r => r.nome)}
                municipio={modoLocalizacao === "cliente" && clienteSelecionado?.cidade ? clienteSelecionado.cidade : municipio}
                tipoServico={tiposRelatorio.map(t => TIPOS_RELATORIO.find(tr => tr.value === t)?.label || t).join(", ")}
                dataAtendimento={format(dataServico, "dd/MM/yyyy")}
                trigger={
                  <Button variant="outline" className="w-full justify-start h-14 text-base">
                    <Mail className="h-5 w-5 mr-4" />
                    Enviar por email
                  </Button>
                }
              />
            )}
          </div>

          <Button 
            className="w-full mt-4 h-12" 
            onClick={() => {
              setShowSuccess(false)
              limparDados()
            }}
          >
            Concluir e Criar Novo Relatório
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
