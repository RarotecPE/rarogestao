"use client"

import { useState } from "react"
import useSWR from "swr"
import { uploadArquivo } from "@/lib/upload-blob"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Download,
  FileText,
  CheckCircle2,
  XCircle,
  Paperclip,
  Send,
  MessageSquare,
  ShieldCheck,
  X,
  Upload,
} from "lucide-react"
import {
  LABEL_TIPO_MEDICO,
  STATUS_VALIDACAO,
  type DocumentoMedico,
} from "@/lib/documentos-medicos"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Mensagem {
  id: number
  autor_nome: string
  autor_papel: string
  mensagem: string
  anexo_pathname: string | null
  anexo_nome: string | null
  created_at: string
}

interface Props {
  documento: DocumentoMedico | null
  open: boolean
  onOpenChange: (open: boolean) => void
  // 'gestor' habilita validar/recusar; 'tecnico' habilita responder/reenviar
  papel: "gestor" | "tecnico"
  onUpdated?: () => void
}

export function DocumentoMedicoDetalhe({ documento, open, onOpenChange, papel, onUpdated }: Props) {
  const [motivo, setMotivo] = useState("")
  const [novaMensagem, setNovaMensagem] = useState("")
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [validando, setValidando] = useState(false)
  const [novoArquivo, setNovoArquivo] = useState<File | null>(null)
  const [reenviando, setReenviando] = useState(false)

  const {
    data: mensagens,
    mutate: mutateMensagens,
  } = useSWR<Mensagem[]>(
    documento && open ? `/api/documentos-medicos/${documento.id}/mensagens` : null,
    fetcher,
  )

  if (!documento) return null

  const status = documento.status_validacao || "pendente"
  const statusInfo = STATUS_VALIDACAO[status] || STATUS_VALIDACAO.pendente

  const formatarData = (v: string | null | undefined) => {
    if (!v) return "—"
    try {
      return format(new Date(String(v).includes("T") ? v : v + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
    } catch {
      return String(v)
    }
  }
  const formatarDataHora = (v: string) => {
    try {
      return format(new Date(v), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    } catch {
      return v
    }
  }

  const validar = async (novoStatus: "validado" | "recusado") => {
    if (novoStatus === "recusado" && !motivo.trim()) {
      alert("Informe o motivo da recusa")
      return
    }
    setValidando(true)
    try {
      const res = await fetch(`/api/documentos-medicos/${documento.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_validacao: novoStatus, motivo: motivo.trim() || null }),
      })
      if (!res.ok) throw new Error("Falha ao validar")
      setMotivo("")
      onUpdated?.()
      onOpenChange(false)
    } catch (e) {
      console.error(e)
      alert("Erro ao validar documento")
    } finally {
      setValidando(false)
    }
  }

  const reenviarArquivo = async () => {
    if (!novoArquivo) return
    setReenviando(true)
    try {
      const blob = await uploadArquivo(novoArquivo)
      const res = await fetch(`/api/documentos-medicos/${documento.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "substituir_arquivo",
          blob_pathname: blob.pathname,
          nome_arquivo: novoArquivo.name,
          tipo_arquivo: novoArquivo.type,
          tamanho: novoArquivo.size,
        }),
      })
      if (!res.ok) throw new Error("Falha ao substituir documento")
      setNovoArquivo(null)
      onUpdated?.()
      onOpenChange(false)
    } catch (e) {
      console.error(e)
      alert("Erro ao substituir o documento")
    } finally {
      setReenviando(false)
    }
  }

  const enviarMensagem = async () => {
    if (!novaMensagem.trim()) return
    setEnviando(true)
    try {
      let anexo: { pathname: string; nome: string } | null = null
      if (arquivo) {
        const blob = await uploadArquivo(arquivo)
        anexo = { pathname: blob.pathname, nome: arquivo.name }
      }
      const res = await fetch(`/api/documentos-medicos/${documento.id}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagem: novaMensagem.trim(),
          anexo_pathname: anexo?.pathname || null,
          anexo_nome: anexo?.nome || null,
        }),
      })
      if (!res.ok) throw new Error("Falha ao enviar mensagem")
      setNovaMensagem("")
      setArquivo(null)
      mutateMensagens()
      onUpdated?.()
    } catch (e) {
      console.error(e)
      alert("Erro ao enviar mensagem")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {LABEL_TIPO_MEDICO[documento.tipo] || documento.tipo}
          </DialogTitle>
          <DialogDescription>
            {documento.tecnico_nome ? `${documento.tecnico_nome} · ` : ""}
            {formatarData(documento.data_inicio)}
            {toStr(documento.data_inicio) !== toStr(documento.data_fim)
              ? ` a ${formatarData(documento.data_fim)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status + arquivo */}
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className={statusInfo.badge}>
              {statusInfo.label}
            </Badge>
            {documento.blob_pathname ? (
              <Button asChild size="sm" variant="outline">
                <a
                  href={`/api/file?pathname=${encodeURIComponent(documento.blob_pathname)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Baixar documento
                </a>
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">Sem anexo</span>
            )}
          </div>

          {documento.descricao && (
            <p className="rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
              {documento.descricao}
            </p>
          )}

          {(status === "validado" || status === "recusado") && documento.validado_por_nome && (
            <p className="text-xs text-muted-foreground">
              {status === "validado" ? "Validado" : "Recusado"} por {documento.validado_por_nome}
              {documento.motivo_validacao ? ` — "${documento.motivo_validacao}"` : ""}
            </p>
          )}

          {/* Substituir/reenviar documento (apenas tecnico dono) */}
          {papel === "tecnico" && (
            <div
              className={`space-y-2 rounded-lg border p-3 ${
                status === "aguardando_tecnico" || status === "recusado"
                  ? "border-blue-200 bg-blue-50/50 dark:border-blue-500/30 dark:bg-blue-950/30"
                  : "bg-muted/30"
              }`}
            >
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Upload className="h-4 w-4" />
                {documento.blob_pathname ? "Substituir documento" : "Anexar documento"}
              </p>
              {(status === "aguardando_tecnico" || status === "recusado") && (
                <p className="text-xs text-blue-700">
                  A gestão solicitou um ajuste. Envie o documento correto abaixo — ele volta para validação
                  automaticamente.
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                {novoArquivo ? (
                  <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{novoArquivo.name}</span>
                    <button onClick={() => setNovoArquivo(null)} className="ml-1">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    Selecionar arquivo (PDF ou imagem)
                    <input
                      type="file"
                      accept="image/*,application/pdf,.doc,.docx"
                      className="hidden"
                      onChange={(e) => setNovoArquivo(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
                <Button size="sm" onClick={reenviarArquivo} disabled={reenviando || !novoArquivo}>
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  {reenviando ? "Enviando..." : "Enviar"}
                </Button>
              </div>
            </div>
          )}

          {/* Thread de esclarecimento */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <MessageSquare className="h-4 w-4" />
              Esclarecimentos
            </p>
            <ScrollArea className="max-h-48 rounded-md border">
              {!mensagens || mensagens.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  Nenhuma mensagem ainda
                </p>
              ) : (
                <div className="space-y-2 p-3">
                  {mensagens.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg p-2 text-sm ${
                        m.autor_papel === "gestor" ? "bg-blue-50 dark:bg-blue-950/40 dark:border dark:border-blue-800/50" : "bg-muted"
                      }`}
                    >
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">
                          {m.autor_nome}
                          <span className="ml-1 text-muted-foreground">
                            ({m.autor_papel === "gestor" ? "Gestão" : "Técnico"})
                          </span>
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatarDataHora(m.created_at)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{m.mensagem}</p>
                      {m.anexo_pathname && (
                        <a
                          href={`/api/file?pathname=${encodeURIComponent(m.anexo_pathname)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          {m.anexo_nome || "anexo"}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Nova mensagem */}
            <div className="mt-2 space-y-2">
              <Textarea
                placeholder={
                  papel === "gestor"
                    ? "Solicitar esclarecimento ao técnico..."
                    : "Responder / esclarecer..."
                }
                value={novaMensagem}
                onChange={(e) => setNovaMensagem(e.target.value)}
                rows={2}
              />
              <div className="flex items-center justify-between gap-2">
                {arquivo ? (
                  <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{arquivo.name}</span>
                    <button onClick={() => setArquivo(null)} className="ml-1">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    Anexar
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
                <Button size="sm" onClick={enviarMensagem} disabled={enviando || !novaMensagem.trim()}>
                  <Send className="mr-1 h-3.5 w-3.5" />
                  {enviando ? "Enviando..." : "Enviar"}
                </Button>
              </div>
            </div>
          </div>

          {/* Ações de validação (apenas gestor) */}
          {papel === "gestor" && documento.blob_pathname && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldCheck className="h-4 w-4" />
                Validação
              </p>
              <Input
                placeholder="Motivo (obrigatório para recusar)"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => validar("validado")}
                  disabled={validando}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Validar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-red-200 text-red-700 hover:bg-red-50 bg-transparent dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
                  onClick={() => validar("recusado")}
                  disabled={validando}
                >
                  <XCircle className="mr-1 h-4 w-4" />
                  Recusar
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function toStr(v: string | null | undefined) {
  return v ? String(v).split("T")[0] : ""
}
