"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { extrairYoutubeId } from "@/lib/capacitacao"

interface Props {
  titulo: string
  embedUrl: string | null
  videoUrl?: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
}

// Player de treinamento incorporado com controles nativos (qualidade, volume, progresso).
export function VideoTreinamentoDialog({ titulo, embedUrl, videoUrl, open, onOpenChange }: Props) {
  const [copiado, setCopiado] = useState(false)

  const idVideo = (videoUrl && extrairYoutubeId(videoUrl)) || (embedUrl && extrairYoutubeId(embedUrl)) || null
  const linkVideo = idVideo ? `https://www.youtube.com/watch?v=${idVideo}` : (videoUrl || null)

  async function handleCopiarLink() {
    if (!linkVideo) return
    try {
      await navigator.clipboard.writeText(linkVideo)
      toast.success("Link do vídeo copiado!")
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error("Não foi possível copiar o link.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <DialogTitle className="text-balance">{titulo}</DialogTitle>
            {linkVideo && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopiarLink}
                className="w-fit shrink-0 gap-1.5 text-xs"
                title="Copiar link do vídeo"
              >
                {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiado ? "Link copiado!" : "Copiar link"}</span>
              </Button>
            )}
          </div>
        </DialogHeader>

        {embedUrl && open ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
            <iframe
              src={embedUrl}
              title={titulo}
              className="absolute inset-0 h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
            />
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Vídeo indisponível — informe um link válido do YouTube.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
