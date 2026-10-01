"use client"

import useSWR from "swr"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Download, Loader2, Send, User, Lock, EyeOff, Paperclip, CalendarClock } from "lucide-react"
import { STATUS_OUVE, labelSigilo, rotuloCodigo, type OuveManifestacao } from "@/lib/ouve-rarotec"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  manifestacaoId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  isGestor: boolean
  onChanged: () => void
}

export function OuveDetalheDialog({ manifestacaoId, open, onOpenChange, isGestor, onChanged }: Props) {
  const { data, mutate, isLoading } = useSWR<OuveManifestacao & { isGestor: boolean }>(
    open && manifestacaoId ? `/api/ouve/manifestacoes/${manifestacaoId}` : null,
    fetcher,
  )
  const [resposta, setResposta] = useState("")
  const [enviando, setEnviando] = useState(false)

  async function enviarResposta() {
    if (!resposta.trim() || !manifestacaoId) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/ouve/manifestacoes/${manifestacaoId}/respostas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: resposta }),
      })
      if (res.ok) {
        setResposta("")
        await mutate()
        onChanged()
      }
    } finally {
      setEnviando(false)
    }
  }

  async function mudarStatus(status: string) {
    if (!manifestacaoId) return
    await fetch(`/api/ouve/manifestacoes/${manifestacaoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    await mutate()
    onChanged()
  }

  const status = data?.status ? STATUS_OUVE[data.status] : null
  const anonima = data?.tipo_sigilo === "anonima"
  const sigilosa = data?.tipo_sigilo === "identificavel_sigilosa"
  const semIdentificacao = data && !data.autor_nome

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {data ? rotuloCodigo(data.codigo) : "Manifestação"}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Metadados */}
            <div className="flex flex-wrap gap-2">
              {status && (
                <Badge variant="outline" className={status.badge}>
                  {status.label}
                </Badge>
              )}
              <Badge variant="outline">{data.natureza}</Badge>
              <Badge variant="outline">{data.categoria}</Badge>
              <Badge variant="outline">{data.tipo_vida}</Badge>
              {data.setor && <Badge variant="outline">{data.setor}</Badge>}
            </div>

            {/* Data de registro */}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              Registrada em {new Date(data.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </p>

            {/* Identificacao */}
            <div className="rounded-lg border p-3 text-sm">
              {anonima ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <EyeOff className="h-4 w-4" /> Manifestação anônima — sem identificação
                </span>
              ) : semIdentificacao ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Lock className="h-4 w-4" /> Identificação sigilosa — visível apenas à gestão
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{data.autor_nome}</span>
                  {data.autor_cargo && (
                    <span className="text-muted-foreground">— {data.autor_cargo}</span>
                  )}
                  {sigilosa && (
                    <Badge variant="outline" className="ml-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                      Sigilosa
                    </Badge>
                  )}
                </span>
              )}
            </div>

            {/* Mensagem */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Mensagem</p>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{data.mensagem}</p>
            </div>

            {/* Anexos */}
            {data.anexos && data.anexos.length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5" /> Anexos ({data.anexos.length})
                </p>
                <div className="space-y-1">
                  {data.anexos.map((a) => (
                    <a
                      key={a.id}
                      href={`/api/file?pathname=${encodeURIComponent(a.blob_pathname)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <span className="truncate">{a.nome_arquivo || "Anexo"}</span>
                      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Status (gestor) */}
            {isGestor && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Status:</span>
                <Select value={data.status} onValueChange={mudarStatus}>
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="em_analise">Em análise</SelectItem>
                    <SelectItem value="respondida">Respondida</SelectItem>
                    <SelectItem value="encerrada">Encerrada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Respostas / tratativas */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Tratativas</p>
              {data.respostas && data.respostas.length > 0 ? (
                <div className="space-y-2">
                  {data.respostas.map((r) => (
                    <div key={r.id} className="rounded-lg border p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">{r.autor_nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-muted-foreground">{r.mensagem}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma tratativa registrada ainda.</p>
              )}
            </div>

            {/* Nova resposta (gestor sempre; autor identificado tambem) */}
            {(isGestor || (!anonima && !semIdentificacao)) && (
              <div className="space-y-2 border-t pt-3">
                <Textarea
                  rows={3}
                  placeholder={isGestor ? "Escrever tratativa/resposta…" : "Complementar…"}
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={enviarResposta} disabled={enviando || !resposta.trim()}>
                    {enviando ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Enviar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
