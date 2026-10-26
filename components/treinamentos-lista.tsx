"use client"

import { useState } from "react"
import { type Capacitacao, labelPessoa, youtubeEmbedUrl, extrairYoutubeId } from "@/lib/capacitacao"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { GraduationCap, Trash2, Loader2, Video, Users, Calendar, Copy, Check } from "lucide-react"
import { toast } from "sonner"
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
import { VideoTreinamentoDialog } from "@/components/video-treinamento-dialog"

// Data "date-only" formatada sem `new Date` (evita deslocar o dia pelo fuso UTC-3).
function formatarData(valor?: string | null): string {
  if (!valor) return "-"
  const iso = String(valor).slice(0, 10)
  const [ano, mes, dia] = iso.split("-")
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : String(valor)
}

interface Props {
  treinamentos?: Capacitacao[]
  isLoading: boolean
  userIsGestor: boolean
  onChanged: () => void
}

export function TreinamentosLista({ treinamentos, isLoading, userIsGestor, onChanged }: Props) {
  const [excluirId, setExcluirId] = useState<number | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [videoTreino, setVideoTreino] = useState<Capacitacao | null>(null)
  const [copiadoId, setCopiadoId] = useState<number | null>(null)

  async function handleCopiarLink(url?: string | null, id?: number) {
    if (!url) return
    const videoId = extrairYoutubeId(url)
    const link = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link do vídeo copiado!")
      if (id != null) {
        setCopiadoId(id)
        setTimeout(() => setCopiadoId(null), 2000)
      }
    } catch {
      toast.error("Não foi possível copiar o link.")
    }
  }

  async function handleExcluir() {
    if (excluirId == null) return
    setExcluindo(true)
    try {
      const res = await fetch(`/api/capacitacoes/${excluirId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Falha ao excluir")
      setExcluirId(null)
      onChanged()
    } catch (e) {
      console.error(e)
      alert("Erro ao excluir treinamento")
    } finally {
      setExcluindo(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full bg-muted" />
        ))}
      </div>
    )
  }

  if (!treinamentos || treinamentos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
        <GraduationCap className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Nenhum treinamento cadastrado.</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {treinamentos.map((t) => (
          <div key={t.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-balance">{t.titulo}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatarData(t.data_treinamento)}
                  </span>
                  {t.instrutores?.length > 0 && (
                    <span>Instrutor(es): {t.instrutores.map(labelPessoa).join(", ")}</span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.setores?.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>

                {t.participantes?.length > 0 && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{t.participantes.map(labelPessoa).join(", ")}</span>
                  </p>
                )}

                {t.motivo && (
                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Motivo: </span>
                    {t.motivo}
                  </p>
                )}
                {t.observacoes && (
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Obs.: </span>
                    {t.observacoes}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {youtubeEmbedUrl(t.video_url) && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Assistir vídeo"
                      onClick={() => setVideoTreino(t)}
                    >
                      <Video className="h-4 w-4" />
                      <span className="sr-only">Assistir vídeo</span>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Copiar link do vídeo"
                      onClick={() => handleCopiarLink(t.video_url, t.id)}
                    >
                      {copiadoId === t.id ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      <span className="sr-only">Copiar link do vídeo</span>
                    </Button>
                  </>
                )}
                {userIsGestor && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    title="Excluir"
                    onClick={() => setExcluirId(t.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Excluir</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <VideoTreinamentoDialog
        titulo={videoTreino?.titulo ?? ""}
        embedUrl={youtubeEmbedUrl(videoTreino?.video_url)}
        videoUrl={videoTreino?.video_url}
        open={videoTreino != null}
        onOpenChange={(o) => !o && setVideoTreino(null)}
      />

      <AlertDialog open={excluirId != null} onOpenChange={(o) => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir treinamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} disabled={excluindo}>
              {excluindo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
