"use client"

import useSWR from "swr"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { 
  Printer, 
  Download, 
  Building2, 
  User, 
  Calendar, 
  Clock, 
  FileText,
  MapPin,
  Mail,
  Hash,
  Paperclip,
  Users,
  CheckCircle2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { RelatorioVisita } from "@/lib/types"
import { useSession } from "@/lib/auth-context"
import { EnviarEmailDialog } from "@/components/enviar-email-dialog"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface Anexo {
  id: number
  nome_arquivo: string
  tipo_arquivo: string
  url: string
  tamanho: number
}

interface RelatorioViewProps {
  relatorioId: number
}

export function RelatorioView({ relatorioId }: RelatorioViewProps) {
  const { user } = useSession()
  const { data: relatorio } = useSWR<RelatorioVisita & {
    cliente_razao_social?: string
    cliente_endereco?: string
    cliente_cidade?: string
    cliente_estado?: string
    cliente_cnpj?: string
    modulos?: string[] | string
    tecnicos_rarotec_ids?: number[] | string
    tecnicos_rarotec_nomes?: { id?: number; nome: string; email?: string }[]
    tecnico_cliente_cpf?: string
    tecnicos_cliente_info?: any
  }>(`/api/relatorios/${relatorioId}`, fetcher)
  
  const { data: anexos } = useSWR<Anexo[]>(
    relatorioId ? `/api/relatorios/anexos?relatorio_id=${relatorioId}` : null,
    fetcher
  )

  if (!relatorio) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = async () => {
    try {
      const parseOrgaos = (orgaoStr: string | undefined) => {
        if (!orgaoStr) return []
        return orgaoStr.split("; ").map((o) => {
          const match = o.match(/^(.+?) \(CNPJ: (.+?)\)$/)
          if (match) {
            const nome = match[1] === "undefined" ? "" : match[1]
            return { tipo: nome, nome: nome, cnpj: match[2] }
          }
          return { tipo: o, nome: o, cnpj: "-" }
        })
      }

      const parseTecnicosCliente = () => {
        if (relatorio.tecnicos_cliente_info) {
          const info = typeof relatorio.tecnicos_cliente_info === 'string'
            ? JSON.parse(relatorio.tecnicos_cliente_info)
            : relatorio.tecnicos_cliente_info
          return info.map((t: any) => ({ nome: t.nome, cpf: t.cpf, email: t.email }))
        }
        if (relatorio.tecnico_cliente_nome) {
          return [{ 
            nome: relatorio.tecnico_cliente_nome, 
            cpf: relatorio.tecnico_cliente_cpf,
            email: relatorio.tecnico_cliente_email || undefined 
          }]
        }
        return []
      }

      const pdfData = {
        tiposRelatorio: relatorio.tema ? relatorio.tema.split(", ") : [relatorio.tipo_servico || "Visita Técnica"],
        dataInicio: relatorio.data_visita || relatorio.data_relatorio || "",
        dataFim: relatorio.data_fim || relatorio.data_visita || "",
        horaInicio: relatorio.hora_inicio || "",
        horaFim: relatorio.hora_fim || "",
        estado: relatorio.cliente_estado || relatorio.estado || "PE",
        municipio: relatorio.municipio || relatorio.cliente_cidade || "",
        cliente: relatorio.cliente_nome ? {
          nome: relatorio.cliente_nome,
          cnpj: relatorio.cliente_cnpj || "-",
          endereco: relatorio.cliente_endereco,
        } : null,
        entidades: parseOrgaos(relatorio.orgao_atendido || undefined),
        modulos: modulos,
        servicos: relatorio.tema ? relatorio.tema.split(", ") : [],
        tecnicosRarotec: relatorio.tecnicos_rarotec_nomes && relatorio.tecnicos_rarotec_nomes.length > 0
          ? relatorio.tecnicos_rarotec_nomes.map(t => ({ nome: t.nome, email: t.email }))
          : relatorio.tecnico_nome 
            ? [{ nome: relatorio.tecnico_nome, email: relatorio.tecnico_email || undefined }]
            : [],
        tecnicosCliente: parseTecnicosCliente(),
        numeroAutenticacao: relatorio.numero_autenticacao || undefined,
        descricaoServicos: relatorio.historico || relatorio.descricao_servico || "",
        observacoes: relatorio.observacoes || "",
        anexos: anexos?.map(a => ({ name: a.nome_arquivo, type: a.tipo_arquivo })) || [],
        anexosFiles: await (async () => {
          if (!anexos || anexos.length === 0) return []
          
          const files: File[] = []
          for (const anexo of anexos) {
            try {
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
        usuarioEmissor: relatorio.criado_por_nome || "Não registrado",
        dataEmissaoRelatorio: relatorio.created_at 
          ? new Date(relatorio.created_at).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
            })
          : undefined,
        usuarioDownload: user?.nome || "Usuário do Sistema",
      }
      
      const { generateRelatorioPDF, downloadPDF } = await import("@/lib/pdf-generator")
      const blob = await generateRelatorioPDF(pdfData)
      const dataBase = relatorio.data_visita || relatorio.data_relatorio
      const dataFormatada = (() => {
        if (!dataBase) return format(new Date(), "yyyy-MM-dd")
        const m = String(dataBase).match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (m) return `${m[1]}-${m[2]}-${m[3]}`
        const br = String(dataBase).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`
        const d = new Date(dataBase)
        return isNaN(d.getTime()) ? format(new Date(), "yyyy-MM-dd") : format(d, "yyyy-MM-dd")
      })()
      const clienteNome = (relatorio.cliente_nome || relatorio.orgao_atendido || "relatorio")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
      const filename = `relatorio-${clienteNome || "relatorio"}-${dataFormatada}.pdf`
      downloadPDF(blob, filename)
    } catch (error) {
      console.error("Erro ao gerar PDF:", error)
      alert("Erro ao gerar PDF. Tente novamente.")
    }
  }

  // Parse modulos se for string JSON
  const modulos = typeof relatorio.modulos === 'string' 
    ? JSON.parse(relatorio.modulos) 
    : relatorio.modulos || []

  // Parse tecnicos_cliente_info
  const tecnicosClienteInfo = relatorio.tecnicos_cliente_info 
    ? (typeof relatorio.tecnicos_cliente_info === 'string' 
        ? JSON.parse(relatorio.tecnicos_cliente_info) 
        : relatorio.tecnicos_cliente_info)
    : null

  // Formatar data sem problema de timezone
  const formatarData = (dataStr: string | undefined) => {
    if (!dataStr) return "-"
    if (typeof dataStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dataStr)) {
      const [ano, mes, dia] = dataStr.split('T')[0].split('-')
      const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
      return `${parseInt(dia)} de ${meses[parseInt(mes) - 1]} de ${ano}`
    }
    return format(new Date(dataStr), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  }

  const dataRelatorio = relatorio.data_relatorio || relatorio.data_visita

  return (
    <div className="space-y-4 max-w-full">
      {/* Ações */}
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button size="sm" onClick={handleDownloadPDF}>
          <Download className="h-4 w-4 mr-2" />
          PDF
        </Button>
        <Button size="sm" variant="outline" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
        <EnviarEmailDialog
          relatorioId={relatorio.id}
          numeroAutenticacao={relatorio.numero_autenticacao || undefined}
          tecnicos={relatorio.tecnicos_rarotec_nomes?.map((t: any) => ({ nome: t.nome, email: t.email || "" })) || []}
          clienteNome={relatorio.cliente_nome}
          clienteEmail={relatorio.cliente_email || undefined}
          representantes={relatorio.representantes_cliente?.map((r: any) => ({ nome: r.nome, email: r.email || "" })) || []}
          municipio={relatorio.municipio || undefined}
          tipoServico={relatorio.tipo_servico || undefined}
          dataAtendimento={relatorio.data_visita || ""}
        />
      </div>

      {/* Header compacto */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b">
        <Badge variant="outline" className="font-mono text-xs">
          <Hash className="h-3 w-3 mr-1" />
          {relatorio.numero_autenticacao || `ID-${relatorio.id}`}
        </Badge>
        <Badge className="bg-emerald-500 text-white">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {relatorio.status === "concluido" || relatorio.status === "aprovado" ? "Concluído" : relatorio.status}
        </Badge>
        {(relatorio.tema || relatorio.tipo_servico) && (
          <Badge variant="secondary">
            {relatorio.tema || relatorio.tipo_servico}
          </Badge>
        )}
      </div>

      {/* Grid de informações */}
      <div className="grid gap-4">
        {/* Localização e Data */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Localização</p>
                  <p className="font-semibold text-sm">{relatorio.municipio || "-"}/{relatorio.estado || "PE"}</p>
                  {relatorio.orgao_atendido && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{relatorio.orgao_atendido}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Data do Atendimento</p>
                  <p className="font-semibold text-sm">{formatarData(dataRelatorio)}</p>
                  {(relatorio.hora_inicio || relatorio.hora_fim) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {relatorio.hora_inicio?.slice(0, 5) || "-"}
                      {relatorio.hora_fim && ` às ${relatorio.hora_fim.slice(0, 5)}`}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cliente */}
        {relatorio.cliente_nome && (
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-slate-500/10 dark:bg-slate-500/15 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Cliente</p>
                  <p className="font-semibold text-sm">{relatorio.cliente_nome}</p>
                  {relatorio.cliente_cidade && (
                    <p className="text-xs text-muted-foreground mt-1">{relatorio.cliente_cidade}/{relatorio.cliente_estado}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Técnicos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Técnicos Rarotec */}
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Técnico(s) Rarotec</p>
                  <div className="space-y-1.5">
                    {relatorio.tecnicos_rarotec_nomes && relatorio.tecnicos_rarotec_nomes.length > 0 ? (
                      relatorio.tecnicos_rarotec_nomes.map((tec, i) => (
                        <div key={i} className="min-w-0">
                          <p className="font-medium text-sm truncate">{tec.nome}</p>
                          {tec.email && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                              <Mail className="h-3 w-3 shrink-0" /> 
                              <span className="truncate">{tec.email}</span>
                            </p>
                          )}
                        </div>
                      ))
                    ) : relatorio.tecnico_nome ? (
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{relatorio.tecnico_nome}</p>
                        {relatorio.tecnico_email && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                            <Mail className="h-3 w-3 shrink-0" /> 
                            <span className="truncate">{relatorio.tecnico_email}</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">-</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Representantes do Cliente */}
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-purple-500/10 dark:bg-purple-500/15 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Representante(s) do Cliente</p>
                  <div className="space-y-1.5">
                    {tecnicosClienteInfo && tecnicosClienteInfo.length > 0 ? (
                      tecnicosClienteInfo.map((tc: any, idx: number) => (
                        <div key={idx} className="min-w-0">
                          <p className="font-medium text-sm truncate">{tc.nome}</p>
                          {tc.email && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                              <Mail className="h-3 w-3 shrink-0" /> 
                              <span className="truncate">{tc.email}</span>
                            </p>
                          )}
                        </div>
                      ))
                    ) : relatorio.tecnico_cliente_nome ? (
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{relatorio.tecnico_cliente_nome}</p>
                        {relatorio.tecnico_cliente_email && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                            <Mail className="h-3 w-3 shrink-0" /> 
                            <span className="truncate">{relatorio.tecnico_cliente_email}</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">-</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Módulos/Sistemas */}
        {modulos.length > 0 && (
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Módulos/Sistemas Atendidos</p>
              <div className="flex flex-wrap gap-1.5">
                {modulos.map((modulo: string) => (
                  <Badge key={modulo} variant="secondary" className="text-xs">{modulo}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Descrição */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Descrição do Atendimento</p>
            <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap min-h-[80px]">
              {relatorio.historico || relatorio.descricao_servico || "Nenhuma descrição fornecida."}
            </div>
          </CardContent>
        </Card>

        {/* Observações */}
        {relatorio.observacoes && (
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Observações</p>
              <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap">
                {relatorio.observacoes}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Anexos */}
        {anexos && anexos.length > 0 && (
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Anexos ({anexos.length})</p>
              </div>
              <div className="space-y-2">
                {anexos.map((anexo) => (
                  <a
                    key={anexo.id}
                    href={`/api/relatorios/anexos/${anexo.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate flex-1">{anexo.nome_arquivo}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(anexo.tamanho / 1024).toFixed(0)} KB
                    </span>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Rodapé */}
      <div className="text-center text-xs text-muted-foreground pt-3 border-t">
        <p>SISGAR - Sistema de Gestão Administrativa da Rarotec</p>
      </div>
    </div>
  )
}
