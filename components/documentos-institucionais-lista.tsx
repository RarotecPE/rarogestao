"use client"

import { useState } from "react"
import { type DocumentoInstitucional } from "@/lib/documentos-institucionais"

// A data do documento e "date-only" (ex.: 2026-08-25). Formatamos direto da string
// (dd/MM/yyyy) sem usar `new Date`, que interpretaria o valor como meia-noite UTC e,
// no fuso local (UTC-3), exibiria o dia anterior (24/08 no lugar de 25/08).
function formatarDataDocumento(valor: string): string {
  const iso = String(valor).slice(0, 10) // cobre "2026-08-25" e "2026-08-25T00:00:00.000Z"
  const partes = iso.split("-")
  if (partes.length !== 3) return String(valor)
  const [ano, mes, dia] = partes
  return `${dia}/${mes}/${ano}`
}
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Download, Trash2, FileText, MessageSquare, Loader2 } from "lucide-react"
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
import { ListPagination, usePagination } from "@/components/list-pagination"

interface Props {
  documentos?: DocumentoInstitucional[]
  isLoading: boolean
  userIsGestor: boolean
  onChanged: () => void
  emptyLabel: string
  // Ao clicar em "notas" (apenas gestor). Se ausente, esconde o botao.
  onAbrirNotas?: (doc: DocumentoInstitucional) => void
  // Mostra metadados extras (setor / usuario alvo)
  mostrarSetor?: boolean
  mostrarUsuarioAlvo?: boolean
}

export function DocumentosLista({
  documentos,
  isLoading,
  userIsGestor,
  onChanged,
  emptyLabel,
  onAbrirNotas,
  mostrarSetor,
  mostrarUsuarioAlvo,
}: Props) {
  const [excluirId, setExcluirId] = useState<number | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const pagination = usePagination(documentos, {
    initialPageSize: 10,
  })

  async function handleExcluir() {
    if (excluirId == null) return
    setExcluindo(true)
    try {
      const res = await fetch(`/api/documentos-institucionais/${excluirId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Falha ao excluir")
      setExcluirId(null)
      onChanged()
    } catch (e) {
      console.error(e)
      alert("Erro ao excluir documento")
    } finally {
      setExcluindo(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full bg-muted" />
        ))}
      </div>
    )
  }

  if (!documentos || documentos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <FileText className="mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {pagination.paginatedItems.map((doc) => (
          <div
            key={doc.id}
            className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{doc.titulo}</p>
                {doc.descricao && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{doc.descricao}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {doc.data_documento && (
                    <span>{formatarDataDocumento(doc.data_documento)}</span>
                  )}
                  {mostrarSetor && doc.setor && (
                    <Badge variant="secondary" className="font-normal">{doc.setor}</Badge>
                  )}
                  {mostrarUsuarioAlvo && doc.usuario_alvo_nome && (
                    <Badge variant="secondary" className="font-normal">{doc.usuario_alvo_nome}</Badge>
                  )}
                  {doc.created_by_nome && <span>por {doc.created_by_nome}</span>}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {userIsGestor && onAbrirNotas && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() => onAbrirNotas(doc)}
                  title="Anotações internas dos gestores"
                >
                  <MessageSquare className="h-4 w-4" />
                  {typeof doc.total_notas === "number" && doc.total_notas > 0 && (
                    <span className="text-xs">{doc.total_notas}</span>
                  )}
                </Button>
              )}
              {doc.blob_pathname ? (
                <Button asChild size="icon" variant="ghost" title="Baixar">
                  <a
                    href={`/api/file?pathname=${encodeURIComponent(doc.blob_pathname)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Baixar</span>
                  </a>
                </Button>
              ) : (
                <span className="px-2 text-xs text-muted-foreground">Sem arquivo</span>
              )}
              {userIsGestor && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setExcluirId(doc.id)}
                  title="Excluir"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Excluir</span>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <ListPagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
        itemLabel="documentos"
        className="mt-4 rounded-lg border"
      />

      <AlertDialog open={excluirId != null} onOpenChange={(o) => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleExcluir()
              }}
              disabled={excluindo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluindo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
