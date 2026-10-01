"use client"

import { useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { uploadArquivo } from "@/lib/upload-blob"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Plus,
  Search,
  Paperclip,
  AlertTriangle,
  Stethoscope,
  Loader2,
  MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
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
import { useSession } from "@/lib/auth-context"
import { isGestor } from "@/lib/permissions"
import { LABEL_TIPO_MEDICO, STATUS_VALIDACAO, type DocumentoMedico } from "@/lib/documentos-medicos"
import { DocumentoMedicoDetalhe } from "@/components/documento-medico-detalhe"
import { toast } from "sonner"

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || "Erro ao carregar dados")
  return data
}

const TIPOS_OPCOES = [
  { value: "atestado", label: "Atestado Médico" },
  { value: "consulta_medica", label: "Consulta Médica" },
  { value: "licenca_medica", label: "Licença Médica" },
  { value: "licenca_maternidade", label: "Licença Maternidade" },
]

interface Tecnico {
  id: number
  nome: string
}

interface PendenciaMedica {
  id: number
  titulo: string
  tipo: string
  data_inicio: string
  tecnico_rarotec_id: number
  tecnico_nome: string
}

export default function AnexosMedicosPage() {
  const { user } = useSession()
  const userIsGestor = user?.nome ? isGestor(user.nome, user.cargo) : false
  const meuTecnicoId = user?.tecnico_rarotec_id

  const docsUrl = userIsGestor
    ? "/api/documentos-medicos"
    : meuTecnicoId
      ? `/api/documentos-medicos?tecnico_id=${meuTecnicoId}`
      : null
  const pendenciasUrl = userIsGestor
    ? "/api/dashboard/pendencias-medicas"
    : meuTecnicoId
      ? `/api/dashboard/pendencias-medicas?tecnico_id=${meuTecnicoId}`
      : null

  const { data: documentos, mutate, isLoading } = useSWR<DocumentoMedico[]>(docsUrl, fetcher)
  const { data: pendencias, mutate: mutatePendencias } = useSWR<PendenciaMedica[]>(pendenciasUrl, fetcher)
  const { data: tecnicos } = useSWR<Tecnico[]>(userIsGestor ? "/api/tecnicos-rarotec" : null, fetcher)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [tecnicoFilter, setTecnicoFilter] = useState("all")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [excluirId, setExcluirId] = useState<number | null>(null)
  const [docSelecionado, setDocSelecionado] = useState<DocumentoMedico | null>(null)
  const [detalheOpen, setDetalheOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estado do formulário
  const [form, setForm] = useState({
    tecnico_rarotec_id: "",
    tipo: "atestado",
    data_inicio: "",
    data_fim: "",
    descricao: "",
    agenda_evento_id: null as number | null,
  })
  const [arquivo, setArquivo] = useState<File | null>(null)

  const abrirNovo = (prefill?: Partial<typeof form>) => {
    setErro(null)
    setArquivo(null)
    setForm({
      tecnico_rarotec_id: prefill?.tecnico_rarotec_id ?? (meuTecnicoId ? String(meuTecnicoId) : ""),
      tipo: prefill?.tipo ?? "atestado",
      data_inicio: prefill?.data_inicio ?? "",
      data_fim: prefill?.data_fim ?? "",
      descricao: prefill?.descricao ?? "",
      agenda_evento_id: prefill?.agenda_evento_id ?? null,
    })
    setDialogOpen(true)
  }

  const anexarParaPendencia = (p: PendenciaMedica) => {
    const dataISO = p.data_inicio.split("T")[0]
    abrirNovo({
      tecnico_rarotec_id: String(p.tecnico_rarotec_id),
      tipo: p.tipo,
      data_inicio: dataISO,
      data_fim: dataISO,
      agenda_evento_id: p.id,
    })
  }

  const handleSubmit = async () => {
    setErro(null)
    if (!form.tecnico_rarotec_id || !form.tipo || !form.data_inicio || !form.data_fim) {
      setErro("Preencha técnico, tipo e o período (início e fim).")
      return
    }
    if (form.data_fim < form.data_inicio) {
      setErro("A data final não pode ser anterior à inicial.")
      return
    }
    setEnviando(true)
    try {
      let blobData: { pathname?: string; filename?: string } = {}
      if (arquivo) {
        blobData = await uploadArquivo(arquivo)
      }

      const res = await fetch("/api/documentos-medicos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tecnico_rarotec_id: Number(form.tecnico_rarotec_id),
          tipo: form.tipo,
          data_inicio: form.data_inicio,
          data_fim: form.data_fim,
          descricao: form.descricao || null,
          blob_pathname: blobData.pathname || null,
          nome_arquivo: arquivo?.name || null,
          tipo_arquivo: arquivo?.type || null,
          tamanho: arquivo?.size || null,
          agenda_evento_id: form.agenda_evento_id,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || "Falha ao salvar documento")
      }
      setDialogOpen(false)
      mutate()
      mutatePendencias()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado")
    } finally {
      setEnviando(false)
    }
  }

  const handleExcluir = async () => {
    if (excluirId == null) return
    const id = excluirId
    setExcluirId(null)
    const prevDocs = documentos ?? []
    mutate(
      prevDocs.filter((d) => d.id !== id),
      false
    )

    try {
      const res = await fetch(`/api/documentos-medicos/${id}`, { method: "DELETE" })
      if (!res.ok) {
        mutate(prevDocs, false)
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || "Erro ao excluir documento")
      }
      toast.success("Documento excluído com sucesso")
      await mutate()
      mutatePendencias()
    } catch (e) {
      mutate(prevDocs, false)
      console.error("Erro ao excluir:", e)
      toast.error(e instanceof Error ? e.message : "Erro ao excluir documento")
    }
  }

  // Documentos que aguardam acao do proprio tecnico (correcao solicitada ou recusado)
  const acaoNecessaria = useMemo(() => {
    if (!documentos || userIsGestor) return []
    return documentos.filter(
      (d) => d.status_validacao === "aguardando_tecnico" || d.status_validacao === "recusado",
    )
  }, [documentos, userIsGestor])

  const documentosFiltrados = useMemo(() => {
    if (!documentos) return []
    return documentos.filter((d) => {
      const matchTecnico = tecnicoFilter === "all" || String(d.tecnico_rarotec_id) === tecnicoFilter
      const termo = searchTerm.toLowerCase()
      const matchSearch =
        !termo ||
        d.tecnico_nome?.toLowerCase().includes(termo) ||
        LABEL_TIPO_MEDICO[d.tipo]?.toLowerCase().includes(termo) ||
        d.descricao?.toLowerCase().includes(termo)
      return matchTecnico && matchSearch
    })
  }, [documentos, tecnicoFilter, searchTerm])

  const formatarData = (v: string) => {
    try {
      return format(new Date(v.split("T")[0] + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
    } catch {
      return v
    }
  }

  const semVinculo = !userIsGestor && !meuTecnicoId

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Stethoscope className="h-6 w-6 text-primary" />
            Anexos Médicos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Repositório de atestados, consultas e licenças
            {!userIsGestor && " — seus documentos"}
          </p>
        </div>
        <Button onClick={() => abrirNovo()} disabled={semVinculo}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Documento
        </Button>
      </div>

      {semVinculo && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-950/30">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Seu usuário não está vinculado a um técnico. Solicite ao gestor para associar seu cadastro.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Ação necessária: a gestão pediu correção/esclarecimento */}
      {acaoNecessaria.length > 0 && (
        <Card className="mb-6 border-blue-200 bg-blue-50/50 dark:border-blue-500/30 dark:bg-blue-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-blue-900 dark:text-blue-100">
              <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Ação necessária ({acaoNecessaria.length})
            </CardTitle>
            <CardDescription className="text-blue-700 dark:text-blue-300">
              A gestão solicitou um ajuste ou esclarecimento. Abra para responder e reenviar o documento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {acaoNecessaria.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col gap-2 rounded-md bg-blue-500/10 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
                    <Badge variant="outline" className="border-blue-500/30 text-blue-700 dark:text-blue-300">
                      {LABEL_TIPO_MEDICO[doc.tipo] || doc.tipo}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        (STATUS_VALIDACAO[doc.status_validacao || "pendente"] || STATUS_VALIDACAO.pendente).badge
                      }
                    >
                      {(STATUS_VALIDACAO[doc.status_validacao || "pendente"] || STATUS_VALIDACAO.pendente).label}
                    </Badge>
                    <span className="text-blue-600 dark:text-blue-400">{formatarData(doc.data_inicio)}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-500/30 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
                    onClick={() => {
                      setDocSelecionado(doc)
                      setDetalheOpen(true)
                    }}
                  >
                    <MessageSquare className="mr-1 h-3.5 w-3.5" />
                    Responder
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pendências (sem anexo) */}
      {pendencias && pendencias.length > 0 && (
        <Card className="mb-6 border-rose-500/20 bg-rose-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-rose-900 dark:text-rose-200">
              <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              Documentação Pendente ({pendencias.length})
            </CardTitle>
            <CardDescription className="text-rose-700 dark:text-rose-300">
              Eventos médicos na agenda ainda sem documento anexado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendencias.slice(0, 8).map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2 text-rose-900 dark:text-rose-200">
                    <Badge variant="outline" className="border-rose-500/30 text-rose-700 dark:text-rose-300">
                      {LABEL_TIPO_MEDICO[p.tipo] || p.tipo}
                    </Badge>
                    {userIsGestor && <span className="font-medium">{p.tecnico_nome}</span>}
                    <span className="text-rose-600 dark:text-rose-400">{formatarData(p.data_inicio)}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-500/30 text-rose-700 hover:bg-rose-500/15 dark:text-rose-300"
                    onClick={() => anexarParaPendencia(p)}
                  >
                    <Paperclip className="mr-1 h-3.5 w-3.5" />
                    Anexar
                  </Button>
                </div>
              ))}
              {pendencias.length > 8 && (
                <p className="text-xs text-red-600">+ {pendencias.length - 8} outras pendências</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por técnico, tipo ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        {userIsGestor && (
          <Select value={tecnicoFilter} onValueChange={setTecnicoFilter}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Todos os técnicos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os técnicos</SelectItem>
              {tecnicos?.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Lista de documentos */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : documentosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">Nenhum documento encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {documentosFiltrados.map((doc) => (
                <div key={doc.id} className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {LABEL_TIPO_MEDICO[doc.tipo] || doc.tipo}
                      </span>
                      {userIsGestor && (
                        <span className="text-sm text-muted-foreground">— {doc.tecnico_nome}</span>
                      )}
                      {doc.blob_pathname ? (
                        <Badge
                          variant="outline"
                          className={
                            (STATUS_VALIDACAO[doc.status_validacao || "pendente"] || STATUS_VALIDACAO.pendente)
                              .badge
                          }
                        >
                          {(STATUS_VALIDACAO[doc.status_validacao || "pendente"] || STATUS_VALIDACAO.pendente)
                            .label}
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-500/15 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300">Sem anexo</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatarData(doc.data_inicio)}
                      {doc.data_fim !== doc.data_inicio && ` até ${formatarData(doc.data_fim)}`}
                      {doc.descricao && ` — ${doc.descricao}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Ver detalhes e esclarecimentos"
                      onClick={() => {
                        setDocSelecionado(doc)
                        setDetalheOpen(true)
                      }}
                    >
                      <MessageSquare className="h-4 w-4" />
                      <span className="sr-only">Detalhes</span>
                    </Button>
                    {doc.blob_pathname && (
                      <Button asChild size="icon" variant="ghost" title="Baixar anexo">
                        <a
                          href={`/api/file?pathname=${encodeURIComponent(doc.blob_pathname)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="h-4 w-4" />
                          <span className="sr-only">Baixar</span>
                        </a>
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      title="Excluir"
                      onClick={() => setExcluirId(doc.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Excluir</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Novo/Anexar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Documento Médico</DialogTitle>
            <DialogDescription>
              O documento cobre todo o período informado. Todos os dias médicos do técnico dentro do
              período ficam cobertos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {userIsGestor && (
              <div className="space-y-1.5">
                <Label htmlFor="tecnico">Técnico</Label>
                <Select
                  value={form.tecnico_rarotec_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, tecnico_rarotec_id: v }))}
                >
                  <SelectTrigger id="tecnico">
                    <SelectValue placeholder="Selecione o técnico" />
                  </SelectTrigger>
                  <SelectContent>
                    {tecnicos?.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger id="tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_OPCOES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inicio">Data inicial</Label>
                <Input
                  id="inicio"
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      data_inicio: e.target.value,
                      data_fim: f.data_fim || e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fim">Data final</Label>
                <Input
                  id="fim"
                  type="date"
                  value={form.data_fim}
                  onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição (opcional)</Label>
              <Textarea
                id="descricao"
                placeholder="Observações sobre o documento..."
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="arquivo">Arquivo (PDF ou imagem)</Label>
              <input
                ref={fileInputRef}
                id="arquivo"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
                className="hidden"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {arquivo ? arquivo.name : "Selecionar arquivo"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Sem anexo, o documento fica pendente até o arquivo ser enviado.
              </p>
            </div>

            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={enviando}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={excluirId != null} onOpenChange={(o) => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O anexo também será removido do armazenamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluir}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentoMedicoDetalhe
        documento={docSelecionado}
        open={detalheOpen}
        onOpenChange={setDetalheOpen}
        papel={userIsGestor ? "gestor" : "tecnico"}
        onUpdated={() => mutate()}
      />
    </div>
  )
}
