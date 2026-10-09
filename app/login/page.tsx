"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "@/components/theme-provider"
import {
  KeyRound,
  MessagesSquare,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { resolvedTheme, setTheme } = useTheme()
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [ssoLoading, setSsoLoading] = useState(false)
  const [checkingNexusSession, setCheckingNexusSession] = useState(true)
  const [themeMounted, setThemeMounted] = useState(false)
  const [silentSsoUrl, setSilentSsoUrl] = useState("")
  const [ouveAtivo, setOuveAtivo] = useState(false)
  const popupRef = useRef<Window | null>(null)
  const popupCheckRef = useRef<number | null>(null)

  const nextPath = useMemo(() => {
    const value = searchParams.get("next")
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/api/")) return "/dashboard"
    return value
  }, [searchParams])

  const isDark = themeMounted ? resolvedTheme !== "light" : true
  const themeLabel = themeMounted ? (isDark ? "Ativar modo claro" : "Ativar modo escuro") : "Alternar tema"

  const stopPopupCheck = () => {
    if (popupCheckRef.current !== null) {
      window.clearInterval(popupCheckRef.current)
      popupCheckRef.current = null
    }
  }

  useEffect(() => {
    setThemeMounted(true)
  }, [])

  useEffect(() => {
    fetch("/api/ouve/config")
      .then((r) => r.json())
      .then((d) => setOuveAtivo(!!d.ativo))
      .catch(() => setOuveAtivo(false))
  }, [])

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== "raronexus:sso") return

      stopPopupCheck()
      if (event.data.mode !== "silent") {
        setSsoLoading(false)
        popupRef.current = null
      }
      setCheckingNexusSession(false)

      if (event.data.status === "success") {
        window.location.href = event.data.redirectTo || nextPath
        return
      }

      if (event.data.mode !== "silent") {
        setError(event.data.message || "Não foi possível entrar com RaroNexus.")
      }
    }

    async function tryExistingSessions() {
      const response = await fetch("/api/auth/session", { cache: "no-store" }).catch(() => null)
      const session = response?.ok ? await response.json().catch(() => null) : null

      if (session?.authenticated) {
        window.location.href = nextPath
        return
      }

      setSilentSsoUrl(`/api/auth/raronexus/start?mode=silent&next=${encodeURIComponent(nextPath)}&attempt=${Date.now()}`)
      window.setTimeout(() => setCheckingNexusSession(false), 4500)
    }

    window.addEventListener("message", handleMessage)
    void tryExistingSessions()
    return () => {
      window.removeEventListener("message", handleMessage)
      stopPopupCheck()
    }
  }, [nextPath, router])

  const startRaroNexusLogin = () => {
    setError("")
    setMessage("")
    setSsoLoading(true)

    const popup = window.open(
      `/api/auth/raronexus/start?next=${encodeURIComponent(nextPath)}`,
      "raronexus-login",
      "width=520,height=720,menubar=no,toolbar=no,location=no,status=no"
    )

    if (!popup) {
      setSsoLoading(false)
      setError("Permita popups para entrar com RaroNexus.")
      return
    }

    popupRef.current = popup
    stopPopupCheck()
    popupCheckRef.current = window.setInterval(() => {
      if (!popupRef.current?.closed) return
      stopPopupCheck()
      popupRef.current = null
      setSsoLoading(false)
    }, 500)
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 rounded-lg border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={themeLabel}
        title={themeLabel}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <div className="w-full max-w-md space-y-8">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] bg-white p-0.5 shadow-lg ring-1 ring-white/15">
            <Image
              src="/logo.png"
              alt="RaroGestão"
              width={56}
              height={56}
              className="h-14 w-14 object-contain"
              priority
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-normal">
              Raro<span className="text-primary">Gestão</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Entre com sua conta RaroNexus para acessar a plataforma.
            </p>
          </div>
        </div>

        <Card className="border-border bg-card/90 shadow-2xl backdrop-blur-xl">
          <CardContent className="p-6">
            <Button
              type="button"
              className="h-11 w-full gap-3 font-semibold"
              onClick={startRaroNexusLogin}
              disabled={ssoLoading || checkingNexusSession}
            >
              <KeyRound className="h-4 w-4" />
              {ssoLoading ? "Aguardando RaroNexus..." : checkingNexusSession ? "Verificando RaroNexus..." : "Entrar com RaroNexus"}
            </Button>

            {silentSsoUrl ? <iframe title="Verificação RaroNexus" src={silentSsoUrl} className="hidden" /> : null}

            {(message || error) && (
              <p
                className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                  error
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-primary/30 bg-primary/10 text-primary"
                }`}
              >
                {error || message}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
              <Button variant="outline" className="w-full gap-2" asChild>
                <Link href="/validar">
                  <ShieldCheck className="h-4 w-4" />
                  Validar Relatório
                </Link>
              </Button>
              {ouveAtivo && (
                <Button variant="outline" className="w-full gap-2" asChild>
                  <Link href="/ouve-rarotec">
                    <MessagesSquare className="h-4 w-4" />
                    Acompanhe seu OuveRarotec
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-background text-foreground">Carregando...</main>}>
      <LoginContent />
    </Suspense>
  )
}
