"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { MaskedInput } from "@/components/masked-input"
import { ModulosSelector } from "@/components/modulos-selector"
import { Loader2, Search, CheckCircle2, AlertCircle, Building2 } from "lucide-react"
import { ESTADOS_BR } from "@/lib/constants"
import type { Cliente } from "@/lib/types"

interface Municipio {
  id: number
  nome: string
}

interface ClienteFormProps {
  cliente: Cliente | null
  onClose: () => void
  onSuccess?: (saved?: Cliente) => void
}

export function ClienteForm({ cliente, onClose, onSuccess }: ClienteFormProps) {
  const [loading, setLoading] = useState(false)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "success" | "error">("idle")
  const [cnpjMessage, setCnpjMessage] = useState("")
  
  // Estados para os popups de pesquisa
  const [showEstadoSearch, setShowEstadoSearch] = useState(false)
  const [showMunicipioSearch, setShowMunicipioSearch] = useState(false)
  const [municipios, setMunicipios] = useState<Municipio[]>([])
  const [loadingMunicipios, setLoadingMunicipios] = useState(false)
  
  const [formData, setFormData] = useState({
    razao_social: cliente?.razao_social || "",
    nome_fantasia: cliente?.nome_fantasia || "",
    cnpj: cliente?.cnpj || "",
    inscricao_estadual: cliente?.inscricao_estadual || "",
    logradouro: cliente?.endereco?.split(",")[0]?.trim() || "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: cliente?.cidade || "",
    estado: cliente?.estado || "",
    cep: cliente?.cep || "",
    telefone: cliente?.telefone || "",
    email: cliente?.email || "",
    website: cliente?.website || "",
    situacao_cadastral: "",
    data_abertura: "",
    observacoes: cliente?.observacoes || "",
    ativo: cliente?.ativo !== false,
  })

  const fetchMunicipios = async (uf: string) => {
    setLoadingMunicipios(true)
    try {
      const res = await fetch(`/api/ibge?tipo=municipios&uf=${uf}`)
      const data = await res.json()
      // A API retorna um array diretamente, não um objeto com propriedade municipios
      setMunicipios(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Erro ao buscar municipios:", error)
      setMunicipios([])
    } finally {
      setLoadingMunicipios(false)
    }
  }

  const handleEstadoSelect = (sigla: string, nome: string) => {
    setFormData({ ...formData, estado: sigla })
    setShowEstadoSearch(false)
  }

  const handleOpenMunicipioSearch = () => {
    if (formData.estado) {
      fetchMunicipios(formData.estado)
    }
    setShowMunicipioSearch(true)
  }

  const handleMunicipioSelect = (nome: string) => {
    setFormData({ ...formData, cidade: nome })
    setShowMunicipioSearch(false)
  }

  const buscarCnpj = async () => {
    const cnpjLimpo = formData.cnpj.replace(/\D/g, "")
    if (cnpjLimpo.length !== 14) {
      setCnpjStatus("error")
      setCnpjMessage("CNPJ deve ter 14 digitos")
      return
    }

    setBuscandoCnpj(true)
    setCnpjStatus("idle")
    setCnpjMessage("")

    try {
      const res = await fetch(`/api/cnpj?cnpj=${cnpjLimpo}`)
      const data = await res.json()

      if (data.error) {
        setCnpjStatus("error")
        setCnpjMessage(data.error)
        return
      }

      // Preenche todos os dados do formulario diretamente
      setFormData((prev) => ({
        ...prev,
        razao_social: data.razao_social || prev.razao_social,
        nome_fantasia: data.nome_fantasia || prev.nome_fantasia,
        logradouro: data.logradouro || prev.logradouro,
        numero: data.numero || prev.numero,
        complemento: data.complemento || prev.complemento,
        bairro: data.bairro || prev.bairro,
        estado: data.estado || prev.estado,
        cidade: data.cidade || prev.cidade,
        cep: data.cep || prev.cep,
        telefone: data.telefone || prev.telefone,
        email: data.email || prev.email,
        situacao_cadastral: data.situacao || prev.situacao_cadastral,
        data_abertura: data.data_abertura || prev.data_abertura,
      }))

      setCnpjStatus("success")
      setCnpjMessage(`Dados carregados! Situacao: ${data.situacao || "N/A"}`)
    } catch (error) {
      console.error("Erro ao buscar CNPJ:", error)
      setCnpjStatus("error")
      setCnpjMessage("Erro ao consultar CNPJ. Tente novamente.")
    } finally {
      setBuscandoCnpj(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const enderecoCompleto = [
        formData.logradouro,
        formData.numero && `n ${formData.numero}`,
        formData.complemento,
        formData.bairro,
      ].filter(Boolean).join(", ")

      const dataToSend = {
        ...formData,
        endereco: enderecoCompleto,
      }

      const url = cliente ? `/api/clientes/${cliente.id}` : "/api/clientes"
      const method = cliente ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSend),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error || "Erro ao salvar cliente")
      }

      const saved = await res.json().catch(() => null)
      if (onSuccess) {
        onSuccess(saved)
      } else {
        onClose()
      }
    } catch (error) {
      console.error("Erro ao salvar cliente:", error)
      alert(error instanceof Error ? error.message : "Erro ao salvar cliente")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* CNPJ - Figura Central */}
        <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-5 w-5 text-primary" />
            <Label htmlFor="cnpj" className="text-base font-semibold">
              CNPJ do Cliente
            </Label>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Informe o CNPJ para buscar automaticamente os dados da Receita Federal
          </p>
          
          <div className="flex gap-2">
            <div className="flex-1">
              <MaskedInput
                mask="cnpj"
                id="cnpj"
                value={formData.cnpj}
                onChange={(value) => {
                  setFormData({ ...formData, cnpj: value })
                  setCnpjStatus("idle")
                  setCnpjMessage("")
                }}
                placeholder="00.000.000/0000-00"
                className="text-lg h-12 font-mono"
              />
            </div>
            <Button
              type="button"
              onClick={buscarCnpj}
              disabled={buscandoCnpj || formData.cnpj.replace(/\D/g, "").length !== 14}
              className="h-12 px-6"
            >
              {buscandoCnpj ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Search className="h-5 w-5 mr-2" />
                  Buscar
                </>
              )}
            </Button>
          </div>

          {cnpjMessage && (
            <div className={`mt-3 flex items-center gap-2 text-sm p-2 rounded ${
              cnpjStatus === "success" 
                ? "bg-green-50 text-green-700 border border-green-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" 
                : "bg-red-50 text-red-700 border border-red-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
            }`}>
              {cnpjStatus === "success" ? (
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              {cnpjMessage}
            </div>
          )}
        </div>

        {/* Dados da Empresa */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider border-b pb-2">
            Dados da Empresa
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="razao_social">Razao Social *</Label>
              <Input
                id="razao_social"
                value={formData.razao_social}
                onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                required
                className="mt-1.5"
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="nome_fantasia">Nome Fantasia</Label>
              <Input
                id="nome_fantasia"
                value={formData.nome_fantasia}
                onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="inscricao_estadual">Inscricao Estadual</Label>
              <Input
                id="inscricao_estadual"
                value={formData.inscricao_estadual}
                onChange={(e) => setFormData({ ...formData, inscricao_estadual: e.target.value })}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="data_abertura">Data de Abertura</Label>
              <Input
                id="data_abertura"
                value={formData.data_abertura}
                onChange={(e) => setFormData({ ...formData, data_abertura: e.target.value })}
                className="mt-1.5 bg-muted/50"
                readOnly
              />
            </div>

            <div>
              <Label htmlFor="telefone">Telefone</Label>
              <MaskedInput
                mask="telefone"
                id="telefone"
                value={formData.telefone}
                onChange={(value) => setFormData({ ...formData, telefone: value })}
                placeholder="(00) 0000-0000"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@empresa.com"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://..."
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="situacao_cadastral">Situacao Cadastral</Label>
              <Input
                id="situacao_cadastral"
                value={formData.situacao_cadastral}
                onChange={(e) => setFormData({ ...formData, situacao_cadastral: e.target.value })}
                className="mt-1.5 bg-muted/50"
                readOnly
              />
            </div>
          </div>
        </div>

        {/* Endereco */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider border-b pb-2">
            Endereco
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div className="sm:col-span-4">
              <Label htmlFor="logradouro">Logradouro</Label>
              <Input
                id="logradouro"
                value={formData.logradouro}
                onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                placeholder="Rua, Avenida, etc."
                className="mt-1.5"
              />
            </div>

            <div className="sm:col-span-1">
              <Label htmlFor="numero">Numero</Label>
              <Input
                id="numero"
                value={formData.numero}
                onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                placeholder="123"
                className="mt-1.5"
              />
            </div>

            <div className="sm:col-span-1">
              <Label htmlFor="cep">CEP</Label>
              <MaskedInput
                mask="cep"
                id="cep"
                value={formData.cep}
                onChange={(value) => setFormData({ ...formData, cep: value })}
                placeholder="00000-000"
                className="mt-1.5"
              />
            </div>

            <div className="sm:col-span-3">
              <Label htmlFor="complemento">Complemento</Label>
              <Input
                id="complemento"
                value={formData.complemento}
                onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                placeholder="Sala, Andar, etc."
                className="mt-1.5"
              />
            </div>

            <div className="sm:col-span-3">
              <Label htmlFor="bairro">Bairro</Label>
              <Input
                id="bairro"
                value={formData.bairro}
                onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                className="mt-1.5"
              />
            </div>

            <div className="sm:col-span-2">
              <Label>Estado</Label>
              <div className="flex gap-1 mt-1.5">
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

            <div className="sm:col-span-4">
              <Label>Municipio</Label>
              <div className="flex gap-1 mt-1.5">
                <Input
                  value={formData.cidade}
                  onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                  placeholder="Nome do municipio"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleOpenMunicipioSearch}
                  disabled={!formData.estado}
                  title={!formData.estado ? "Informe o estado primeiro" : "Pesquisar municipio"}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Observacoes */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="observacoes">Observacoes</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              rows={3}
              className="mt-1.5"
              placeholder="Informacoes adicionais sobre o cliente..."
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="ativo"
              checked={formData.ativo}
              onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
            />
            <Label htmlFor="ativo">Cliente ativo</Label>
          </div>
        </div>

        {/* Módulos Vinculados */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider border-b pb-2">
            Módulos Contratados
          </h3>
          <ModulosSelector 
            tipo="cliente" 
            entidadeId={cliente?.id || null}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {cliente ? "Salvar Alteracoes" : "Cadastrar Cliente"}
          </Button>
        </div>
      </form>

      {/* Dialog de Pesquisa de Estado */}
      <Dialog open={showEstadoSearch} onOpenChange={setShowEstadoSearch}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pesquisar Estado</DialogTitle>
          </DialogHeader>
          <Command className="rounded-lg border">
            <CommandInput placeholder="Digite o nome ou sigla do estado..." />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>Nenhum estado encontrado.</CommandEmpty>
              <CommandGroup>
                {ESTADOS_BR.map((estado) => (
                  <CommandItem
                    key={estado.sigla}
                    value={`${estado.sigla} ${estado.nome}`}
                    onSelect={() => handleEstadoSelect(estado.sigla, estado.nome)}
                    className="cursor-pointer"
                  >
                    <span className="font-medium w-8">{estado.sigla}</span>
                    <span className="text-muted-foreground">{estado.nome}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {/* Dialog de Pesquisa de Municipio */}
      <Dialog open={showMunicipioSearch} onOpenChange={setShowMunicipioSearch}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pesquisar Municipio - {formData.estado}</DialogTitle>
          </DialogHeader>
          {loadingMunicipios ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Carregando municipios...</span>
            </div>
          ) : (
            <Command className="rounded-lg border">
              <CommandInput placeholder="Digite o nome do municipio..." />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>Nenhum municipio encontrado.</CommandEmpty>
                <CommandGroup>
                  {municipios.map((municipio) => (
                    <CommandItem
                      key={municipio.id}
                      value={municipio.nome}
                      onSelect={() => handleMunicipioSelect(municipio.nome)}
                      className="cursor-pointer"
                    >
                      {municipio.nome}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
