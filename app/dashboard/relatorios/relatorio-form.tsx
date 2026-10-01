"use client"

import { useState, useEffect, useMemo } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { 
  Upload, 
  X, 
  Mail, 
  Download, 
  User, 
  Building2, 
  MapPin,
  FileText,
  Plus,
  Check,
  ChevronsUpDown,
  Loader2
} from "lucide-react"
import { MunicipioCombobox } from "@/components/municipio-combobox"
import type { RelatorioVisita, TecnicoRarotec, Cliente, TecnicoCliente } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

// Orgaos de Atendimento conforme PDF
const ORGAOS_ATENDIMENTO = [
  "Prefeitura Municipal",
  "Camara Municipal", 
  "Instituto de Previdencia",
  "Secretaria/Fundo de Saude",
  "Secretaria/Fundo de Educacao",
  "Secretaria/Fundo de Assistencia Social",
  "Secretaria/Fundo de Transporte",
  "Secretaria/Fundo de Agricultura e Abastecimento",
  "Secretaria/Fundo de Energia e Iluminacao",
  "Secretaria/Fundo de Aguas e Esgoto",
  "Consorcio",
  "Governo Estadual (Executivo)",
  "Governo Estadual (Legislativo)",
  "Governo Estadual (Autarquia)",
  "Escritorio Contabil/Juridico",
]

// Modulos/Sistemas conforme PDF
const MODULOS_SISTEMAS = [
  "Contabilidade",
  "Controle Interno",
  "Assinatura Digital",
  "Recursos Humanos",
  "Portal do Servidor",
  "Patrimonio",
  "Almoxarifado",
  "Contratos e Convenios",
  "Plano de Contratacoes Anuais",
  "Licitacao e Pregao Gerencial",
  "Frota de Veiculos",
  "Protocolo",
  "Processos e Documentos Digitais",
  "Gerenciador Eletronico de Documentos",
  "Business Intelligence",
  "Tributos",
  "Nota Fiscal Eletronica",
  "Rimob",
  "PagTributos",
  "Portal da Transparencia",
  "Outro",
]

// Temas de Relatorio conforme PDF
const TEMAS_RELATORIO = [
  "Visita Tecnica",
  "Treinamento",
  "Reuniao",
  "Cadastro de Usuario",
  "Atendimento Remoto",
  "Migracao",
  "Outro",
]

// Estados brasileiros
const ESTADOS = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapa" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceara" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espirito Santo" },
  { sigla: "GO", nome: "Goias" },
  { sigla: "MA", nome: "Maranhao" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Para" },
  { sigla: "PB", nome: "Paraiba" },
  { sigla: "PR", nome: "Parana" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piaui" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondonia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "Sao Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
]

interface RelatorioFormProps {
  relatorio: RelatorioVisita | null
  onClose: () => void
}

export function RelatorioForm({ relatorio, onClose }: RelatorioFormProps) {
  const { data: tecnicos } = useSWR<TecnicoRarotec[]>("/api/tecnicos-rarotec", fetcher)
  const { data: clientes } = useSWR<Cliente[]>("/api/clientes", fetcher)
  const { data: allTecnicosClientes } = useSWR<TecnicoCliente[]>("/api/tecnicos-clientes", fetcher)
  
  const [loading, setLoading] = useState(false)
  const [tecnicoClienteSearch, setTecnicoClienteSearch] = useState("")
  const [tecnicoClienteOpen, setTecnicoClienteOpen] = useState(false)
  const [showNewTecnicoCliente, setShowNewTecnicoCliente] = useState(false)
  const [anexos, setAnexos] = useState<File[]>([])

  // Form data
  const [formData, setFormData] = useState({
    // Localizacao
    estado: relatorio?.estado || "PE",
    municipio: relatorio?.municipio || "",
    orgao_atendido: relatorio?.orgao_atendido || "",
    
    // Modulos (array)
    modulos: relatorio?.modulos || [] as string[],
    
    // Tecnicos Rarotec (array de IDs)
    tecnicos_rarotec_ids: relatorio?.tecnicos_rarotec_ids || [] as number[],
    
    // Tema e Data
    tema: relatorio?.tema || "Visita Tecnica",
    data_relatorio: relatorio?.data_relatorio?.split("T")[0] || format(new Date(), "yyyy-MM-dd"),
    
    // Historico
    historico: relatorio?.historico || "",
    
    // Tecnico Cliente
    tecnico_cliente_id: relatorio?.tecnico_cliente_id?.toString() || "",
    
    // Novo tecnico cliente (inline)
    novo_tecnico_cliente: {
      nome: "",
      email: "",
      cpf: "",
      celular: "",
      departamento: "",
    },
  })

  // Filtra tecnicos clientes pela busca
  const filteredTecnicosClientes = useMemo(() => {
    if (!tecnicoClienteSearch || tecnicoClienteSearch.length < 2) return allTecnicosClientes || []
    const search = tecnicoClienteSearch.toLowerCase()
    return (allTecnicosClientes || []).filter(t => 
      t.nome.toLowerCase().includes(search) ||
      t.email?.toLowerCase().includes(search) ||
      t.cpf?.includes(search)
    )
  }, [allTecnicosClientes, tecnicoClienteSearch])

  // Toggle modulo
  const toggleModulo = (modulo: string) => {
    setFormData(prev => ({
      ...prev,
      modulos: prev.modulos.includes(modulo)
        ? prev.modulos.filter(m => m !== modulo)
        : [...prev.modulos, modulo]
    }))
  }

  // Toggle tecnico Rarotec
  const toggleTecnicoRarotec = (id: number) => {
    setFormData(prev => ({
      ...prev,
      tecnicos_rarotec_ids: prev.tecnicos_rarotec_ids.includes(id)
        ? prev.tecnicos_rarotec_ids.filter(t => t !== id)
        : [...prev.tecnicos_rarotec_ids, id]
    }))
  }

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAnexos(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const removeAnexo = (index: number) => {
    setAnexos(prev => prev.filter((_, i) => i !== index))
  }

  // Submit
  const handleSubmit = async (action: "save" | "email" | "download") => {
    if (formData.tecnicos_rarotec_ids.length === 0) {
      alert("Selecione pelo menos um funcionario da Rarotec")
      return
    }

    if (!formData.municipio) {
      alert("Selecione o municipio")
      return
    }

    setLoading(true)
    try {
      // Se estiver criando novo tecnico cliente
      let tecnicoClienteId = formData.tecnico_cliente_id ? parseInt(formData.tecnico_cliente_id) : null
      
      if (showNewTecnicoCliente && formData.novo_tecnico_cliente.nome) {
        const resTecnico = await fetch("/api/tecnicos-clientes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData.novo_tecnico_cliente,
            estado: formData.estado,
            municipio: formData.municipio,
          }),
        })
        const novoTecnico = await resTecnico.json()
        tecnicoClienteId = novoTecnico.id
      }

      const url = relatorio ? `/api/relatorios/${relatorio.id}` : "/api/relatorios"
      const method = relatorio ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: formData.estado,
          municipio: formData.municipio,
          orgao_atendido: formData.orgao_atendido,
          modulos: formData.modulos,
          tecnicos_rarotec_ids: formData.tecnicos_rarotec_ids,
          tema: formData.tema,
          data_relatorio: formData.data_relatorio,
          historico: formData.historico,
          tecnico_cliente_id: tecnicoClienteId,
          // Para compatibilidade com estrutura antiga
          tecnico_rarotec_id: formData.tecnicos_rarotec_ids[0] || null,
          data_visita: formData.data_relatorio,
          tipo_servico: formData.tema,
          descricao_servico: formData.historico,
          status: "pendente",
        }),
      })

      const savedRelatorio = await response.json()

      // Upload de anexos se houver
      if (anexos.length > 0) {
        const formDataUpload = new FormData()
        anexos.forEach(file => formDataUpload.append("files", file))
        formDataUpload.append("relatorio_id", savedRelatorio.id.toString())
        
        await fetch("/api/relatorios/anexos", {
          method: "POST",
          body: formDataUpload,
        })
      }

      if (action === "email") {
        // Enviar por email
        const emailRes = await fetch("/api/email/enviar-relatorio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            relatorioId: savedRelatorio.id,
            destinatarios: ["tecnico", "cliente"],
          }),
        })
        if (emailRes.ok) {
          alert("Relatório salvo e enviado por email!")
        } else {
          const err = await emailRes.json().catch(() => ({}))
          alert(`Relatório salvo, mas houve falha no envio do email: ${err.error || "Erro desconhecido"}`)
        }
      } else if (action === "download") {
        // Fazer download do PDF
        window.open(`/api/relatorios/${savedRelatorio.id}/pdf`, "_blank")
      }

      onClose()
    } catch (error) {
      console.error("Erro ao salvar relatorio:", error)
      alert("Erro ao salvar relatorio")
    } finally {
      setLoading(false)
    }
  }

  const tecnicosAtivos = tecnicos?.filter(t => t.ativo) || []
  const selectedTecnico = formData.tecnico_cliente_id 
    ? allTecnicosClientes?.find(t => t.id === parseInt(formData.tecnico_cliente_id))
    : null

  return (
    <div className="space-y-6">
      {/* Secao: Localizacao */}
      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Localizacao
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Estado */}
          <div className="space-y-2">
            <Label>Estado *</Label>
            <Select 
              value={formData.estado} 
              onValueChange={(v) => setFormData({ ...formData, estado: v, municipio: "" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS.map(e => (
                  <SelectItem key={e.sigla} value={e.sigla}>
                    {e.sigla} - {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Municipio */}
          <div className="space-y-2">
            <Label>Municipio *</Label>
            <MunicipioCombobox
              value={formData.municipio ? `${formData.municipio}/${formData.estado}` : ""}
              onValueChange={(v) => {
                // Extrai nome e UF do valor "Cidade/UF"
                const parts = v.split("/")
                if (parts.length === 2) {
                  setFormData({ ...formData, municipio: parts[0], estado: parts[1] })
                } else {
                  setFormData({ ...formData, municipio: v })
                }
              }}
              placeholder="Selecione o municipio..."
            />
          </div>
        </div>

        {/* Orgao Atendido */}
        <div className="space-y-2">
          <Label>Orgao Atendido *</Label>
          <Select 
            value={formData.orgao_atendido} 
            onValueChange={(v) => setFormData({ ...formData, orgao_atendido: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o orgao..." />
            </SelectTrigger>
            <SelectContent>
              {ORGAOS_ATENDIMENTO.map(o => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Secao: Modulos/Sistemas */}
      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Modulos/Sistemas Atendidos
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {MODULOS_SISTEMAS.map(modulo => (
            <div key={modulo} className="flex items-center space-x-2">
              <Checkbox
                id={`modulo-${modulo}`}
                checked={formData.modulos.includes(modulo)}
                onCheckedChange={() => toggleModulo(modulo)}
              />
              <label
                htmlFor={`modulo-${modulo}`}
                className="text-sm cursor-pointer"
              >
                {modulo}
              </label>
            </div>
          ))}
        </div>
        {formData.modulos.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {formData.modulos.map(m => (
              <Badge key={m} variant="secondary" className="text-xs">
                {m}
                <button onClick={() => toggleModulo(m)} className="ml-1">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Secao: Funcionarios Rarotec */}
      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <User className="h-4 w-4" />
          Funcionarios da Rarotec *
        </h3>
        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-md p-2">
          {tecnicosAtivos.map(tecnico => (
            <div key={tecnico.id} className="flex items-center space-x-2">
              <Checkbox
                id={`tecnico-${tecnico.id}`}
                checked={formData.tecnicos_rarotec_ids.includes(tecnico.id)}
                onCheckedChange={() => toggleTecnicoRarotec(tecnico.id)}
              />
              <label
                htmlFor={`tecnico-${tecnico.id}`}
                className="text-sm cursor-pointer flex-1"
              >
                <div>{tecnico.nome}</div>
                <div className="text-xs text-muted-foreground">{tecnico.email}</div>
              </label>
            </div>
          ))}
        </div>
        {formData.tecnicos_rarotec_ids.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {formData.tecnicos_rarotec_ids.map(id => {
              const tecnico = tecnicosAtivos.find(t => t.id === id)
              return tecnico ? (
                <Badge key={id} className="text-xs">
                  {tecnico.nome}
                  <button onClick={() => toggleTecnicoRarotec(id)} className="ml-1">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ) : null
            })}
          </div>
        )}
      </div>

      <Separator />

      {/* Secao: Tema e Data */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Tema */}
          <div className="space-y-2">
            <Label>Tema do Relatorio *</Label>
            <Select 
              value={formData.tema} 
              onValueChange={(v) => setFormData({ ...formData, tema: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMAS_RELATORIO.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data do Relatorio */}
          <div className="space-y-2">
            <Label>Data do Relatorio *</Label>
            <Input
              type="date"
              value={formData.data_relatorio}
              onChange={(e) => setFormData({ ...formData, data_relatorio: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Data da visita/atendimento, nao a data de criacao
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Secao: Historico */}
      <div className="space-y-4">
        <h3 className="font-semibold">Historico / Descricao</h3>
        <Textarea
          value={formData.historico}
          onChange={(e) => setFormData({ ...formData, historico: e.target.value })}
          rows={6}
          placeholder="Descreva detalhadamente o atendimento realizado, problemas encontrados, solucoes aplicadas, etc..."
        />
      </div>

      <Separator />

      {/* Secao: Tecnico Cliente */}
      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Tecnico/Funcionario do Cliente
        </h3>
        
        {!showNewTecnicoCliente ? (
          <div className="space-y-2">
            <Popover open={tecnicoClienteOpen} onOpenChange={setTecnicoClienteOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={tecnicoClienteOpen}
                  className="w-full justify-between"
                >
                  {selectedTecnico
                    ? `${selectedTecnico.nome} ${selectedTecnico.email ? `(${selectedTecnico.email})` : ""}`
                    : "Buscar tecnico cliente..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput 
                    placeholder="Digite nome, email ou CPF..." 
                    value={tecnicoClienteSearch}
                    onValueChange={setTecnicoClienteSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      Nenhum tecnico encontrado.
                      <Button
                        variant="link"
                        className="w-full mt-2"
                        onClick={() => {
                          setShowNewTecnicoCliente(true)
                          setTecnicoClienteOpen(false)
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Cadastrar novo
                      </Button>
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredTecnicosClientes.slice(0, 20).map((tecnico) => (
                        <CommandItem
                          key={tecnico.id}
                          value={tecnico.nome}
                          onSelect={() => {
                            setFormData({ ...formData, tecnico_cliente_id: tecnico.id.toString() })
                            setTecnicoClienteOpen(false)
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              formData.tecnico_cliente_id === tecnico.id.toString() 
                                ? "opacity-100" 
                                : "opacity-0"
                            }`}
                          />
                          <div>
                            <div>{tecnico.nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {tecnico.email} {tecnico.cargo && `- ${tecnico.cargo}`}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowNewTecnicoCliente(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Cadastrar novo funcionario
            </Button>
          </div>
        ) : (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Novo Funcionario do Cliente</h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowNewTecnicoCliente(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={formData.novo_tecnico_cliente.nome}
                  onChange={(e) => setFormData({
                    ...formData,
                    novo_tecnico_cliente: { ...formData.novo_tecnico_cliente, nome: e.target.value }
                  })}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.novo_tecnico_cliente.email}
                  onChange={(e) => setFormData({
                    ...formData,
                    novo_tecnico_cliente: { ...formData.novo_tecnico_cliente, email: e.target.value }
                  })}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input
                  value={formData.novo_tecnico_cliente.cpf}
                  onChange={(e) => setFormData({
                    ...formData,
                    novo_tecnico_cliente: { ...formData.novo_tecnico_cliente, cpf: e.target.value }
                  })}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-2">
                <Label>Celular</Label>
                <Input
                  value={formData.novo_tecnico_cliente.celular}
                  onChange={(e) => setFormData({
                    ...formData,
                    novo_tecnico_cliente: { ...formData.novo_tecnico_cliente, celular: e.target.value }
                  })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Departamento/Setor</Label>
                <Input
                  value={formData.novo_tecnico_cliente.departamento}
                  onChange={(e) => setFormData({
                    ...formData,
                    novo_tecnico_cliente: { ...formData.novo_tecnico_cliente, departamento: e.target.value }
                  })}
                  placeholder="Ex: Contabilidade"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Secao: Anexos */}
      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Anexos
        </h3>
        <div className="flex items-center gap-4">
          <Input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
            onChange={handleFileUpload}
            className="flex-1"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Formatos aceitos: PDF, Word, Excel, Imagens
        </p>
        {anexos.length > 0 && (
          <div className="space-y-2">
            {anexos.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm truncate">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAnexo(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Botoes de Acao */}
      <div className="flex justify-between gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <div className="flex gap-2">
          <Button 
            type="button" 
            variant="outline"
            onClick={() => handleSubmit("download")}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Salvar e Download
          </Button>
          <Button 
            type="button" 
            variant="outline"
            onClick={() => handleSubmit("email")}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Salvar e Enviar Email
          </Button>
          <Button 
            type="button"
            onClick={() => handleSubmit("save")}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}
