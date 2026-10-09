"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  Settings, 
  Lock,
  Building2, 
  Trash2, 
  AlertTriangle,
  ShieldAlert,
  Loader2,
  ExternalLink,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { useSession } from "@/lib/auth-context"
import { isGestor } from "@/lib/permissions"
import { OuveConfigToggle } from "@/components/ouve-config-toggle"

const TABELAS_DISPONIVEIS = [
  { id: "relatorios", label: "Relatórios de Visita", description: "Todos os relatórios e anexos" },
  { id: "agenda", label: "Agenda", description: "Todos os agendamentos" },
  { id: "pesquisas", label: "Pesquisas", description: "Todas as pesquisas de satisfação" },
  { id: "tecnicos_clientes", label: "Técnicos dos Clientes", description: "Contatos dos clientes" },
  { id: "tecnicos_rarotec", label: "Técnicos Rarotec", description: "Equipe (exceto você)" },
  { id: "clientes", label: "Clientes", description: "Todos os clientes cadastrados" },
  { id: "usuarios", label: "Usuários do Sistema", description: "Usuários (exceto você)" },
]

export default function ConfiguracoesPage() {
  const { user, isAdmin } = useSession()
  const userIsGestor = user?.nome ? isGestor(user.nome, user.cargo) : false
  const [nexusProfileUrl, setNexusProfileUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/auth/applications", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setNexusProfileUrl(data.nexusProfileUrl || null))
      .catch(() => setNexusProfileUrl(null))
  }, [])

  // Estados para limpeza de dados
  const [limparDialogOpen, setLimparDialogOpen] = useState(false)
  const [tabelasSelecionadas, setTabelasSelecionadas] = useState<string[]>([])
  const [confirmacaoTexto, setConfirmacaoTexto] = useState("")
  const [limparLoading, setLimparLoading] = useState(false)
  const [limparResultado, setLimparResultado] = useState<{ 
    success: boolean; 
    message: string; 
    resultados?: { tabela: string; deletados: number }[] 
  } | null>(null)

  const handleToggleTabela = (tabelaId: string) => {
    setTabelasSelecionadas(prev => 
      prev.includes(tabelaId) 
        ? prev.filter(t => t !== tabelaId)
        : [...prev, tabelaId]
    )
  }

  const handleSelectAll = () => {
    if (tabelasSelecionadas.length === TABELAS_DISPONIVEIS.length) {
      setTabelasSelecionadas([])
    } else {
      setTabelasSelecionadas(TABELAS_DISPONIVEIS.map(t => t.id))
    }
  }

  const handleLimparDados = async () => {
    if (confirmacaoTexto !== "LIMPAR DADOS") {
      return
    }

    setLimparLoading(true)
    setLimparResultado(null)

    try {
      const res = await fetch("/api/admin/limpar-dados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          confirmacao: confirmacaoTexto,
          tabelas: tabelasSelecionadas 
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setLimparResultado({ 
          success: true, 
          message: "Dados limpos com sucesso!",
          resultados: data.resultados 
        })
        setTabelasSelecionadas([])
        setConfirmacaoTexto("")
      } else {
        setLimparResultado({ success: false, message: data.error || "Erro ao limpar dados" })
      }
    } catch (error) {
      setLimparResultado({ success: false, message: "Erro ao conectar com o servidor" })
    } finally {
      setLimparLoading(false)
    }
  }

  const resetLimparDialog = () => {
    setTabelasSelecionadas([])
    setConfirmacaoTexto("")
    setLimparResultado(null)
    setLimparDialogOpen(false)
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie suas preferências e segurança
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Sistema</p>
              <p className="text-xs text-muted-foreground">RaroGestão v1.0.0</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15">
              <Lock className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Segurança</p>
              <p className="text-xs text-muted-foreground">Senha protegida</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 dark:bg-blue-500/15">
              <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Empresa</p>
              <p className="text-xs text-muted-foreground">Rarotec Tecnologia</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* OuveRarotec - apenas gestores */}
      {userIsGestor && <OuveConfigToggle />}

      {/* Cards Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-medium">Conta RaroNexus</CardTitle>
                <CardDescription>
                  Login, senha e dados de perfil são gerenciados pela central RaroNexus.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use o botão abaixo para abrir seu perfil no RaroNexus e editar seus dados de conta.
            </p>
            <Button asChild variant="outline" className="w-full justify-center gap-2 sm:w-auto">
              <a href={nexusProfileUrl || "#"} target="_blank" rel="noreferrer" aria-disabled={!nexusProfileUrl}>
                <ExternalLink className="h-4 w-4" />
                Editar perfil RaroNexus
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Zona de Perigo - Apenas para Administradores */}
        {isAdmin && (
          <Card className="border-rose-500/20 dark:border-rose-500/30 border-2 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 dark:bg-rose-500/15">
                  <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-medium text-rose-700 dark:text-rose-400">Zona de Perigo</CardTitle>
                  <CardDescription className="text-rose-600/80 dark:text-rose-400/80">
                    Ações irreversiveis - Apenas para administradores
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Atenção!</AlertTitle>
                <AlertDescription>
                  As ações nesta seção são permanentes e não podem ser desfeitas. 
                  Use com extrema cautela.
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-3">
                <Dialog open={limparDialogOpen} onOpenChange={setLimparDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" className="w-full justify-start">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Limpar Dados do Sistema
                    </Button>
                  </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-5 w-5" />
                    Limpar Dados do Sistema
                  </DialogTitle>
                  <DialogDescription>
                    Selecione quais dados deseja apagar permanentemente.
                    Esta acao não pode ser desfeita!
                  </DialogDescription>
                </DialogHeader>

                {limparResultado ? (
                  <div className="space-y-4">
                    <Alert variant={limparResultado.success ? "default" : "destructive"}>
                      <AlertTitle>
                        {limparResultado.success ? "Sucesso!" : "Erro"}
                      </AlertTitle>
                      <AlertDescription>
                        {limparResultado.message}
                      </AlertDescription>
                    </Alert>

                    {limparResultado.resultados && limparResultado.resultados.length > 0 && (
                      <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                        <p className="text-sm font-medium">Resumo da limpeza:</p>
                        {limparResultado.resultados.map((r) => (
                          <div key={r.tabela} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{r.tabela}</span>
                            <span className="font-medium">{r.deletados} registro(s)</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <DialogFooter>
                      <Button variant="outline" onClick={resetLimparDialog}>
                        Fechar
                      </Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Selecao de tabelas */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Selecione as tabelas:</Label>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={handleSelectAll}
                          className="h-8 text-xs"
                        >
                          {tabelasSelecionadas.length === TABELAS_DISPONIVEIS.length 
                            ? "Desmarcar todos" 
                            : "Selecionar todos"
                          }
                        </Button>
                      </div>
                      <div className="grid gap-2 max-h-48 overflow-y-auto p-1">
                        {TABELAS_DISPONIVEIS.map((tabela) => (
                          <div 
                            key={tabela.id}
                            className="flex items-center space-x-3 p-2 rounded-lg border hover:bg-muted/50"
                          >
                            <Checkbox
                              id={tabela.id}
                              checked={tabelasSelecionadas.includes(tabela.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setTabelasSelecionadas([...tabelasSelecionadas, tabela.id])
                                } else {
                                  setTabelasSelecionadas(tabelasSelecionadas.filter(t => t !== tabela.id))
                                }
                              }}
                            />
                            <div className="flex-1">
                              <Label htmlFor={tabela.id} className="text-sm font-medium cursor-pointer">
                                {tabela.label}
                              </Label>
                              <p className="text-xs text-muted-foreground">{tabela.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Confirmacao */}
                    <div className="space-y-2">
                      <Label htmlFor="confirmacao" className="text-sm">
                        Digite <span className="font-bold text-red-600">LIMPAR DADOS</span> para confirmar:
                      </Label>
                      <Input
                        id="confirmacao"
                        value={confirmacaoTexto}
                        onChange={(e) => setConfirmacaoTexto(e.target.value)}
                        placeholder="LIMPAR DADOS"
                        className="font-mono"
                      />
                    </div>

                    <DialogFooter className="gap-2">
                      <Button variant="outline" onClick={resetLimparDialog}>
                        Cancelar
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleLimparDados}
                        disabled={
                          limparLoading || 
                          tabelasSelecionadas.length === 0 || 
                          confirmacaoTexto !== "LIMPAR DADOS"
                        }
                      >
                        {limparLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Limpando...
                          </>
                        ) : (
                          <>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Limpar {tabelasSelecionadas.length} tabela(s)
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>

              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
