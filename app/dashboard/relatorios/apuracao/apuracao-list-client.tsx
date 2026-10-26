"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ClienteCombobox } from "@/components/cliente-combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Download,
  FileText,
  Loader2,
} from "lucide-react"
import {
  MODULOS_SISTEMAS,
  competenciaLabel,
  formatBRL,
  type ApuracaoRelatorio,
} from "@/lib/apuracao"
import { toast } from "sonner"
import { ApuracaoForm } from "./apuracao-form"

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || "Erro ao carregar dados")
  return data
}

export function ApuracaoListClient() {
  const router = useRouter()
  const { data, mutate, isLoading } = useSWR<ApuracaoRelatorio[]>(
    "/api/apuracao/relatorios",
    fetcher,
  )
  const { data: clientes } = useSWR<any[]>("/api/clientes", fetcher)

  const [busca, setBusca] = useState("")
  const [clienteFilter, setClienteFilter] = useState("all")
  const [competenciaFilter, setCompetenciaFilter] = useState("all")
  const [exercicioFilter, setExercicioFilter] = useState("all")
  const [moduloFilter, setModuloFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [excluirId, setExcluirId] = useState<number | null>(null)
  const [clonandoId, setClonandoId] = useState<number | null>(null)
  const [baixandoId, setBaixandoId] = useState<number | null>(null)
  const [editandoRelatorio, setEditandoRelatorio] = useState<ApuracaoRelatorio | null>(null)

  async function baixarPdf(id: number) {
    setBaixandoId(id)
    try {
      const [{ generateApuracaoPDF }, { downloadPDF }] = await Promise.all([
        import("@/lib/apuracao-pdf-generator"),
        import("@/lib/pdf-generator"),
      ])
      const res = await fetch(`/api/apuracao/relatorios/${id}`)
      if (!res.ok) throw new Error()
      const full = await res.json()
      const blob = await generateApuracaoPDF(full)
      const nome = `RMPS ${full.cliente_nome || ""} ${competenciaLabel(full.competencia)}`.trim()
      downloadPDF(blob, `${nome}.pdf`)
    } catch {
      alert("Erro ao gerar o PDF.")
    } finally {
      setBaixandoId(null)
    }
  }

  const rows = Array.isArray(data) ? data : []
  const clientesArr = Array.isArray(clientes) ? clientes : []

  const exercicios = useMemo(
    () => Array.from(new Set(rows.map((r) => r.exercicio))).sort((a, b) => b - a),
    [rows],
  )
  const competencias = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.competencia)))
        .sort()
        .reverse(),
    [rows],
  )

  const filtrados = useMemo(() => {
    return rows.filter((r) => {
      const termo = busca.toLowerCase()
      const matchBusca =
        !termo ||
        r.cliente_nome?.toLowerCase().includes(termo) ||
        r.modelo_nome?.toLowerCase().includes(termo) ||
        String(r.numero).includes(termo)
      const matchCliente = clienteFilter === "all" || String(r.cliente_id) === clienteFilter
      const matchComp = competenciaFilter === "all" || r.competencia === competenciaFilter
      const matchExerc = exercicioFilter === "all" || String(r.exercicio) === exercicioFilter
      const matchStatus = statusFilter === "all" || r.status === statusFilter
      const matchModulo =
        moduloFilter === "all" ||
        (Array.isArray(r.itens) &&
          r.itens.some((i: any) => String(i.nome).toLowerCase() === moduloFilter.toLowerCase()))
      return matchBusca && matchCliente && matchComp && matchExerc && matchStatus && matchModulo
    })
  }, [rows, busca, clienteFilter, competenciaFilter, exercicioFilter, statusFilter, moduloFilter])

  async function clonar(id: number) {
    setClonandoId(id)
    try {
      const res = await fetch(`/api/apuracao/relatorios/${id}/clonar`, { method: "POST" })
      if (!res.ok) throw new Error()
      const novo = await res.json()
      mutate()
      setEditandoRelatorio(novo)
      toast.success("Apuração clonada! Ajuste os dados na janela aberta.")
    } catch {
      alert("Erro ao clonar.")
    } finally {
      setClonandoId(null)
    }
  }

  async function excluir() {
    if (!excluirId) return
    const id = excluirId
    setExcluirId(null)
    const prev = data ?? []
    mutate(
      prev.filter((r) => r.id !== id),
      false
    )

    try {
      const res = await fetch(`/api/apuracao/relatorios/${id}`, { method: "DELETE" })
      if (!res.ok) {
        mutate(prev, false)
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Erro ao excluir apuração")
      }
      toast.success("Apuração excluída com sucesso")
      await mutate()
    } catch (e) {
      mutate(prev, false)
      toast.error(e instanceof Error ? e.message : "Erro ao excluir apuração")
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FileText className="h-6 w-6 text-primary" />
            Apuracao Mensal (RMPS)
          </h1>
          <p className="text-sm text-muted-foreground">
            Consolidacao mensal dos servicos por cliente e contrato.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/relatorios/apuracao/novo">
            <Plus className="mr-1 h-4 w-4" />
            Nova apuracao
          </Link>
        </Button>
      </div>

      {/* Filtros */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, modelo ou numero..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <ClienteCombobox
            clientes={clientesArr}
            value={clienteFilter}
            onChange={setClienteFilter}
            allLabel="Todos os clientes"
            placeholder="Cliente"
            className="w-48"
          />
          <Select value={competenciaFilter} onValueChange={setCompetenciaFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Competencia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Competencia</SelectItem>
              {competencias.map((c) => (
                <SelectItem key={c} value={c}>
                  {competenciaLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={exercicioFilter} onValueChange={setExercicioFilter}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Exercicio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Exercicio</SelectItem>
              {exercicios.map((e) => (
                <SelectItem key={e} value={String(e)}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={moduloFilter} onValueChange={setModuloFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Modulo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os modulos</SelectItem>
              {MODULOS_SISTEMAS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="emitido">Emitido</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              Nenhuma apuracao encontrada.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Competencia</TableHead>
                  <TableHead>Modulos</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.numero_texto || String(r.numero).padStart(3, "0")}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const ids: number[] = Array.isArray(r.cliente_ids) ? r.cliente_ids : []
                        const nomes = ids
                          .map((id) => clientesArr.find((c) => c.id === id)?.nome_fantasia)
                          .filter(Boolean) as string[]
                        if (nomes.length <= 1) {
                          return <span>{nomes[0] || r.cliente_nome}</span>
                        }
                        return (
                          <div className="flex flex-col">
                            <span>{nomes[0]}</span>
                            <span className="text-xs text-muted-foreground">
                              +{nomes.length - 1} cliente{nomes.length - 1 === 1 ? "" : "s"}
                              {r.municipio ? ` em ${r.municipio}` : ""}
                            </span>
                          </div>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="w-[180px] max-w-[180px] whitespace-normal text-muted-foreground">
                      <span
                        className="block max-w-[180px] whitespace-normal break-words leading-5 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                        title={r.modelo_nome || "-"}
                      >
                        {r.modelo_nome || "-"}
                      </span>
                    </TableCell>
                    <TableCell>{competenciaLabel(r.competencia)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(r.itens || []).slice(0, 3).map((i: any) => (
                          <Badge key={i.nome} variant="secondary" className="text-[10px] font-normal">
                            {i.nome}
                          </Badge>
                        ))}
                        {(r.itens || []).length > 3 && (
                          <Badge variant="outline" className="text-[10px]">
                            +{(r.itens || []).length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatBRL(r.valor_total)}</TableCell>
                    <TableCell>
                      {r.status === "emitido" ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">Emitido</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 dark:text-amber-300 dark:border-amber-500/40">
                          Rascunho
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Baixar PDF"
                          disabled={baixandoId === r.id}
                          onClick={() => baixarPdf(r.id)}
                        >
                          {baixandoId === r.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              {clonandoId === r.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreVertical className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditandoRelatorio(r)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => clonar(r.id)}>
                              <Copy className="mr-2 h-4 w-4" />
                              Clonar p/ proxima competencia
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setExcluirId(r.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={excluirId !== null} onOpenChange={(o) => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir apuracao?</AlertDialogTitle>
            <AlertDialogDescription>Esta acao nao pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluir}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de edicao de apuracao */}
      <Dialog
        open={editandoRelatorio !== null}
        onOpenChange={(open) => {
          if (!open) setEditandoRelatorio(null)
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl md:max-w-6xl lg:max-w-7xl xl:max-w-[1400px] w-[95vw] p-4 sm:p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <FileText className="h-5 w-5 text-primary" />
              Editar apuração mensal
            </DialogTitle>
          </DialogHeader>
          {editandoRelatorio && (
            <ApuracaoForm
              key={editandoRelatorio.id}
              relatorio={editandoRelatorio}
              isModal
              onSuccess={() => {
                setEditandoRelatorio(null)
                mutate()
                toast.success("Apuração atualizada com sucesso!")
              }}
              onCancel={() => setEditandoRelatorio(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
