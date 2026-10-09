"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users,
  UserX,
} from "lucide-react"
import { useSession } from "@/lib/auth-context"
import { isGestor } from "@/lib/permissions"
import { toast } from "sonner"

interface Usuario {
  id: number
  nome: string
  email: string
  nexus_email: string | null
  cargo: string | null
  ativo: boolean
  apuracao_mensal: boolean
  created_at: string
}


const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || "Não foi possível carregar os usuários.")
  return data
}

export default function UsuariosPage() {
  const { user } = useSession()
  const userIsGestor = user?.nome ? isGestor(user.nome, user.cargo) : false
  const userIsAdmin = user?.cargo?.toLowerCase() === "administrador"

  const { data: usuarios, mutate, isLoading, error } = useSWR<Usuario[]>("/api/usuarios", fetcher, {
    revalidateOnFocus: true,
    refreshInterval: 30_000,
  })
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<Usuario | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    nexus_email: "",
    cargo: "Operador",
    ativo: true,
    apuracao_mensal: false,
  })
  const [loading, setLoading] = useState(false)

  if (!userIsGestor) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
        <ShieldAlert className="mb-4 h-16 w-16 text-amber-500" />
        <h1 className="mb-2 text-2xl font-semibold text-foreground">Acesso restrito</h1>
        <p className="max-w-md text-center text-muted-foreground">
          Apenas gestores podem acessar a configuração local de usuários do RaroGestão.
        </p>
      </div>
    )
  }

  const filteredUsuarios = usuarios?.filter((usuario) => {
    const term = searchTerm.toLowerCase()
    return usuario.nome.toLowerCase().includes(term) || usuario.email.toLowerCase().includes(term)
  }) ?? []

  const totalAtivos = usuarios?.filter((usuario) => usuario.ativo).length || 0
  const totalInativos = usuarios?.filter((usuario) => !usuario.ativo).length || 0

  const isTargetAdmin = (usuario: Usuario) => usuario.cargo?.toLowerCase() === "administrador"
  const canEditUser = (usuario: Usuario) => !isTargetAdmin(usuario) || userIsAdmin

  const handleEdit = (usuario: Usuario) => {
    setEditingUser(usuario)
    setFormData({
      nome: usuario.nome,
      email: usuario.email,
      nexus_email: usuario.nexus_email || "",
      cargo: usuario.cargo || "Operador",
      ativo: usuario.ativo,
      apuracao_mensal: usuario.apuracao_mensal ?? false,
    })
    setIsFormOpen(true)
  }

  const handleSubmit = async () => {
    if (!editingUser) return
    if (isTargetAdmin(editingUser) && !userIsAdmin) {
      toast.error("Apenas administradores podem editar outros administradores.")
      return
    }

    setLoading(true)
    try {
      const payload = {
        nome: formData.nome,
        email: formData.email,
        nexus_email: formData.nexus_email,
        ativo: formData.ativo,
        apuracao_mensal: formData.apuracao_mensal,
      }
      const response = await fetch(`/api/usuarios/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Erro ao salvar usuário.")
      toast.success("Usuário salvo com sucesso")
      setIsFormOpen(false)
      await mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar usuário.")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (usuario: Usuario) => {
    if (!canEditUser(usuario)) {
      toast.error("Apenas administradores podem excluir outros administradores.")
      return
    }
    if (!confirm("Deseja realmente excluir esta configuração local de usuário? O login no RaroNexus não será removido.")) return

    const previousUsuarios = usuarios ?? []
    mutate(
      previousUsuarios.filter((u) => u.id !== usuario.id),
      false
    )

    try {
      const response = await fetch(`/api/usuarios/${usuario.id}`, { method: "DELETE" })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Erro ao excluir usuário.")
      toast.success("Configuração de usuário excluída com sucesso")
      await mutate()
    } catch (err) {
      mutate(previousUsuarios, false)
      toast.error(err instanceof Error ? err.message : "Erro ao excluir usuário.")
    }
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Usuários</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Usuários e acessos são gerenciados pelo RaroNexus e sincronizados automaticamente. Configure aqui apenas dados complementares do RaroGestão.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{usuarios?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15">
              <UserCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalAtivos}</p>
              <p className="text-sm text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-500/10 dark:bg-slate-500/15">
              <UserX className="h-6 w-6 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalInativos}</p>
              <p className="text-sm text-muted-foreground">Inativos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-medium">Lista de usuários</CardTitle>
                <CardDescription>{usuarios?.length || 0} configuração(ões) local(is)</CardDescription>
              </div>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
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
                  <TableHead className="font-medium">Nome</TableHead>
                  <TableHead className="hidden font-medium md:table-cell">E-mail</TableHead>
                  <TableHead className="font-medium">Cargo</TableHead>
                  <TableHead className="font-medium">Status</TableHead>
                  <TableHead className="w-[70px] font-medium" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-destructive">
                      {error.message}
                    </TableCell>
                  </TableRow>
                ) : filteredUsuarios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      {searchTerm ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsuarios.map((usuario) => (
                    <TableRow key={usuario.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                            {usuario.nome.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">{usuario.nome}</span>
                            <span className="text-xs text-muted-foreground md:hidden">{usuario.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{usuario.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">{usuario.cargo || "-"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={usuario.ativo
                            ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                            : "bg-slate-500/15 text-slate-700 hover:bg-slate-500/20 dark:text-slate-300"}
                        >
                          {usuario.ativo ? "Ativo" : "Inativo"}
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
                            <DropdownMenuItem onClick={() => handleEdit(usuario)} disabled={!canEditUser(usuario)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(usuario)}
                              className="text-destructive focus:text-destructive"
                              disabled={!canEditUser(usuario)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir configuração
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
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurações locais do usuário</DialogTitle>
            <DialogDescription>
              Nome, e-mail e cargo são sincronizados do RaroNexus. Aqui você pode ajustar o e-mail de vínculo e preferências do RaroGestão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
                {formData.nome || "-"}
              </div>
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {formData.email || "-"}
              </div>
            </div>
            <div className="space-y-2">
              <Label>E-mail do Nexus</Label>
              <Input
                type="email"
                value={formData.nexus_email}
                onChange={(event) => setFormData({ ...formData, nexus_email: event.target.value })}
                placeholder="Preencha apenas se for diferente do e-mail local"
              />
              <p className="text-xs text-muted-foreground">
                Se ficar vazio, o RaroGestão usa o e-mail local para vincular com o RaroNexus.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {formData.cargo || "Será sincronizado pelo RaroNexus"}
              </div>
              <p className="text-xs text-muted-foreground">
                O cargo é definido no RaroNexus.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="leading-tight">
                <p className="text-sm font-medium text-foreground">Apuração mensal</p>
                <p className="text-xs text-muted-foreground">Libera menus de apuração mensal e modelos de apuração.</p>
              </div>
              <Switch
                checked={formData.apuracao_mensal}
                onCheckedChange={(checked) => setFormData({ ...formData, apuracao_mensal: checked })}
                aria-label="Habilitar apuração mensal"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label>Configuração ativa</Label>
              <Switch checked={formData.ativo} onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
