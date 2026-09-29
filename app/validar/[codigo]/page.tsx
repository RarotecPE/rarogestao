"use client"

import { use, useEffect, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useTheme } from "@/components/theme-provider"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Calendar, 
  MapPin, 
  Building2,
  User,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  ShieldX,
  Download,
  Moon,
  Sun
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { ApuracaoPdfData } from "@/lib/apuracao-pdf-generator"
import { competenciaLabel, formatBRL } from "@/lib/apuracao"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface ApuracaoValidada {
  id: number
  numero_autenticacao: string
  numero: number
  numero_texto: string
  exercicio: number
  competencia: string
  data_emissao?: string
  destinatario_nome?: string
  destinatario_cargo?: string
  sigla_orgao?: string
  numero_contrato_texto?: string
  municipio?: string
  cliente_nome?: string
  cliente_razao?: string
  cliente_cnpj?: string
  cliente_cidade?: string
  cliente_estado?: string
  modo_valor?: string
  valor_global?: number | string | null
  valor_total?: number | string | null
  texto?: string
  observacoes?: string
  modalidade_remoto?: boolean
  modalidade_presencial?: boolean
  origem?: string
  status?: string
  itens?: { rotulo: string; marcado?: boolean }[]
  itens_servico?: { rotulo?: string; descricao?: string; quantidade?: number; valor?: number }[]
  created_at?: string
}

interface ValidacaoResult {
  valid: boolean
  error?: string
  tipo?: "apuracao"
  apuracao?: ApuracaoValidada
  relatorio?: {
    id: number
    numero_autenticacao: string
    data_visita: string
    data_fim?: string
    hora_inicio?: string
    hora_fim?: string
    data_relatorio: string
    municipio: string
    estado: string
    cliente_nome: string
    cliente_cnpj?: string
    cliente_endereco?: string
    cliente_cidade: string
    cliente_estado: string
    orgao_atendido: string
    entidades?: { tipo: string; cnpj: string; nome?: string }[]
    tipo_servico: string
    tema: string
    modulos: string[]
    tecnicos_rarotec: { nome: string; email?: string }[]
    tecnicos_cliente?: { nome: string; email?: string; cpf?: string }[]
    tecnico_cliente: { nome: string; email?: string; cpf?: string } | null
    descricao_servicos?: string
    observacoes?: string
    anexos?: { id: number; nome_arquivo: string; tipo_arquivo: string; url: string }[]
    created_at: string
    status: string
  }
}

export default function ValidarCodigoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = use(params)
  const [downloading, setDownloading] = useState(false)
  const [themeMounted, setThemeMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = themeMounted ? resolvedTheme !== "light" : true
  const themeLabel = themeMounted ? (isDark ? "Ativar modo claro" : "Ativar modo escuro") : "Alternar tema"

  useEffect(() => {
    setThemeMounted(true)
  }, [])

  const { data, error, isLoading } = useSWR<ValidacaoResult>(
    `/api/validar/${codigo}`,
    fetcher
  )

  const relatorio = data?.relatorio || (data as any)?.relatório

  const handleDownloadPDF = async () => {
    if (!relatorio) return
    
    setDownloading(true)
    try {
      const rel = relatorio
      
      // Processar orgao_atendido para criar entidades formatadas (igual ao histórico)
      const processedEntidades = rel.orgao_atendido ? rel.orgao_atendido.split("; ").map((o: string) => {
        const match = o.match(/^(.+?) \(CNPJ: (.+?)\)$/)
        if (match) {
          let nome = match[1] === "undefined" ? "" : match[1]
          const cnpj = match[2]
          return { tipo: nome, nome: nome, cnpj: cnpj }
        }
        return { tipo: o, nome: o, cnpj: "-" }
      }) : []
      
      // Processar representantes do cliente (igual ao histórico)
      const tecnicosClienteProcessados = (() => {
        // Tentar usar tecnicos_cliente (já processado pela API)
        if (rel.tecnicos_cliente && rel.tecnicos_cliente.length > 0) {
          return rel.tecnicos_cliente.map((t: any) => ({ nome: t.nome, cpf: t.cpf, email: t.email }))
        }
        // Fallback para técnico único
        if (rel.tecnico_cliente) {
          return [{ 
            nome: rel.tecnico_cliente.nome, 
            cpf: rel.tecnico_cliente.cpf, 
            email: rel.tecnico_cliente.email 
          }]
        }
        return []
      })()
      
      // Preparar dados para o PDF - idêntico ao formato usado no histórico
      const pdfData = {
        tiposRelatorio: rel.tema ? rel.tema.split(", ") : [rel.tipo_servico || "Visita Técnica"],
        dataInicio: rel.data_visita || rel.data_relatorio || "",
        dataFim: rel.data_fim || rel.data_visita || "",
        horaInicio: rel.hora_inicio || "",
        horaFim: rel.hora_fim || "",
        estado: rel.estado || "PE",
        municipio: rel.municipio || rel.cliente_cidade || "",
        cliente: rel.cliente_nome ? {
          nome: rel.cliente_nome,
          cnpj: rel.cliente_cnpj || "-",
          endereco: rel.cliente_endereco || (rel.cliente_cidade ? `${rel.cliente_cidade} - ${rel.cliente_estado}` : undefined),
        } : null,
        entidades: processedEntidades,
        modulos: rel.modulos || [],
        servicos: rel.tipo_servico ? rel.tipo_servico.split(", ") : [],
        tecnicosRarotec: rel.tecnicos_rarotec || [],
        tecnicosCliente: tecnicosClienteProcessados,
        descricaoServicos: rel.descricao_servicos || "",
        observacoes: rel.observacoes || "",
        anexos: rel.anexos 
          ? rel.anexos.map((a: any) => ({ name: a.nome_arquivo, type: a.tipo_arquivo }))
          : [],
        // Buscar arquivos reais dos anexos para embutir no PDF
        anexosFiles: await (async () => {
          if (!rel.anexos || rel.anexos.length === 0) return []
          
          const files: File[] = []
          for (const anexo of rel.anexos) {
            try {
              // Buscar arquivo diretamente da API (que faz streaming do blob privado)
              const response = await fetch(`/api/relatorios/anexos/${anexo.id}`)
              if (!response.ok) continue
              
              const blob = await response.blob()
              const file = new File([blob], anexo.nome_arquivo, { type: anexo.tipo_arquivo || blob.type || "application/pdf" })
              files.push(file)
            } catch (error) {
              console.error(`Erro ao buscar anexo ${anexo.nome_arquivo}:`, error)
            }
          }
          return files
        })(),
        numeroAutenticacao: rel.numero_autenticacao,
        // Rastreabilidade - usar técnicos Rarotec como quem gerou o relatório
        usuarioEmissor: rel.tecnicos_rarotec && rel.tecnicos_rarotec.length > 0
          ? rel.tecnicos_rarotec.map((t: any) => t.nome).join(", ")
          : "Equipe Rarotec",
        dataEmissaoRelatorio: rel.created_at 
          ? format(new Date(rel.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
          : undefined,
        usuarioDownload: "Validação Externa",
      }
      
      const { generateRelatorioPDF, downloadPDF } = await import("@/lib/pdf-generator")
      const blob = await generateRelatorioPDF(pdfData)
      const dataFormatada = (() => {
        const raw = rel.data_visita || rel.data_relatorio
        if (!raw) return format(new Date(), "yyyy-MM-dd")
        const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (m) return `${m[1]}-${m[2]}-${m[3]}`
        const br = String(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`
        const d = new Date(raw)
        return isNaN(d.getTime()) ? format(new Date(), "yyyy-MM-dd") : format(d, "yyyy-MM-dd")
      })()
      const munSlug = (rel.municipio || "visita")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
      const filename = `relatorio-${munSlug || "visita"}-${dataFormatada}.pdf`
      downloadPDF(blob, filename)
    } catch (error) {
      console.error("Erro ao gerar PDF:", error)
      alert("Erro ao gerar o PDF. Tente novamente.")
    } finally {
      setDownloading(false)
    }
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
                alt="SISGAR"
                className="h-full w-full object-contain"
              />
            </span>
            <span className="font-semibold text-foreground">SISGAR</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/validar">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Nova Consulta
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
        {isLoading ? (
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Verificando autenticidade...</p>
            </CardContent>
          </Card>
        ) : error || !data?.valid ? (
          <Card className="w-full max-w-md border-destructive">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldX className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl text-destructive">Relatório Não Encontrado</CardTitle>
              <CardDescription>
                O código <span className="font-mono font-bold">{codigo}</span> não corresponde a nenhum relatório válido em nosso sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 text-sm">
                <p className="font-medium text-destructive mb-2">Possíveis causas:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Código digitado incorretamente</li>
                  <li>O relatório foi removido do sistema</li>
                  <li>O documento pode não ser autêntico</li>
                </ul>
              </div>
              <Link href="/validar" className="block">
                <Button className="w-full">
                  Tentar novamente
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : data.tipo === "apuracao" && data.apuracao ? (
          <ApuracaoValidacaoCard apuracao={data.apuracao} />
        ) : (
          <Card className="w-full max-w-2xl border-green-500">
            <CardHeader className="text-center border-b bg-green-50 dark:bg-green-950/20">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <ShieldCheck className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl text-green-700 dark:text-green-400">
                Relatório Autêntico
              </CardTitle>
              <CardDescription>
                Este relatório foi verificado e é autêntico
              </CardDescription>
              <Badge variant="outline" className="mx-auto mt-2 font-mono text-lg px-4 py-1">
                {relatorio?.numero_autenticacao}
              </Badge>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Informações do Relatório */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Data */}
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Data do Relatório</p>
                    <p className="text-muted-foreground">
                      {relatorio?.data_visita 
                        ? format(new Date(relatorio.data_visita), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                        : "-"
                      }
                    </p>
                  </div>
                </div>

                {/* Localização */}
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Localização</p>
                    <p className="text-muted-foreground">
                      {relatorio?.municipio} - {relatorio?.estado}
                    </p>
                  </div>
                </div>

                {/* Cliente */}
                {relatorio?.cliente_nome && (
                  <div className="flex items-start gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Cliente</p>
                      <p className="text-muted-foreground">{relatorio.cliente_nome}</p>
                    </div>
                  </div>
                )}

                {/* Órgão */}
                {relatorio?.orgao_atendido && (
                  <div className="flex items-start gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Órgão Atendido</p>
                      <p className="text-muted-foreground">{relatorio.orgao_atendido}</p>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Técnicos */}
              {relatorio?.tecnicos_rarotec && relatorio.tecnicos_rarotec.length > 0 && (
                <div>
                  <h3 className="font-medium flex items-center gap-2 mb-3">
                    <User className="h-4 w-4" />
                    Técnico(s) Responsável(is)
                  </h3>
                  <div className="space-y-2">
                    {relatorio.tecnicos_rarotec.map((tec, i) => (
                      <div key={i} className="bg-muted/50 rounded-lg px-4 py-2">
                        <p className="font-medium">{tec.nome}</p>
                        {tec.email && (
                          <p className="text-sm text-muted-foreground">{tec.email}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Módulos */}
              {relatorio?.modulos && relatorio.modulos.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">Módulos Atendidos</h3>
                  <div className="flex flex-wrap gap-2">
                    {relatorio.modulos.map((modulo, i) => (
                      <Badge key={i} variant="secondary">{modulo}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Tema/Tipo de Serviço */}
              {(relatorio?.tema || relatorio?.tipo_servico) && (
                <div>
                  <h3 className="font-medium mb-3">Tipo de Serviço</h3>
                  <Badge>{relatorio.tema || relatorio.tipo_servico}</Badge>
                </div>
              )}

              <Separator />

              {/* Botão de Download */}
              <div className="flex justify-center">
                <Button 
                  onClick={handleDownloadPDF}
                  disabled={downloading}
                  size="lg"
                  className="gap-2"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gerando PDF...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Baixar Relatório em PDF
                    </>
                  )}
                </Button>
              </div>

              <Separator />

              {/* Informações de Registro */}
              <div className="text-center text-sm text-muted-foreground">
                <p>
                  Relatório registrado em{" "}
                  {relatorio?.created_at 
                    ? format(new Date(relatorio.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                    : "-"
                  }
                </p>
                <p className="mt-1">SISGAR - Sistema de Gestão Administrativa da Rarotec</p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>RAROTEC - Tecnologia para Gestão Pública</p>
        </div>
      </footer>
    </div>
  )
}

function InfoLinha({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

function ApuracaoValidacaoCard({ apuracao }: { apuracao: ApuracaoValidada }) {
  const [downloading, setDownloading] = useState(false)

  const numToBRL = (v: number | string | null | undefined) => {
    if (v === null || v === undefined || v === "") return null
    const n = typeof v === "string" ? Number.parseFloat(v) : v
    return Number.isFinite(n) ? formatBRL(n) : null
  }

  const valorReferencia = numToBRL(apuracao.valor_total) || numToBRL(apuracao.valor_global)

  const modalidades = [
    apuracao.modalidade_remoto ? "Remoto" : null,
    apuracao.modalidade_presencial ? "Presencial" : null,
  ].filter(Boolean) as string[]

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const pdfData = {
        ...apuracao,
        valor_global:
          typeof apuracao.valor_global === "string"
            ? Number.parseFloat(apuracao.valor_global)
            : apuracao.valor_global,
        valor_total:
          typeof apuracao.valor_total === "string"
            ? Number.parseFloat(apuracao.valor_total)
            : apuracao.valor_total,
        clientes_nomes: apuracao.cliente_nome ? [apuracao.cliente_nome] : [],
      } as unknown as ApuracaoPdfData

      const [{ generateApuracaoPDF }, { downloadPDF }] = await Promise.all([
        import("@/lib/apuracao-pdf-generator"),
        import("@/lib/pdf-generator"),
      ])
      const blob = await generateApuracaoPDF(pdfData)
      downloadPDF(blob, `rmps-${apuracao.exercicio}-${apuracao.numero_texto}-${apuracao.id}.pdf`)
    } catch (error) {
      console.error("Erro ao gerar PDF do relatório mensal:", error)
      alert("Erro ao gerar o PDF. Tente novamente.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl border-green-500">
      <CardHeader className="text-center border-b bg-green-50 dark:bg-green-950/20">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
          <ShieldCheck className="h-8 w-8 text-green-600" />
        </div>
        <CardTitle className="text-2xl text-green-700 dark:text-green-400">
          Relatório Mensal Autêntico
        </CardTitle>
        <CardDescription>
          Relatório Mensal de Prestação dos Serviços verificado e autêntico
        </CardDescription>
        <Badge variant="outline" className="mx-auto mt-2 font-mono text-lg px-4 py-1">
          {apuracao.numero_autenticacao}
        </Badge>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
            <InfoLinha label="Competência" value={competenciaLabel(apuracao.competencia)} />
          </div>
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
            <InfoLinha label="Relatório Nº" value={`${apuracao.numero_texto}/${apuracao.exercicio}`} />
          </div>
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
            <InfoLinha
              label="Emissão"
              value={
                apuracao.data_emissao
                  ? apuracao.data_emissao.slice(0, 10).split("-").reverse().join("/")
                  : "-"
              }
            />
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="font-medium flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4" />
            Destinatário
          </h3>
          <div className="bg-muted/50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoLinha label="Cliente" value={apuracao.cliente_nome || apuracao.cliente_razao} />
            <InfoLinha label="Município" value={apuracao.municipio} />
            <InfoLinha label="Órgão" value={apuracao.sigla_orgao} />
            <InfoLinha
              label="A/C"
              value={
                apuracao.destinatario_nome
                  ? `${apuracao.destinatario_nome}${apuracao.destinatario_cargo ? ` - ${apuracao.destinatario_cargo}` : ""}`
                  : undefined
              }
            />
            <InfoLinha label="Contrato Nº" value={apuracao.numero_contrato_texto} />
            <InfoLinha label="CNPJ" value={apuracao.cliente_cnpj} />
          </div>
        </div>

        {valorReferencia && (
          <div>
            <h3 className="font-medium mb-2">Valor de Referência</h3>
            <p className="text-lg font-semibold text-primary">{valorReferencia}</p>
          </div>
        )}

        {modalidades.length > 0 && (
          <div>
            <h3 className="font-medium mb-3">Modalidade de Atendimento</h3>
            <div className="flex flex-wrap gap-2">
              {modalidades.map((m) => (
                <Badge key={m} variant="secondary">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {apuracao.itens && apuracao.itens.length > 0 && (
          <div>
            <h3 className="font-medium mb-3">Itens Aferidos</h3>
            <ul className="space-y-1">
              {apuracao.itens.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span>{item.rotulo}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Separator />

        <div className="flex justify-center">
          <Button onClick={handleDownload} disabled={downloading} size="lg" className="gap-2">
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando PDF...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Baixar Relatório em PDF
              </>
            )}
          </Button>
        </div>

        <Separator />

        <div className="text-center text-sm text-muted-foreground">
          <p>
            Relatório registrado em{" "}
            {apuracao.created_at
              ? format(new Date(apuracao.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
              : "-"}
          </p>
          <p className="mt-1">SISGAR - Sistema de Gestão Administrativa da Rarotec</p>
        </div>
      </CardContent>
    </Card>
  )
}
