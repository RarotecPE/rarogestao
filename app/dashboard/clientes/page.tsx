"use client"

import { useState } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Building2, 
  FileText, 
  Search, 
  Landmark,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import dynamic from "next/dynamic"
import { Badge } from "@/components/ui/badge"
import { ClienteForm } from "./cliente-form"
import { ContratosDialog } from "./contratos-dialog"
import { OrgaosDialog } from "./orgaos-dialog"
import { ExportButton } from "@/components/export-button"
import { ListPagination, usePagination } from "@/components/list-pagination"
import { toast } from "sonner"
import type { Cliente } from "@/lib/types"

const ClientesLote = dynamic(() => import("@/components/clientes-lote").then((m) => m.ClientesLote), {
  ssr: false,
})

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || "Erro ao carregar clientes")
  return data
}

export default function ClientesPage() {
  const { data: clientes, mutate, isLoading } = useSWR<Cliente[]>("/api/clientes", fetcher)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isContratosOpen, setIsContratosOpen] = useState(false)
  const [isOrgaosOpen, setIsOrgaosOpen] = useState(false)
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  const filteredClientes = clientes?.filter(
    (cliente) =>
      cliente.razao_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.nome_fantasia?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.cnpj?.includes(searchTerm)
  )

  const totalAtivos = clientes?.filter((c) => c.ativo).length || 0
  const totalInativos = clientes?.filter((c) => !c.ativo).length || 0

  const clientesPagination = usePagination(filteredClientes, {
    initialPageSize: 20,
    resetKey: searchTerm,
  })

  const handleEdit = (cliente: Cliente) => {
    setSelectedCliente(cliente)
    setIsFormOpen(true)
  }

  const handleContratos = (cliente: Cliente) => {
    setSelectedCliente(cliente)
    setIsContratosOpen(true)
  }

  const handleOrgaos = (cliente: Cliente) => {
    setSelectedCliente(cliente)
    setIsOrgaosOpen(true)
  }

  const handleDelete = async (cliente: Cliente) => {
    if (!confirm(`Tem certeza que deseja excluir "${cliente.nome_fantasia || cliente.razao_social}"?`)) return

    const previousClientes = clientes ?? []
    mutate(
      previousClientes.filter((c) => c.id !== cliente.id),
      false
    )

    try {
      const res = await fetch(`/api/clientes/${cliente.id}`, { method: "DELETE" })

      // Clientes ja utilizados nao podem ser excluidos (409), apenas inativados.
      if (res.status === 409) {
        mutate(previousClientes, false)
        const data = await res.json().catch(() => ({}))
        const inativar = confirm(
          `${data.message || "Este cliente ja foi utilizado e nao pode ser excluido."}\n\nDeseja INATIVAR este cliente agora?`
        )
        if (inativar) {
          mutate(
            previousClientes.map((c) => (c.id === cliente.id ? { ...c, ativo: false } : c)),
            false
          )
          const putRes = await fetch(`/api/clientes/${cliente.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...cliente, ativo: false }),
          })
          if (!putRes.ok) {
            mutate(previousClientes, false)
            throw new Error("Erro ao inativar cliente")
          }
          toast.success("Cliente inativado com sucesso")
          await mutate()
        }
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Erro ao excluir cliente")
      }

      toast.success("Cliente excluído com sucesso")
      await mutate()
    } catch (error) {
      mutate(previousClientes, false)
      toast.error(error instanceof Error ? error.message : "Erro ao excluir cliente")
    }
  }

  const handleFormClose = () => {
    setIsFormOpen(false)
    setSelectedCliente(null)
  }

  const handleFormSuccess = async (savedCliente?: Cliente) => {
    setIsFormOpen(false)
    const isEditing = Boolean(selectedCliente)
    setSelectedCliente(null)
    if (savedCliente && savedCliente.id) {
      if (isEditing) {
        mutate(
          (clientes ?? []).map((c) => (c.id === savedCliente.id ? { ...c, ...savedCliente } : c)),
          false
        )
      } else {
        mutate([savedCliente, ...(clientes ?? [])], false)
      }
    }
    toast.success(isEditing ? "Cliente atualizado com sucesso" : "Cliente cadastrado com sucesso")
    await mutate()
  }

  // Funções de exportação
  const handleExportExcel = async () => {
    if (!filteredClientes) return
    const { exportToExcel } = await import("@/lib/export-utils")
    exportToExcel({
      filename: "clientes",
      title: "Lista de Clientes - Rarotec",
      columns: [
        { header: "Razão Social", key: "razao_social", width: 35 },
        { header: "Nome Fantasia", key: "nome_fantasia", width: 30 },
        { header: "CNPJ", key: "cnpj", width: 20 },
        { header: "Cidade", key: "cidade", width: 20 },
        { header: "UF", key: "estado", width: 5 },
        { header: "Telefone", key: "telefone", width: 15 },
        { header: "E-mail", key: "email", width: 30 },
        { header: "Status", key: "status", width: 10 },
        { header: "Cadastro", key: "created_at", width: 12 },
      ],
      data: filteredClientes.map(c => ({
        ...c,
        status: c.ativo ? "Ativo" : "Inativo"
      }))
    })
  }

  const handleExportPDF = async () => {
    if (!filteredClientes) return
    const { exportToPDF } = await import("@/lib/export-utils")
    exportToPDF({
      filename: "clientes",
      title: "Lista de Clientes - Rarotec",
      columns: [
        { header: "Razão Social", key: "razao_social" },
        { header: "CNPJ", key: "cnpj" },
        { header: "Cidade/UF", key: "cidade_uf" },
        { header: "Telefone", key: "telefone" },
        { header: "Status", key: "status" },
      ],
      data: filteredClientes.map(c => ({
        ...c,
        cidade_uf: `${c.cidade || "-"}/${c.estado || "-"}`,
        status: c.ativo ? "Ativo" : "Inativo"
      }))
    })
  }

  const handleExportExcelWithOrgaos = async () => {
    if (!filteredClientes) return
    
    // Buscar órgãos de todos os clientes
    const clientesComOrgaos = await Promise.all(
      filteredClientes.map(async (cliente) => {
        const res = await fetch(`/api/clientes/${cliente.id}/orgaos`)
        const orgaos = res.ok ? await res.json() : []
        return { cliente, orgaos }
      })
    )

    // Preparar dados dos órgãos
    const todosOrgaos = clientesComOrgaos.flatMap(({ cliente, orgaos }) =>
      orgaos.map((orgao: any) => ({
        cliente_nome: cliente.nome_fantasia || cliente.razao_social,
        cliente_cnpj: cliente.cnpj,
        ...orgao
      }))
    )

    const { exportToExcelMultiSheet } = await import("@/lib/export-utils")
    exportToExcelMultiSheet("clientes-completo", [
      {
        name: "Clientes",
        title: "Lista de Clientes",
        columns: [
          { header: "Razão Social", key: "razao_social", width: 35 },
          { header: "Nome Fantasia", key: "nome_fantasia", width: 30 },
          { header: "CNPJ", key: "cnpj", width: 20 },
          { header: "Cidade", key: "cidade", width: 20 },
          { header: "UF", key: "estado", width: 5 },
          { header: "Telefone", key: "telefone", width: 15 },
          { header: "E-mail", key: "email", width: 30 },
          { header: "Status", key: "status", width: 10 },
        ],
        data: filteredClientes.map(c => ({
          ...c,
          status: c.ativo ? "Ativo" : "Inativo"
        }))
      },
      {
        name: "Órgãos Vinculados",
        title: "Órgãos Vinculados aos Clientes",
        columns: [
          { header: "Cliente", key: "cliente_nome", width: 30 },
          { header: "CNPJ Cliente", key: "cliente_cnpj", width: 20 },
          { header: "Tipo Órgão", key: "tipo", width: 25 },
          { header: "Nome Órgão", key: "nome", width: 35 },
          { header: "CNPJ Órgão", key: "cnpj", width: 20 },
          { header: "Cidade", key: "cidade", width: 20 },
          { header: "UF", key: "estado", width: 5 },
        ],
        data: todosOrgaos
      }
    ])
  }

  const handleExportPDFWithOrgaos = async () => {
    if (!filteredClientes) return
    
    // Buscar órgãos de todos os clientes
    const clientesComOrgaos = await Promise.all(
      filteredClientes.map(async (cliente) => {
        const res = await fetch(`/api/clientes/${cliente.id}/orgaos`)
        const orgaos = res.ok ? await res.json() : []
        return { cliente, orgaos }
      })
    )

    const todosOrgaos = clientesComOrgaos.flatMap(({ cliente, orgaos }) =>
      orgaos.map((orgao: any) => ({
        cliente_nome: cliente.nome_fantasia || cliente.razao_social,
        ...orgao
      }))
    )

    const { exportToPDFMultiSection } = await import("@/lib/export-utils")
    exportToPDFMultiSection("clientes-completo", "Relatório Completo de Clientes - Rarotec", [
      {
        title: "Lista de Clientes",
        columns: [
          { header: "Razão Social", key: "razao_social" },
          { header: "CNPJ", key: "cnpj" },
          { header: "Cidade/UF", key: "cidade_uf" },
          { header: "Status", key: "status" },
        ],
        data: filteredClientes.map(c => ({
          ...c,
          cidade_uf: `${c.cidade || "-"}/${c.estado || "-"}`,
          status: c.ativo ? "Ativo" : "Inativo"
        }))
      },
      {
        title: "Órgãos Vinculados",
        columns: [
          { header: "Cliente", key: "cliente_nome" },
          { header: "Tipo", key: "tipo" },
          { header: "Nome do Órgão", key: "nome" },
          { header: "CNPJ", key: "cnpj" },
        ],
        data: todosOrgaos
      }
    ])
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie as empresas parceiras
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <ExportButton
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            onExportExcelWithDetails={handleExportExcelWithOrgaos}
            onExportPDFWithDetails={handleExportPDFWithOrgaos}
            detailsLabel="com Órgãos"
            disabled={!filteredClientes || filteredClientes.length === 0}
          />
          <ClientesLote onImported={() => mutate()} />
          <Button onClick={() => { setSelectedCliente(null); setIsFormOpen(true); }} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{clientes?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{totalAtivos}</p>
              <p className="text-sm text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-500/10 dark:bg-slate-500/15">
              <XCircle className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{totalInativos}</p>
              <p className="text-sm text-muted-foreground">Inativos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-medium">Lista de Clientes</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, fantasia ou CNPJ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-medium">Empresa</TableHead>
                  <TableHead className="font-medium hidden md:table-cell">CNPJ</TableHead>
                  <TableHead className="font-medium hidden lg:table-cell">Cidade/UF</TableHead>
                  <TableHead className="font-medium hidden xl:table-cell">Telefone</TableHead>
                  <TableHead className="font-medium hidden xl:table-cell">Cadastro</TableHead>
                  <TableHead className="font-medium">Status</TableHead>
                  <TableHead className="font-medium w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredClientes?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Building2 className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">
                          {searchTerm ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  clientesPagination.paginatedItems.map((cliente) => (
                    <TableRow key={cliente.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-medium">
                            {(cliente.nome_fantasia || cliente.razao_social).substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {cliente.nome_fantasia || cliente.razao_social}
                            </p>
                            {cliente.nome_fantasia && (
                              <p className="text-xs text-muted-foreground truncate">
                                {cliente.razao_social}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {cliente.cnpj || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {cliente.cidade && cliente.estado
                          ? `${cliente.cidade}/${cliente.estado}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden xl:table-cell">
                        {cliente.telefone || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden xl:table-cell">
                        {cliente.created_at 
                          ? format(new Date(cliente.created_at), "dd/MM/yyyy", { locale: ptBR })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary"
                          className={
                            cliente.ativo 
                              ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300" 
                              : "bg-slate-500/15 text-slate-700 hover:bg-slate-500/20 dark:text-slate-300"
                          }
                        >
                          {cliente.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(cliente)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleContratos(cliente)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Contratos
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOrgaos(cliente)}>
                              <Landmark className="mr-2 h-4 w-4" />
                              Orgaos
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDelete(cliente)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {!isLoading && (filteredClientes?.length ?? 0) > 0 && (
            <ListPagination
              page={clientesPagination.page}
              pageSize={clientesPagination.pageSize}
              totalItems={clientesPagination.totalItems}
              onPageChange={clientesPagination.setPage}
              onPageSizeChange={clientesPagination.setPageSize}
              itemLabel="clientes"
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCliente ? "Editar Cliente" : "Novo Cliente"}
            </DialogTitle>
            <DialogDescription>
              {selectedCliente
                ? "Atualize as informacoes do cliente"
                : "Preencha os dados do novo cliente"}
            </DialogDescription>
          </DialogHeader>
          <ClienteForm
            cliente={selectedCliente}
            onClose={handleFormClose}
            onSuccess={handleFormSuccess}
          />
        </DialogContent>
      </Dialog>

      {selectedCliente && (
        <ContratosDialog
          cliente={selectedCliente}
          open={isContratosOpen}
          onOpenChange={setIsContratosOpen}
        />
      )}

      {selectedCliente && (
        <OrgaosDialog
          cliente={selectedCliente}
          open={isOrgaosOpen}
          onOpenChange={setIsOrgaosOpen}
        />
      )}
    </div>
  )
}
