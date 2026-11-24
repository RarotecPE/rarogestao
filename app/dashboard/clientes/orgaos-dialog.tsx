"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { MaskedInput } from "@/components/masked-input"
import { ModulosSelector } from "@/components/modulos-selector"
import { TIPOS_ORGAO, ESTADOS_BR } from "@/lib/constants"
import { ListPagination, usePagination } from "@/components/list-pagination"
import { Plus, Pencil, Trash2, X, Save, Search, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import type { Cliente } from "@/lib/types"

interface Orgao {
  id: number
  cliente_id: number
  tipo: string
  nome: string
  cnpj?: string
  endereco?: string
  cidade?: string
  estado?: string
  telefone?: string
  email?: string
  created_at?: string
}

interface Municipio {
  id: number
  nome: string
}

interface OrgaosDialogProps {
  cliente: Cliente
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OrgaosDialog({ cliente, open, onOpenChange }: OrgaosDialogProps) {
  const [orgaos, setOrgaos] = useState<Orgao[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    tipo: "",
    nome: "",
    cnpj: "",
    endereco: "",
    cidade: "",
    estado: "",
    telefone: "",
    email: "",
  })

  // Estado para busca de CNPJ
  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [cnpjMessage, setCnpjMessage] = useState("")

  // Estado para popups de pesquisa
  const [showEstadoSearch, setShowEstadoSearch] = useState(false)
  const [showMunicipioSearch, setShowMunicipioSearch] = useState(false)
  const [estadoSearchTerm, setEstadoSearchTerm] = useState("")
  const [municipioSearchTerm, setMunicipioSearchTerm] = useState("")
  const [municipios, setMunicipios] = useState<Municipio[]>([])
  const [loadingMunicipios, setLoadingMunicipios] = useState(false)

  const orgaosPagination = usePagination(orgaos, {
    initialPageSize: 10,
    pageSizeOptions: [10, 20, 50],
    resetKey: `${cliente.id}|${open}`,
  })

  useEffect(() => {
    if (open && cliente) {
      fetchOrgaos()
    }
  }, [open, cliente])

  async function fetchOrgaos() {
    try {
      const res = await fetch(`/api/orgaos?cliente_id=${cliente.id}`)
      if (res.ok) {
        const data = await res.json()
        setOrgaos(data)
      }
    } catch (error) {
      console.error("Erro ao buscar orgaos:", error)
    }
  }

  async function fetchMunicipios(uf: string) {
    setLoadingMunicipios(true)
    try {
      const res = await fetch(`/api/ibge?tipo=municipios&uf=${uf}`)
      const data = await res.json()
      setMunicipios(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Erro ao buscar municipios:", error)
      setMunicipios([])
    } finally {
      setLoadingMunicipios(false)
    }
  }

  // Buscar dados do CNPJ na Receita Federal
  async function buscarCnpj() {
    const cnpjLimpo = formData.cnpj.replace(/\D/g, "")
    
    if (cnpjLimpo.length !== 14) {
      setCnpjStatus("error")
      setCnpjMessage("CNPJ deve ter 14 digitos")
      return
    }

    setCnpjStatus("loading")
    setCnpjMessage("")

    try {
      const res = await fetch(`/api/cnpj?cnpj=${cnpjLimpo}`)
      const data = await res.json()

      if (data.error) {
        setCnpjStatus("error")
        setCnpjMessage(data.error)
        return
      }

      // Preencher os dados do formulario
      setFormData((prev) => ({
        ...prev,
        nome: data.razao_social || data.nome_fantasia || prev.nome,
        endereco: [data.logradouro, data.numero, data.complemento, data.bairro]
          .filter(Boolean)
          .join(", ") || prev.endereco,
        cidade: data.cidade || prev.cidade,
        estado: data.estado || prev.estado,
        telefone: data.telefone || prev.telefone,
        email: data.email || prev.email,
      }))

      setCnpjStatus("success")
      setCnpjMessage("Dados carregados com sucesso!")

      // Limpar mensagem apos 3 segundos
      setTimeout(() => {
        setCnpjStatus("idle")
        setCnpjMessage("")
      }, 3000)
    } catch (error) {
      setCnpjStatus("error")
      setCnpjMessage("Erro ao consultar CNPJ. Tente novamente.")
    }
  }

  function resetForm() {
    setFormData({
      tipo: "",
      nome: "",
      cnpj: "",
      endereco: "",
      cidade: "",
      estado: "",
      telefone: "",
      email: "",
    })
    setEditingId(null)
    setShowForm(false)
    setCnpjStatus("idle")
    setCnpjMessage("")
  }

  function handleEdit(orgao: Orgao) {
    setFormData({
      tipo: orgao.tipo,
      nome: orgao.nome,
      cnpj: orgao.cnpj || "",
      endereco: orgao.endereco || "",
      cidade: orgao.cidade || "",
      estado: orgao.estado || "",
      telefone: orgao.telefone || "",
      email: orgao.email || "",
    })
    setEditingId(orgao.id)
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const url = editingId ? `/api/orgaos/${editingId}` : "/api/orgaos"
      const method = editingId ? "PUT" : "POST"

      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, cliente_id: cliente.id }),
      })

      await fetchOrgaos()
      resetForm()
    } catch (error) {
      console.error("Erro ao salvar orgao:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Tem certeza que deseja excluir este órgão?")) return

    const previousOrgaos = orgaos
    setOrgaos(previousOrgaos.filter((o) => o.id !== id))

    try {
      const res = await fetch(`/api/orgaos/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || "Erro ao excluir órgão")
      }
      toast.success("Órgão excluído com sucesso")
      await fetchOrgaos()
    } catch (error) {
      setOrgaos(previousOrgaos)
      toast.error(error instanceof Error ? error.message : "Erro ao excluir órgão")
    }
  }

  function handleSelectEstado(sigla: string) {
    setFormData({ ...formData, estado: sigla })
    setShowEstadoSearch(false)
    setEstadoSearchTerm("")
  }

  function handleOpenMunicipioSearch() {
    if (formData.estado) {
      fetchMunicipios(formData.estado)
    }
    setShowMunicipioSearch(true)
  }

  function handleSelectMunicipio(nome: string) {
    setFormData({ ...formData, cidade: nome })
    setShowMunicipioSearch(false)
    setMunicipioSearchTerm("")
  }

  // Filtrar estados
  const filteredEstados = ESTADOS_BR.filter(
    (e) =>
      e.nome.toLowerCase().includes(estadoSearchTerm.toLowerCase()) ||
      e.sigla.toLowerCase().includes(estadoSearchTerm.toLowerCase())
  )

  // Filtrar municipios
  const filteredMunicipios = municipios.filter((m) =>
    m.nome.toLowerCase().includes(municipioSearchTerm.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Orgaos do Cliente: {cliente.nome_fantasia || cliente.razao_social}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!showForm ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Orgao
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-4 bg-muted/50">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">{editingId ? "Editar" : "Novo"} Orgao</h3>
                <Button type="button" variant="ghost" size="icon" onClick={resetForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Campo CNPJ com busca - Destaque principal */}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
                <Label className="text-base font-semibold">CNPJ do Orgao</Label>
                <p className="text-sm text-muted-foreground">
                  Informe o CNPJ para buscar automaticamente os dados na Receita Federal
                </p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <MaskedInput
                      mask="cnpj"
                      value={formData.cnpj}
                      onChange={(value) => setFormData({ ...formData, cnpj: value })}
                      placeholder="00.000.000/0000-00"
                      className="text-lg h-12"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={buscarCnpj}
                    disabled={cnpjStatus === "loading"}
                    className="h-12 px-6"
                  >
                    {cnpjStatus === "loading" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        Buscar
                      </>
                    )}
                  </Button>
                </div>
                
                {/* Feedback da busca */}
                {cnpjMessage && (
                  <div className={`flex items-center gap-2 text-sm ${
                    cnpjStatus === "success" ? "text-green-600" : "text-destructive"
                  }`}>
                    {cnpjStatus === "success" ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    {cnpjMessage}
                  </div>
                )}
              </div>

              {/* Campos do formulario */}
              <div className="space-y-4">
                {/* Tipo de Órgão - linha completa */}
                <div className="space-y-2">
                  <Label>Tipo de Órgão *</Label>
                  <Select
                    value={formData.tipo}
                    onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_ORGAO.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {tipo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Nome do Órgão - linha completa */}
                <div className="space-y-2">
                  <Label>Nome do Órgão *</Label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Ex: Prefeitura Municipal de..."
                    required
                  />
                </div>

                {/* Telefone e E-mail lado a lado */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <MaskedInput
                      mask="celular"
                      value={formData.telefone}
                      onChange={(value) => setFormData({ ...formData, telefone: value })}
                      placeholder="(00) 00000-0000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value.toLowerCase() })}
                      placeholder="email@orgao.gov.br"
                  />
                  </div>
                </div>

                {/* Endereço - linha completa */}
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Input
                    value={formData.endereco}
                    onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                    placeholder="Logradouro, número, complemento, bairro"
                  />
                </div>

                {/* Estado e Município lado a lado */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Estado com campo livre e botao de pesquisa */}
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <div className="flex gap-2">
                      <Input
                        value={formData.estado}
                        onChange={(e) => setFormData({ ...formData, estado: e.target.value.toUpperCase() })}
                        placeholder="UF"
                        maxLength={2}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setShowEstadoSearch(true)}
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Municipio com campo livre e botao de pesquisa */}
                  <div className="space-y-2">
                    <Label>Município</Label>
                    <div className="flex gap-2">
                      <Input
                        value={formData.cidade}
                        onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                        placeholder="Nome do município"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleOpenMunicipioSearch}
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modulos Vinculados ao Orgao */}
              <ModulosSelector 
                tipo="orgao" 
                entidadeId={editingId}
                label="Módulos do Órgão"
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  <Save className="mr-2 h-4 w-4" />
                  {loading ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          )}

          {/* Lista de Orgaos em Cards */}
          {orgaos.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 border rounded-lg bg-muted/30">
              Nenhum orgao cadastrado para este cliente.
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                {orgaos.length} orgao(s) cadastrado(s)
              </h4>
              {orgaosPagination.paginatedItems.map((orgao) => (
                <div
                  key={orgao.id}
                  className="border rounded-lg p-4 bg-card hover:shadow-sm transition-shadow"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Cabecalho: Tipo e Nome */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {orgao.tipo}
                        </span>
                      </div>
                      <h3 className="font-semibold text-foreground truncate">
                        {orgao.nome}
                      </h3>
                      
                      {/* Informacoes */}
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                        {orgao.cnpj && (
                          <div className="text-muted-foreground">
                            <span className="font-medium text-foreground">CNPJ:</span> {orgao.cnpj}
                          </div>
                        )}
                        {(orgao.cidade || orgao.estado) && (
                          <div className="text-muted-foreground">
                            <span className="font-medium text-foreground">Local:</span>{" "}
                            {[orgao.cidade, orgao.estado].filter(Boolean).join("/")}
                          </div>
                        )}
                        {orgao.telefone && (
                          <div className="text-muted-foreground">
                            <span className="font-medium text-foreground">Telefone:</span> {orgao.telefone}
                          </div>
                        )}
                        {orgao.email && (
                          <div className="text-muted-foreground">
                            <span className="font-medium text-foreground">E-mail:</span> {orgao.email}
                          </div>
                        )}
                        {orgao.endereco && (
                          <div className="text-muted-foreground sm:col-span-2">
                            <span className="font-medium text-foreground">Endereco:</span> {orgao.endereco}
                          </div>
                        )}
                        {orgao.created_at && (
                          <div className="text-muted-foreground">
                            <span className="font-medium text-foreground">Cadastro:</span>{" "}
                            {format(new Date(orgao.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Botoes de Acao */}
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(orgao)}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(orgao.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <ListPagination
                page={orgaosPagination.page}
                pageSize={orgaosPagination.pageSize}
                totalItems={orgaosPagination.totalItems}
                onPageChange={orgaosPagination.setPage}
                onPageSizeChange={orgaosPagination.setPageSize}
                pageSizeOptions={orgaosPagination.pageSizeOptions}
                itemLabel="órgãos"
                hideWhenSinglePage
                className="rounded-lg border"
              />
            </div>
          )}
        </div>

        {/* Dialog de pesquisa de Estado */}
        <Dialog open={showEstadoSearch} onOpenChange={setShowEstadoSearch}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Pesquisar Estado</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar estado..."
                  value={estadoSearchTerm}
                  onChange={(e) => setEstadoSearchTerm(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto border rounded-md">
                {filteredEstados.length === 0 ? (
                  <p className="p-4 text-center text-muted-foreground">
                    Nenhum estado encontrado.
                  </p>
                ) : (
                  filteredEstados.map((estado) => (
                    <button
                      key={estado.sigla}
                      type="button"
                      onClick={() => handleSelectEstado(estado.sigla)}
                      className="w-full px-4 py-2 text-left hover:bg-muted transition-colors border-b last:border-b-0"
                    >
                      <span className="font-medium">{estado.sigla}</span>
                      <span className="text-muted-foreground ml-2">- {estado.nome}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog de pesquisa de Municipio */}
        <Dialog open={showMunicipioSearch} onOpenChange={setShowMunicipioSearch}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                Pesquisar Municipio {formData.estado && `- ${formData.estado}`}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {!formData.estado ? (
                <p className="text-center text-muted-foreground py-4">
                  Informe o estado primeiro para buscar municipios.
                </p>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar municipio..."
                      value={municipioSearchTerm}
                      onChange={(e) => setMunicipioSearchTerm(e.target.value)}
                      className="pl-9"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto border rounded-md">
                    {loadingMunicipios ? (
                      <p className="p-4 text-center text-muted-foreground">
                        Carregando municipios...
                      </p>
                    ) : filteredMunicipios.length === 0 ? (
                      <p className="p-4 text-center text-muted-foreground">
                        Nenhum municipio encontrado.
                      </p>
                    ) : (
                      filteredMunicipios.map((municipio) => (
                        <button
                          key={municipio.id}
                          type="button"
                          onClick={() => handleSelectMunicipio(municipio.nome)}
                          className="w-full px-4 py-2 text-left hover:bg-muted transition-colors border-b last:border-b-0"
                        >
                          {municipio.nome}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
