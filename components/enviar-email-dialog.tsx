"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Mail, Send, Loader2, Plus, X, CheckCircle2, User, Building2, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface Destinatario {
  nome: string
  email: string
}

interface EnviarEmailDialogProps {
  relatorioId: number
  numeroAutenticacao?: string
  // Suporte para múltiplos técnicos
  tecnicos?: Destinatario[]
  // Fallback para técnico único (compatibilidade)
  tecnicoNome?: string
  tecnicoEmail?: string
  // Cliente
  clienteNome?: string
  clienteEmail?: string
  // Representantes do cliente (técnicos do cliente)
  representantes?: Destinatario[]
  // Município (fallback quando não há cliente)
  municipio?: string
  tipoServico?: string
  dataAtendimento?: string
  trigger?: React.ReactNode
}

export function EnviarEmailDialog({
  relatorioId,
  numeroAutenticacao,
  tecnicos = [],
  tecnicoNome,
  tecnicoEmail,
  clienteNome,
  clienteEmail,
  representantes = [],
  municipio,
  tipoServico,
  dataAtendimento,
  trigger,
}: EnviarEmailDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<{
    success: boolean
    message: string
    destinatarios?: string[]
  } | null>(null)

  // Normaliza técnicos - usa array ou fallback para props únicas
  const tecnicosNormalizados: Destinatario[] = tecnicos.length > 0 
    ? tecnicos 
    : (tecnicoNome && tecnicoEmail ? [{ nome: tecnicoNome, email: tecnicoEmail }] : 
       tecnicoNome ? [{ nome: tecnicoNome, email: "" }] : [])

  // Estado para técnicos selecionados
  const [tecnicosSelecionados, setTecnicosSelecionados] = useState<Set<string>>(
    new Set(tecnicosNormalizados.filter(t => t.email).map(t => t.email))
  )

  // Estado para representantes selecionados
  const [representantesSelecionados, setRepresentantesSelecionados] = useState<Set<string>>(
    new Set(representantes.filter(r => r.email).map(r => r.email))
  )

  const [enviarCliente, setEnviarCliente] = useState(!!clienteEmail)
  const [emailsAdicionais, setEmailsAdicionais] = useState<string[]>([])
  const [novoEmail, setNovoEmail] = useState("")

  const handleAddEmail = () => {
    if (novoEmail && novoEmail.includes("@") && !emailsAdicionais.includes(novoEmail)) {
      setEmailsAdicionais([...emailsAdicionais, novoEmail])
      setNovoEmail("")
    }
  }

  const handleRemoveEmail = (email: string) => {
    setEmailsAdicionais(emailsAdicionais.filter((e) => e !== email))
  }

  const toggleTecnico = (email: string) => {
    const newSet = new Set(tecnicosSelecionados)
    if (newSet.has(email)) {
      newSet.delete(email)
    } else {
      newSet.add(email)
    }
    setTecnicosSelecionados(newSet)
  }

  const toggleRepresentante = (email: string) => {
    const newSet = new Set(representantesSelecionados)
    if (newSet.has(email)) {
      newSet.delete(email)
    } else {
      newSet.add(email)
    }
    setRepresentantesSelecionados(newSet)
  }

  // Determina o nome do cliente/município para exibição
  const clienteOuMunicipio = clienteNome || municipio || "Não informado"

  const handleEnviar = async () => {
    setLoading(true)
    setResultado(null)

    const destinatariosParaEnviar: string[] = []
    
    // Adiciona técnicos selecionados
    tecnicosSelecionados.forEach(email => {
      if (email && !destinatariosParaEnviar.includes(email)) {
        destinatariosParaEnviar.push(email)
      }
    })
    
    // Adiciona representantes selecionados
    representantesSelecionados.forEach(email => {
      if (email && !destinatariosParaEnviar.includes(email)) {
        destinatariosParaEnviar.push(email)
      }
    })
    
    // Adiciona cliente se selecionado
    if (enviarCliente && clienteEmail && !destinatariosParaEnviar.includes(clienteEmail)) {
      destinatariosParaEnviar.push(clienteEmail)
    }
    
    // Adiciona emails adicionais
    emailsAdicionais.forEach(email => {
      if (!destinatariosParaEnviar.includes(email)) {
        destinatariosParaEnviar.push(email)
      }
    })

    if (destinatariosParaEnviar.length === 0) {
      setResultado({
        success: false,
        message: "Selecione pelo menos um destinatário",
      })
      setLoading(false)
      return
    }

    try {
      const response = await fetch("/api/email/enviar-relatorio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relatorioId,
          destinatarios: destinatariosParaEnviar,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erro ao enviar e-mail")
      }

      setResultado({
        success: true,
        message: data.message || `Email enviado com sucesso para ${destinatariosParaEnviar.length} destinatário(s)!`,
        destinatarios: destinatariosParaEnviar,
      })
    } catch (error: any) {
      console.error("Erro ao enviar email:", error)
      setResultado({
        success: false,
        message: error.message || "Erro ao enviar email. Tente novamente.",
      })
    } finally {
      setLoading(false)
    }
  }

  const totalSelecionados = 
    tecnicosSelecionados.size + 
    representantesSelecionados.size + 
    (enviarCliente && clienteEmail ? 1 : 0) + 
    emailsAdicionais.length

  const handleClose = () => {
    setOpen(false)
    // Reset estado após fechar
    setTimeout(() => {
      setResultado(null)
      setEmailsAdicionais([])
      setNovoEmail("")
    }, 200)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Mail className="h-4 w-4 mr-2" />
            Enviar por Email
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enviar Relatório por Email
          </DialogTitle>
          <DialogDescription>
            Relatório de <strong>{tipoServico || "Visita Técnica"}</strong>
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="py-6">
            <Alert variant={resultado.success ? "default" : "destructive"}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{resultado.message}</AlertDescription>
            </Alert>
            {resultado.success && resultado.destinatarios && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Enviado para:</p>
                <div className="flex flex-wrap gap-1">
                  {resultado.destinatarios.map((email) => (
                    <Badge key={email} variant="secondary">
                      {email}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button onClick={handleClose}>Fechar</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 py-4 min-h-0">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Destinatários</Label>

                {/* Técnicos Rarotec */}
                {tecnicosNormalizados.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Técnicos Rarotec
                    </p>
                    {tecnicosNormalizados.map((tecnico, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                          tecnico.email ? "hover:bg-muted/50" : "opacity-50"
                        }`}
                      >
                        <Checkbox
                          id={`tecnico-${index}`}
                          checked={tecnicosSelecionados.has(tecnico.email)}
                          onCheckedChange={() => toggleTecnico(tecnico.email)}
                          disabled={!tecnico.email}
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={`tecnico-${index}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {tecnico.nome}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {tecnico.email || "Email não cadastrado"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cliente/Município */}
                <div
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    clienteEmail ? "hover:bg-muted/50" : "opacity-50"
                  }`}
                >
                  <Checkbox
                    id="cliente"
                    checked={enviarCliente}
                    onCheckedChange={(checked) => setEnviarCliente(!!checked)}
                    disabled={!clienteEmail}
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="cliente"
                      className="text-sm font-medium cursor-pointer flex items-center gap-2"
                    >
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {clienteNome ? "Cliente" : "Município"}: {clienteOuMunicipio}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {clienteEmail || "Email não cadastrado"}
                    </p>
                  </div>
                </div>

                {/* Representantes do Cliente */}
                {representantes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      Representantes do Cliente
                    </p>
                    {representantes.map((rep, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                          rep.email ? "hover:bg-muted/50" : "opacity-50"
                        }`}
                      >
                        <Checkbox
                          id={`rep-${index}`}
                          checked={representantesSelecionados.has(rep.email)}
                          onCheckedChange={() => toggleRepresentante(rep.email)}
                          disabled={!rep.email}
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={`rep-${index}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {rep.nome}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {rep.email || "Email não cadastrado"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Emails adicionais */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Outros destinatários</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="email@exemplo.com"
                    value={novoEmail}
                    onChange={(e) => setNovoEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddEmail()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleAddEmail}
                    disabled={!novoEmail || !novoEmail.includes("@")}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {emailsAdicionais.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {emailsAdicionais.map((email) => (
                      <Badge
                        key={email}
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {email}
                        <button
                          onClick={() => handleRemoveEmail(email)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="flex-shrink-0 border-t pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleEnviar}
                disabled={loading || totalSelecionados === 0}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar ({totalSelecionados})
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
