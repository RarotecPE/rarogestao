"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import {
  AlertTriangle,
  BellRing,
  ClipboardCheck,
  Clock3,
  FileWarning,
  Loader2,
  MapPin,
  MessagesSquare,
  SlidersHorizontal,
  Stethoscope,
  TrendingUp,
  Users2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSession } from "@/lib/auth-context"
import { canApuracaoMensal, isGestor } from "@/lib/permissions"
import {
  getAvisosDisponiveis,
  type AvisoCentralKey,
  type AvisoCentralTom,
} from "@/lib/central-avisos"

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || "Erro ao carregar preferências")
  return data
}

const ICONS: Record<AvisoCentralKey, typeof AlertTriangle> = {
  vencidas: AlertTriangle,
  mes_atual: Clock3,
  sem_observacao: FileWarning,
  pendencia_externa: Users2,
  contratos: TrendingUp,
  relatorios: MapPin,
  medica: Stethoscope,
  medica_analise: ClipboardCheck,
  agenda: BellRing,
  ouve: MessagesSquare,
}

const CHIP_TONE: Record<AvisoCentralTom, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  pink: "bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
}

export function CentralAvisosConfigCard() {
  const { user } = useSession()
  const userIsGestor = user?.nome ? isGestor(user.nome, user.cargo) : false
  const podeApuracao = user ? canApuracaoMensal(user.cargo, user.apuracao_mensal) : false

  const { data: prefs, mutate, isLoading } = useSWR<{ ocultos: AvisoCentralKey[] }>(
    user ? "/api/configuracoes/central-avisos" : null,
    fetcher,
  )
  const { data: ouveConfig } = useSWR<{ ativo: boolean }>(
    user && userIsGestor ? "/api/ouve/config" : null,
    fetcher,
  )

  const avisosDisponiveis = useMemo(
    () =>
      getAvisosDisponiveis({
        isGestor: userIsGestor,
        podeApuracao,
        ouveAtivo: ouveConfig ? ouveConfig.ativo : true,
      }),
    [userIsGestor, podeApuracao, ouveConfig],
  )

  const [open, setOpen] = useState(false)
  const [draftOcultos, setDraftOcultos] = useState<AvisoCentralKey[]>([])
  const [saving, setSaving] = useState(false)

  const ocultosSalvos = useMemo(
    () => new Set<AvisoCentralKey>(prefs?.ocultos ?? []),
    [prefs?.ocultos],
  )

  const ativosSalvosCount = useMemo(
    () => avisosDisponiveis.filter((a) => !ocultosSalvos.has(a.chave)).length,
    [avisosDisponiveis, ocultosSalvos],
  )

  const draftOcultosSet = useMemo(() => new Set<AvisoCentralKey>(draftOcultos), [draftOcultos])
  const ativosDraftCount = useMemo(
    () => avisosDisponiveis.filter((a) => !draftOcultosSet.has(a.chave)).length,
    [avisosDisponiveis, draftOcultosSet],
  )

  const handleOpenModal = () => {
    setDraftOcultos(prefs?.ocultos ?? [])
    setOpen(true)
  }

  const toggleAviso = (chave: AvisoCentralKey, ativo: boolean) => {
    setDraftOcultos((prev) => {
      if (ativo) {
        return prev.filter((item) => item !== chave)
      }
      return prev.includes(chave) ? prev : [...prev, chave]
    })
  }

  const toggleTodos = () => {
    if (ativosDraftCount === avisosDisponiveis.length) {
      setDraftOcultos(avisosDisponiveis.map((a) => a.chave))
    } else {
      setDraftOcultos([])
    }
  }

  const handleSalvar = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/configuracoes/central-avisos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocultos: draftOcultos }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao salvar preferências")
      }
      await mutate(data, false)
      toast.success("Preferências da Central de Avisos salvas")
      setOpen(false)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Erro ao salvar preferências")
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  const todosAtivos = ativosSalvosCount === avisosDisponiveis.length

  return (
    <>
      <Card className="border shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <BellRing className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-medium">Central de Avisos</CardTitle>
                <CardDescription>
                  Defina quais tipos de avisos aparecem no seu painel inicial.
                </CardDescription>
              </div>
            </div>
            {isLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Badge variant="outline" className="shrink-0 text-xs">
                {todosAtivos
                  ? "Todos ativos"
                  : `${ativosSalvosCount} de ${avisosDisponiveis.length} ativos`}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full justify-center gap-2 sm:w-auto"
            onClick={handleOpenModal}
            disabled={isLoading}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Personalizar Central de Avisos
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary" />
              Personalizar Central de Avisos
            </DialogTitle>
            <DialogDescription>
              Escolha quais avisos exibir no seu painel. As preferências ficam salvas apenas no seu
              usuário.
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {ativosDraftCount} de {avisosDisponiveis.length} ativo(s)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={toggleTodos}
                disabled={saving}
              >
                {ativosDraftCount === avisosDisponiveis.length
                  ? "Desativar todos"
                  : "Ativar todos"}
              </Button>
            </div>

            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {avisosDisponiveis.map((aviso) => {
                const Icon = ICONS[aviso.chave]
                const ativo = !draftOcultosSet.has(aviso.chave)
                const titulo = !userIsGestor && aviso.tituloTecnico ? aviso.tituloTecnico : aviso.titulo
                const descricao =
                  !userIsGestor && aviso.descricaoTecnico ? aviso.descricaoTecnico : aviso.descricao

                return (
                  <label
                    key={aviso.chave}
                    htmlFor={`aviso-${aviso.chave}`}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
                      ativo ? "bg-card hover:bg-muted/40" : "bg-muted/30 opacity-75 hover:opacity-100"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CHIP_TONE[aviso.tom]}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight text-foreground">
                          {titulo}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
                      </div>
                    </div>
                    <Switch
                      id={`aviso-${aviso.chave}`}
                      checked={ativo}
                      disabled={saving}
                      onCheckedChange={(checked) => toggleAviso(aviso.chave, checked)}
                    />
                  </label>
                )
              })}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
