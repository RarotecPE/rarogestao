"use client"

import { useState } from "react"
import useSWR from "swr"
import { Plus, Pencil, Trash2, Users, Search, Phone, Mail, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { TecnicoClienteForm } from "./tecnico-cliente-form"
import { ExportButton } from "@/components/export-button"
import { ListPagination, usePagination } from "@/components/list-pagination"
import { toast } from "sonner"
import type { TecnicoCliente } from "@/lib/types"

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || "Erro ao carregar técnicos dos clientes")
  return data
}

export default function TecnicosClientesPage() {
  const { data: tecnicos, mutate } = useSWR<TecnicoCliente[]>("/api/tecnicos-clientes", fetcher)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [selectedTecnico, setSelectedTecnico] = useState<TecnicoCliente | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  const filteredTecnicos = tecnicos?.filter(
    (tecnico) =>
      tecnico.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tecnico.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tecnico.cargo?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const tecnicosPagination = usePagination(filteredTecnicos, {
    initialPageSize: 12,
    pageSizeOptions: [12, 24, 48, 96],
    resetKey: searchTerm,
  })

  const handleEdit = (tecnico: TecnicoCliente) => {
    setSelectedTecnico(tecnico)
    setIsFormOpen(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este técnico?")) return

    const previousTecnicos = tecnicos ?? []
    mutate(
      previousTecnicos.filter((t) => t.id !== id),
      false
    )

    try {
      const res = await fetch(`/api/tecnicos-clientes/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || "Erro ao excluir técnico")
      }
      toast.success("Técnico excluído com sucesso")
      await mutate()
    } catch (error) {
      mutate(previousTecnicos, false)
      toast.error(error instanceof Error ? error.message : "Erro ao excluir técnico")
    }
  }

  const handleFormClose = () => {
    setIsFormOpen(false)
    setSelectedTecnico(null)
  }

  const handleFormSuccess = async (saved?: TecnicoCliente) => {
    setIsFormOpen(false)
    const isEditing = Boolean(selectedTecnico)
    setSelectedTecnico(null)
    if (saved && saved.id) {
      if (isEditing) {
        mutate(
          (tecnicos ?? []).map((t) => (t.id === saved.id ? { ...t, ...saved } : t)),
          false
        )
      } else {
        mutate([saved, ...(tecnicos ?? [])], false)
      }
    }
    toast.success(isEditing ? "Técnico atualizado com sucesso" : "Técnico cadastrado com sucesso")
    await mutate()
  }

  const handleNewTecnico = () => {
    setSelectedTecnico(null)
    setIsFormOpen(true)
  }

  // Funções de exportação
  const handleExportExcel = async () => {
    if (!filteredTecnicos) return
    const { exportToExcel } = await import("@/lib/export-utils")
    exportToExcel({
      filename: "tecnicos-clientes",
      title: "Lista de Técnicos dos Clientes",
      columns: [
        { header: "Nome", key: "nome", width: 25 },
        { header: "Cargo", key: "cargo", width: 20 },
        { header: "Cliente", key: "cliente_nome", width: 30 },
        { header: "Departamento", key: "departamento", width: 20 },
        { header: "E-mail", key: "email", width: 30 },
        { header: "Celular", key: "celular", width: 18 },
        { header: "Status", key: "status", width: 10 },
      ],
      data: filteredTecnicos.map(t => ({
        ...t,
        status: t.ativo ? "Ativo" : "Inativo"
      }))
    })
  }

  const handleExportPDF = async () => {
    if (!filteredTecnicos) return
    const { exportToPDF } = await import("@/lib/export-utils")
    exportToPDF({
      filename: "tecnicos-clientes",
      title: "Lista de Técnicos dos Clientes",
      columns: [
        { header: "Nome", key: "nome" },
        { header: "Cargo", key: "cargo" },
        { header: "Cliente", key: "cliente_nome" },
        { header: "E-mail", key: "email" },
        { header: "Status", key: "status" },
      ],
      data: filteredTecnicos.map(t => ({
        ...t,
        status: t.ativo ? "Ativo" : "Inativo"
      }))
    })
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Tecnicos dos Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie os funcionarios/contatos dos clientes
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <ExportButton
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            disabled={!filteredTecnicos || filteredTecnicos.length === 0}
          />
          <Button onClick={handleNewTecnico} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Novo Tecnico
          </Button>
        </div>
      </div>

      {/* Stats Card */}
      <Card className="border shadow-sm">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{tecnicos?.length || 0}</p>
            <p className="text-sm text-muted-foreground">Total de Tecnicos</p>
          </div>
        </CardContent>
      </Card>

      {/* Card Principal com Busca e Lista */}
      <Card className="border shadow-sm">
        <CardContent className="p-6">
          {/* Busca */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-base font-medium">Lista de Tecnicos</p>
                <p className="text-sm text-muted-foreground">{filteredTecnicos?.length || 0} resultado(s)</p>
              </div>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, cliente ou cargo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Lista de Tecnicos */}
          {filteredTecnicos?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/30">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Nenhum tecnico encontrado</p>
              <p className="text-sm">Cadastre o primeiro tecnico clicando no botao acima</p>
            </div>
          ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tecnicosPagination.paginatedItems.map((tecnico) => (
            <Card key={tecnico.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">
                      {tecnico.nome}
                    </h3>
                    {tecnico.cargo && (
                      <p className="text-sm text-muted-foreground truncate">
                        {tecnico.cargo}
                      </p>
                    )}
                  </div>
                  <Badge variant={tecnico.ativo ? "default" : "secondary"} className="shrink-0">
                    {tecnico.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                {/* Cliente */}
                {tecnico.cliente_nome && (
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate text-muted-foreground">
                      {tecnico.cliente_nome}
                    </span>
                  </div>
                )}

                {/* Departamento */}
                {tecnico.departamento && (
                  <div className="text-sm text-muted-foreground mb-2">
                    <span className="font-medium text-foreground">Depto:</span> {tecnico.departamento}
                  </div>
                )}

                {/* Contatos */}
                <div className="space-y-1 mt-3 pt-3 border-t">
                  {tecnico.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <a 
                        href={`mailto:${tecnico.email}`}
                        className="text-primary hover:underline truncate"
                      >
                        {tecnico.email}
                      </a>
                    </div>
                  )}
                  {tecnico.celular && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <a 
                        href={`tel:${tecnico.celular.replace(/\D/g, "")}`}
                        className="text-primary hover:underline"
                      >
                        {tecnico.celular}
                      </a>
                    </div>
                  )}
                  {!tecnico.email && !tecnico.celular && (
                    <p className="text-sm text-muted-foreground">Sem contato cadastrado</p>
                  )}
                </div>

                {/* Acoes */}
                <div className="flex gap-2 mt-4 pt-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(tecnico)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(tecnico.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
          )}
          {(filteredTecnicos?.length ?? 0) > 0 && (
            <ListPagination
              page={tecnicosPagination.page}
              pageSize={tecnicosPagination.pageSize}
              totalItems={tecnicosPagination.totalItems}
              onPageChange={tecnicosPagination.setPage}
              onPageSizeChange={tecnicosPagination.setPageSize}
              pageSizeOptions={tecnicosPagination.pageSizeOptions}
              itemLabel="técnicos"
              className="mt-6 rounded-lg border"
            />
          )}
        </CardContent>
      </Card>

      {/* Dialog do Formulario */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTecnico ? "Editar Tecnico" : "Novo Tecnico do Cliente"}
            </DialogTitle>
          </DialogHeader>
          <TecnicoClienteForm
            tecnico={selectedTecnico}
            onClose={handleFormClose}
            onSuccess={handleFormSuccess}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
