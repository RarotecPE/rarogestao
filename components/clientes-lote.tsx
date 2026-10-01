"use client"

import { useRef, useState } from "react"
import { FileDown, Upload, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { MODULOS_SISTEMA } from "@/lib/constants"

// Colunas do layout de importacao. `aliases` aceita variacoes de cabecalho na planilha enviada.
const COLUNAS = [
  { key: "razao_social", header: "Razão Social", obrigatorio: true, aliases: ["razao social", "razao_social", "empresa"] },
  { key: "nome_fantasia", header: "Nome Fantasia", aliases: ["nome fantasia", "fantasia"] },
  { key: "cnpj", header: "CNPJ", aliases: ["cnpj"] },
  { key: "cidade", header: "Cidade", aliases: ["cidade", "municipio", "município"] },
  { key: "estado", header: "UF", aliases: ["uf", "estado"] },
  { key: "telefone", header: "Telefone", aliases: ["telefone", "fone", "contato"] },
  { key: "email", header: "E-mail", aliases: ["email", "e-mail", "e mail"] },
  { key: "modulos", header: "Módulos", aliases: ["modulos", "módulos", "modulo", "módulo", "sistemas"] },
] as const

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

// Dispara o download de um Blob sem dependencias externas.
function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

interface LinhaImportacao {
  razao_social: string
  nome_fantasia: string
  cnpj: string
  cidade: string
  estado: string
  telefone: string
  email: string
  modulos: string
}

interface ResultadoImportacao {
  inseridos: number
  ignorados: number
  modulos_vinculados: number
  erros: { linha: number; motivo: string }[]
  avisos?: { linha: number; motivo: string }[]
}

interface ClientesLoteProps {
  onImported?: () => void
  disabled?: boolean
}

export function ClientesLote({ onImported, disabled }: ClientesLoteProps) {
  const [open, setOpen] = useState(false)
  const [linhas, setLinhas] = useState<LinhaImportacao[]>([])
  const [fileName, setFileName] = useState("")
  const [parseError, setParseError] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Gera e baixa a planilha-modelo (layout) esperada pela importacao em lote.
  const baixarLayout = async () => {
    const XLSX = await import("xlsx")
    const cabecalho = COLUNAS.map((c) => c.header)
    const exemplo = [
      "PREFEITURA MUNICIPAL DE EXEMPLO",
      "Prefeitura Exemplo",
      "00000000000000",
      "Recife",
      "PE",
      "(81) 0000-0000",
      "contato@exemplo.gov.br",
      "Contabilidade; Portal da Transparência; Recursos Humanos",
    ]
    const ws = XLSX.utils.aoa_to_sheet([cabecalho, exemplo])
    ws["!cols"] = COLUNAS.map((c) => ({ wch: c.key === "modulos" ? 50 : 30 }))

    // Aba de referencia: lista os modulos validos. Na coluna "Módulos" da aba Clientes,
    // informe um ou mais destes nomes separados por ";" (ponto e virgula) ou "," (virgula).
    const wsModulos = XLSX.utils.aoa_to_sheet([
      ["Módulos disponíveis (use exatamente estes nomes, separados por ; na coluna Módulos)"],
      ...MODULOS_SISTEMA.map((m) => [m]),
    ])
    wsModulos["!cols"] = [{ wch: 55 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Clientes")
    XLSX.utils.book_append_sheet(wb, wsModulos, "Módulos Disponíveis")
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    baixarBlob(new Blob([buffer], { type: EXCEL_MIME }), "layout-importacao-clientes.xlsx")
  }

  const normalizarChave = (s: string) =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()

  const abrirSeletor = () => inputRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResultado(null)
    setParseError("")
    try {
      const XLSX = await import("xlsx")
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const brutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })

      const mapeadas: LinhaImportacao[] = brutas
        .map((linha) => {
          // Indexa a linha por cabecalho normalizado para casar aliases.
          const porChave: Record<string, string> = {}
          for (const [k, v] of Object.entries(linha)) {
            porChave[normalizarChave(k)] = String(v ?? "").trim()
          }
          const obj = {} as LinhaImportacao
          for (const col of COLUNAS) {
            const candidatos = [col.header, col.key, ...(col.aliases || [])].map(normalizarChave)
            const valor = candidatos.map((c) => porChave[c]).find((v) => v !== undefined && v !== "") || ""
            obj[col.key] = valor
          }
          return obj
        })
        .filter((linha) => Object.values(linha).some((v) => v))

      if (mapeadas.length === 0) {
        setParseError("Nenhuma linha valida encontrada. Baixe o layout e use os cabecalhos indicados.")
      }
      setLinhas(mapeadas)
    } catch {
      setParseError("Nao foi possivel ler o arquivo. Envie uma planilha .xlsx ou .csv valida.")
      setLinhas([])
    } finally {
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const enviar = async () => {
    if (linhas.length === 0) return
    setEnviando(true)
    try {
      const res = await fetch("/api/clientes/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientes: linhas }),
      })
      const data = (await res.json()) as ResultadoImportacao
      setResultado(data)
      if (data.inseridos > 0) onImported?.()
    } catch {
      setParseError("Erro ao enviar os dados. Tente novamente.")
    } finally {
      setEnviando(false)
    }
  }

  const fecharDialog = (aberto: boolean) => {
    setOpen(aberto)
    if (!aberto) {
      setLinhas([])
      setFileName("")
      setParseError("")
      setResultado(null)
    }
  }

  const semObrigatorio = linhas.filter((l) => !l.razao_social).length

  return (
    <>
      <Button variant="outline" size="sm" onClick={baixarLayout} disabled={disabled}>
        <FileDown className="h-4 w-4 mr-2" />
        Layout
      </Button>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Upload className="h-4 w-4 mr-2" />
        Upload em Lote
      </Button>

      <Dialog open={open} onOpenChange={fecharDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar clientes em lote</DialogTitle>
            <DialogDescription>
              Envie a planilha preenchida no formato do layout. A coluna &quot;Módulos&quot; aceita um ou mais
              módulos separados por &quot;;&quot; ou &quot;,&quot;. Clientes com CNPJ ja cadastrado sao
              ignorados &mdash; registros existentes nunca sao removidos ou sobrescritos.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            className="hidden"
          />

          {/* Resultado da importacao */}
          {resultado ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-semibold text-emerald-600">{resultado.inseridos}</p>
                  <p className="text-xs text-muted-foreground">Inseridos</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-semibold text-amber-600">{resultado.ignorados}</p>
                  <p className="text-xs text-muted-foreground">Ignorados (ja existem)</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-semibold text-destructive">{resultado.erros.length}</p>
                  <p className="text-xs text-muted-foreground">Com erro</p>
                </div>
              </div>

              {resultado.erros.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    Linhas nao importadas
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {resultado.erros.map((erro) => (
                      <li key={erro.linha}>
                        Linha {erro.linha}: {erro.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {resultado.avisos && resultado.avisos.length > 0 && (
                <div className="rounded-lg border border-amber-300/40 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-950/30">
                  <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4" />
                    Avisos (cliente importado, mas com ressalvas)
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-700/80 dark:text-amber-300/90">
                    {resultado.avisos.map((aviso, i) => (
                      <li key={i}>
                        Linha {aviso.linha}: {aviso.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {resultado.inseridos > 0 && (
                <p className="flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  {resultado.inseridos} cliente(s) adicionado(s)
                  {resultado.modulos_vinculados > 0 &&
                    ` e ${resultado.modulos_vinculados} módulo(s) vinculado(s)`}{" "}
                  com sucesso.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Seletor de arquivo */}
              <button
                type="button"
                onClick={abrirSeletor}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input p-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {fileName || "Clique para selecionar a planilha (.xlsx ou .csv)"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Use o botao &quot;Layout&quot; para baixar o modelo com os cabecalhos corretos
                </span>
              </button>

              {parseError && (
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {parseError}
                </p>
              )}

              {/* Previa */}
              {linhas.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Previa &mdash; {linhas.length} linha(s)
                      {semObrigatorio > 0 && (
                        <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                          {semObrigatorio} sem razao social
                        </Badge>
                      )}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLinhas([])
                        setFileName("")
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Limpar
                    </Button>
                  </div>
                  <div className="max-h-64 overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Razao Social</TableHead>
                          <TableHead>CNPJ</TableHead>
                          <TableHead>Cidade/UF</TableHead>
                          <TableHead>Módulos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linhas.slice(0, 50).map((linha, i) => {
                          const qtdModulos = linha.modulos
                            ? linha.modulos.split(/[;,]/).map((m) => m.trim()).filter(Boolean).length
                            : 0
                          return (
                            <TableRow key={i}>
                              <TableCell className="max-w-[240px] truncate">
                                {linha.razao_social || (
                                  <span className="text-destructive">(vazio)</span>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{linha.cnpj || "-"}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {linha.cidade || linha.estado ? `${linha.cidade || "-"}/${linha.estado || "-"}` : "-"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {qtdModulos > 0 ? (
                                  <Badge variant="secondary">{qtdModulos} módulo(s)</Badge>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {linhas.length > 50 && (
                    <p className="text-xs text-muted-foreground">
                      Mostrando as primeiras 50 linhas de {linhas.length}.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {resultado ? (
              <Button onClick={() => fecharDialog(false)}>Concluir</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => fecharDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={enviar} disabled={enviando || linhas.length === 0}>
                  {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Importar {linhas.length > 0 ? `${linhas.length} cliente(s)` : ""}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
