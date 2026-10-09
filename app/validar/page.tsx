"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "@/components/theme-provider"
import Link from "next/link"
import { Moon, Search, ShieldCheck, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ValidarPage() {
  const [codigo, setCodigo] = useState("")
  const [loading, setLoading] = useState(false)
  const [themeMounted, setThemeMounted] = useState(false)
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = themeMounted ? resolvedTheme !== "light" : true
  const themeLabel = themeMounted ? (isDark ? "Ativar modo claro" : "Ativar modo escuro") : "Alternar tema"

  useEffect(() => {
    setThemeMounted(true)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigo.trim()) return
    
    setLoading(true)
    router.push(`/validar/${codigo.trim().toUpperCase()}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white p-0.5 shadow-sm ring-1 ring-border">
              <img
                src="/logo.png"
                alt="RaroGestão"
                className="h-full w-full object-contain"
              />
            </span>
            <span className="font-semibold text-foreground">RaroGestão</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="outline" size="sm">
                Área Restrita
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={themeLabel}
              title={themeLabel}
              onClick={() => setTheme(isDark ? "light" : "dark")}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Validar Relatório</CardTitle>
            <CardDescription>
              Digite o código de autenticação para verificar a autenticidade do relatório
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="codigo" className="text-sm font-medium">
                  Código de Autenticação
                </label>
                <Input
                  id="codigo"
                  placeholder="Ex: RAR-MP78QLCL-4UEFWL"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  className="h-12 text-center font-mono text-lg uppercase tracking-wider"
                />
                <p className="text-xs text-muted-foreground text-center">
                  O código está localizado no relatório ou no QR Code
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12"
                disabled={!codigo.trim() || loading}
              >
                {loading ? (
                  "Verificando..."
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Verificar Autenticidade
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>RAROTEC - Tecnologia para Gestão Pública</p>
          <p className="mt-1">RaroGestão - Sistema de Gestão Administrativa</p>
        </div>
      </footer>
    </div>
  )
}
