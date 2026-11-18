"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { uploadArquivo } from "@/lib/upload-blob"
import { Plus, Pencil, Trash2, FileText, Upload, Download, Loader2, X, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TIPOS_CONTRATO } from "@/lib/constants"
import { toast } from "sonner"
import type { Cliente, Contrato, AditivoContrato } from "@/lib/types"

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || "Erro ao carregar dados")
  return data
}

interface ContratosDialogProps {
  cliente: Cliente
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContratosDialog({ cliente, open, onOpenChange }: ContratosDialogProps) {
  const { data: contratos, mutate } = useSWR<Contrato[]>(
    open ? `/api/contratos?cliente_id=${cliente.id}` : null,
    fetcher
  )
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedContrato, setSelectedContrato] = useState<Contrato | null>(null)
  const [expandedContrato, setExpandedContrato] = useState<number | null>(null)

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este contrato?")) return

    const previousContratos = contratos ?? []
    mutate(
      previousContratos.filter((c) => c.id !== id),
      false
    )

    try {
      const res = await fetch(`/api/contratos/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || "Erro ao excluir contrato")
      }
      toast.success("Contrato excluído com sucesso")
      await mutate()
    } catch (err) {
      mutate(previousContratos, false)
      toast.error(err instanceof Error ? err.message : "Erro ao excluir contrato")
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR")
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Contratos - {cliente.nome_fantasia || cliente.razao_social}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setSelectedContrato(null); setIsFormOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Contrato
            </Button>
          </div>

          {contratos?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum contrato cadastrado para este cliente
            </div>
          ) : (
            <div className="space-y-2">
              {contratos?.map((contrato) => (
                <Collapsible
                  key={contrato.id}
                  open={expandedContrato === contrato.id}
                  onOpenChange={(open) => setExpandedContrato(open ? contrato.id : null)}
                >
                  <div className="border rounded-lg">
                    <div className="w-full p-4 flex items-center justify-between hover:bg-muted/50">
                      <CollapsibleTrigger asChild>
                        <div className="flex-1 flex items-center justify-between cursor-pointer mr-4">
                          <div className="flex items-center gap-4">
                            <div className="text-left">
                              <p className="font-medium">{contrato.numero_contrato}</p>
                              <p className="text-sm text-muted-foreground">{contrato.tipo}</p>
                            </div>
                            <Badge variant={contrato.status === "ativo" ? "default" : "secondary"}>
                              {contrato.status}
                            </Badge>
                          </div>
                          <div className="text-right text-sm">
                            <p>{formatDate(contrato.data_inicio)}</p>
                            {contrato.valor_total && (
                              <p className="font-medium">{formatCurrency(contrato.valor_total)}</p>
                            )}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-1">
                        {contrato.arquivo_url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              // Para blobs privados/R2, usa a API /api/file
                              window.open(`/api/file?pathname=${encodeURIComponent(contrato.arquivo_url!)}`, "_blank")
                            }}
                            title="Baixar contrato"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setSelectedContrato(contrato); setIsFormOpen(true) }}
                          title="Editar contrato"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(contrato.id)}
                          title="Excluir contrato"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={expandedContrato === contrato.id ? "Recolher" : "Expandir"}
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform duration-200 ${
                                expandedContrato === contrato.id ? "rotate-180" : ""
                              }`}
                            />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <div className="px-4 pb-4 border-t pt-4">
                        {contrato.descricao && (
                          <p className="text-sm text-muted-foreground mb-4">{contrato.descricao}</p>
                        )}
                        <AditivosSection contratoId={contrato.id} />
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </div>

        {isFormOpen && (
          <ContratoFormDialog
            clienteId={cliente.id}
            contrato={selectedContrato}
            open={isFormOpen}
            onOpenChange={setIsFormOpen}
            onSave={() => { setIsFormOpen(false); mutate() }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function AditivosSection({ contratoId }: { contratoId: number }) {
  const { data: aditivos, mutate } = useSWR<AditivoContrato[]>(
    `/api/aditivos?contrato_id=${contratoId}`,
    fetcher
  )
  const [isFormOpen, setIsFormOpen] = useState(false)

  const formatDate = (date: string) => new Date(date).toLocaleDateString("pt-BR")
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este aditivo?")) return

    const previousAditivos = aditivos ?? []
    mutate(
      previousAditivos.filter((a) => a.id !== id),
      false
    )

    try {
      const res = await fetch(`/api/aditivos/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || "Erro ao excluir aditivo")
      }
      toast.success("Aditivo excluído com sucesso")
      await mutate()
    } catch (err) {
      mutate(previousAditivos, false)
      toast.error(err instanceof Error ? err.message : "Erro ao excluir aditivo")
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm">Aditivos</h4>
        <Button size="sm" variant="outline" onClick={() => setIsFormOpen(true)}>
          <Plus className="mr-1 h-3 w-3" />
          Aditivo
        </Button>
      </div>
      {aditivos?.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum aditivo cadastrado</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numero</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Valor Adicional</TableHead>
              <TableHead>Descricao</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aditivos?.map((aditivo) => (
              <TableRow key={aditivo.id}>
                <TableCell>{aditivo.numero_aditivo}</TableCell>
                <TableCell>{formatDate(aditivo.data_aditivo)}</TableCell>
                <TableCell>
                  {aditivo.valor_adicional ? formatCurrency(aditivo.valor_adicional) : "-"}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">{aditivo.descricao || "-"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(aditivo.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {isFormOpen && (
        <AditivoFormDialog
          contratoId={contratoId}
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          onSave={() => { setIsFormOpen(false); mutate() }}
        />
      )}
    </div>
  )
}

function ContratoFormDialog({
  clienteId,
  contrato,
  open,
  onOpenChange,
  onSave,
}: {
  clienteId: number
  contrato: Contrato | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [arquivoNome, setArquivoNome] = useState<string | null>(
    contrato?.arquivo_url ? contrato.arquivo_url.split("/").pop() || null : null
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [formData, setFormData] = useState({
    numero_contrato: contrato?.numero_contrato || "",
    tipo: contrato?.tipo || "",
    data_inicio: contrato?.data_inicio?.split("T")[0] || "",
    data_fim: contrato?.data_fim?.split("T")[0] || "",
    valor_total: contrato?.valor_total?.toString() || "",
    descricao: contrato?.descricao || "",
    status: contrato?.status || "ativo",
    arquivo_url: contrato?.arquivo_url || "",
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const data = await uploadArquivo(file)

      // Para blobs privados, salvamos o pathname para usar com /api/file
      setFormData((prev) => ({ ...prev, arquivo_url: data.pathname }))
      setArquivoNome(file.name)
    } catch (error) {
      console.error("Erro no upload:", error)
      alert(error instanceof Error ? error.message : "Erro ao fazer upload do arquivo")
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const url = contrato ? `/api/contratos/${contrato.id}` : "/api/contratos"
      const method = contrato ? "PUT" : "POST"

      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          cliente_id: clienteId,
          valor_total: formData.valor_total ? parseFloat(formData.valor_total) : null,
        }),
      })

      onSave()
    } catch (error) {
      console.error("Erro ao salvar contrato:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{contrato ? "Editar Contrato" : "Novo Contrato"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="numero_contrato">Numero do Contrato *</Label>
              <Input
                id="numero_contrato"
                value={formData.numero_contrato}
                onChange={(e) => setFormData({ ...formData, numero_contrato: e.target.value })}
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="tipo">Modalidade *</Label>
              <Select
                value={formData.tipo}
                onValueChange={(value) => setFormData({ ...formData, tipo: value })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_CONTRATO.map((tipo) => (
                    <SelectItem key={tipo} value={tipo}>
                      {tipo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="data_inicio">Data Inicio *</Label>
              <Input
                id="data_inicio"
                type="date"
                value={formData.data_inicio}
                onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="data_fim">Data Fim</Label>
              <Input
                id="data_fim"
                type="date"
                value={formData.data_fim}
                onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="valor_total">Valor Total do Contrato (R$)</Label>
              <Input
                id="valor_total"
                type="number"
                step="0.01"
                value={formData.valor_total}
                onChange={(e) => setFormData({ ...formData, valor_total: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label htmlFor="descricao">Descricao</Label>
              <Textarea
                id="descricao"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                rows={2}
                className="mt-1.5"
              />
            </div>

            <div className="col-span-2">
              <Label>Anexar Contrato (PDF)</Label>
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,.doc,.docx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      {arquivoNome ? "Trocar arquivo" : "Selecionar arquivo"}
                    </>
                  )}
                </Button>
                {arquivoNome && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                    <FileText className="h-4 w-4" />
                    <span className="max-w-[150px] truncate">{arquivoNome}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, arquivo_url: "" }))
                        setArquivoNome(null)
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || uploading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {contrato ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AditivoFormDialog({
  contratoId,
  open,
  onOpenChange,
  onSave,
}: {
  contratoId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    numero_aditivo: "",
    data_aditivo: "",
    valor_adicional: "",
    descricao: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await fetch("/api/aditivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          contrato_id: contratoId,
          valor_adicional: formData.valor_adicional ? parseFloat(formData.valor_adicional) : null,
        }),
      })
      onSave()
    } catch (error) {
      console.error("Erro ao salvar aditivo:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Aditivo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="numero_aditivo">Numero do Aditivo *</Label>
              <Input
                id="numero_aditivo"
                value={formData.numero_aditivo}
                onChange={(e) => setFormData({ ...formData, numero_aditivo: e.target.value })}
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="data_aditivo">Data *</Label>
              <Input
                id="data_aditivo"
                type="date"
                value={formData.data_aditivo}
                onChange={(e) => setFormData({ ...formData, data_aditivo: e.target.value })}
                required
                className="mt-1.5"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="valor_adicional">Valor Adicional (R$)</Label>
              <Input
                id="valor_adicional"
                type="number"
                step="0.01"
                value={formData.valor_adicional}
                onChange={(e) => setFormData({ ...formData, valor_adicional: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="descricao">Descricao</Label>
              <Textarea
                id="descricao"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                rows={2}
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
