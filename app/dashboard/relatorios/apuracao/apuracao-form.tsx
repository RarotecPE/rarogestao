"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import { uploadArquivo as uploadBlob } from "@/lib/upload-blob"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MunicipioClientesSelect } from "@/components/municipio-clientes-select"
import { ItensServicoEditor } from "@/components/itens-servico-editor"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertTriangle,
  Loader2,
  Save,
  FileText,
  Upload,
  X,
  Paperclip,
  Layers,
  Wand2,
} from "lucide-react"
import {
  MODULOS_SISTEMAS,
  MESES_PT,
  competenciaLabel,
  formatBRL,
  textoPadraoSugerido,
  totalItensServico,
  sugestaoFracaoItem,
  resumoConsumoContrato,
  avaliarConsumo,
  valorTotalAnualItem,
  formatPercentual,
  fileUrl,
  type ApuracaoModelo,
  type ApuracaoItem,
  type ApuracaoItemServico,
  type ApuracaoModoValor,
  type ApuracaoImagem,
  type ApuracaoAnexoPdf,
  type ApuracaoRelatorio,
} from "@/lib/apuracao"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  relatorio?: ApuracaoRelatorio // presente no modo edicao
}

export function ApuracaoForm({ relatorio }: Props) {
  const router = useRouter()
  const editando = !!relatorio

  const { data: clientes } = useSWR<any[]>("/api/clientes", fetcher)
  const clientesArr = Array.isArray(clientes) ? clientes : []

  const now = new Date()
  const [municipio, setMunicipio] = useState(relatorio?.municipio || "")
  const [clienteIds, setClienteIds] = useState<number[]>(
    relatorio
      ? Array.isArray(relatorio.cliente_ids) && relatorio.cliente_ids.length > 0
        ? relatorio.cliente_ids
        : [relatorio.cliente_id]
      : [],
  )
  const [modeloId, setModeloId] = useState(relatorio?.modelo_id ? String(relatorio.modelo_id) : "")
  const [competencia, setCompetencia] = useState(
    relatorio?.competencia || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  )
  const [numero, setNumero] = useState(relatorio ? String(relatorio.numero) : "")
  const [numeroDuplicado, setNumeroDuplicado] = useState<{ duplicado: boolean; usos: any[] }>({
    duplicado: false,
    usos: [],
  })
  const [siglaOrgao, setSiglaOrgao] = useState(relatorio?.sigla_orgao || "")
  const [numeroContrato, setNumeroContrato] = useState(relatorio?.numero_contrato_texto || "")
  const [gestorNome, setGestorNome] = useState(relatorio?.destinatario_nome || "")
  const [gestorCargo, setGestorCargo] = useState(relatorio?.destinatario_cargo || "")
  const [itens, setItens] = useState<ApuracaoItem[]>(relatorio?.itens || [])
  const [itensServico, setItensServico] = useState<ApuracaoItemServico[]>(
    relatorio?.itens_servico || [],
  )
  const [modoValor, setModoValor] = useState<ApuracaoModoValor>(
    relatorio?.modo_valor || "global",
  )
  const [valorGlobal, setValorGlobal] = useState(
    relatorio?.valor_global != null ? String(relatorio.valor_global) : "",
  )
  // Controle de contrato (herdado do modelo; snapshot da emissao)
  const [controleConsumo, setControleConsumo] = useState(relatorio?.controle_consumo ?? false)
  const [mesesContrato, setMesesContrato] = useState<number>(relatorio?.meses_contrato ?? 12)
  const [valorTotalContrato, setValorTotalContrato] = useState<number | null>(
    relatorio?.valor_total_contrato != null ? Number(relatorio.valor_total_contrato) : null,
  )
  // Consumo ja emitido do contrato (R$), vindo do modelo — base p/ modos global/por_modulo.
  const [consumidoEmitido, setConsumidoEmitido] = useState(0)
  // Nº de apuracoes ja emitidas do modelo (indice 0-based desta emissao) — usado no preview da
  // distribuicao mensal variavel por item.
  const [emitidosCount, setEmitidosCount] = useState(0)
  const [texto, setTexto] = useState(relatorio?.texto || "")
  const [observacoes, setObservacoes] = useState(relatorio?.observacoes || "")
  const [remoto, setRemoto] = useState(relatorio?.modalidade_remoto ?? true)
  const [presencial, setPresencial] = useState(relatorio?.modalidade_presencial ?? false)
  const [imagens, setImagens] = useState<ApuracaoImagem[]>(relatorio?.imagens || [])
  const [anexosPdf, setAnexosPdf] = useState<ApuracaoAnexoPdf[]>(relatorio?.anexos_pdf || [])
  const [visitasIds, setVisitasIds] = useState<number[]>(relatorio?.visitas_ids || [])
  const [origem, setOrigem] = useState<"padrao" | "consolidado" | "automatica">(
    relatorio?.origem || "padrao",
  )
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Modelos do municipio selecionado
  const { data: modelos } = useSWR<ApuracaoModelo[]>(
    municipio ? `/api/apuracao/modelos?municipio=${encodeURIComponent(municipio)}` : null,
    fetcher,
  )
  const modelosArr = Array.isArray(modelos) ? modelos : []

  // Visitas disponiveis na competencia (para todos os clientes selecionados)
  const modulosQuery = itens.map((i) => i.nome).join(",")
  const clienteIdsQuery = clienteIds.join(",")
  const { data: visitasResp } = useSWR<any>(
    clienteIds.length > 0 && competencia
      ? `/api/apuracao/visitas-disponiveis?cliente_ids=${clienteIdsQuery}&competencia=${competencia}&modulos=${encodeURIComponent(modulosQuery)}`
      : null,
    fetcher,
  )
  const visitas = visitasResp?.visitas || []

  // Aplica os padroes do modelo selecionado
  const aplicarModelo = useCallback(
    (m: ApuracaoModelo) => {
      setSiglaOrgao(m.sigla_orgao || "")
      setNumeroContrato(m.numero_contrato_texto || "")
      setGestorNome(m.destinatario_nome || "")
      setGestorCargo(m.destinatario_cargo || "")
      setItens(Array.isArray(m.itens) ? m.itens : [])
      setItensServico(Array.isArray(m.itens_servico) ? m.itens_servico : [])
      setModoValor(m.modo_valor || "global")
      setValorGlobal(m.valor_global != null ? String(m.valor_global) : "")
      setControleConsumo(m.controle_consumo ?? false)
      setMesesContrato(m.meses_contrato ?? 12)
      setValorTotalContrato(m.valor_total_contrato != null ? Number(m.valor_total_contrato) : null)
      setConsumidoEmitido(Number(m.consumido_emitido) || 0)
      setEmitidosCount(Number(m.emitidos_count) || 0)
      setTexto(m.texto_padrao || "")
      setObservacoes(m.observacoes_padrao || "")
      setRemoto(m.modalidade_remoto)
      setPresencial(m.modalidade_presencial)
    },
    [],
  )

  function onSelecionarModelo(id: string) {
    setModeloId(id)
    const m = modelosArr.find((x) => String(x.id) === id)
    if (m && !editando) {
      aplicarModelo(m)
      // Se ainda nao ha clientes escolhidos, adota os do modelo
      if (clienteIds.length === 0) {
        const idsModelo =
          Array.isArray(m.cliente_ids) && m.cliente_ids.length > 0 ? m.cliente_ids : [m.cliente_id]
        setClienteIds(idsModelo)
        if (m.municipio) setMunicipio(m.municipio)
      }
    }
  }

  // Sugere o proximo numero ao escolher o modelo (apenas em criacao)
  useEffect(() => {
    if (editando || !modeloId) return
    fetch(`/api/apuracao/proximo-numero?modelo_id=${modeloId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.proximo) setNumero(String(d.proximo))
      })
      .catch(() => {})
  }, [modeloId, editando])

  // Verifica duplicidade do numero informado
  useEffect(() => {
    if (!modeloId || !numero) {
      setNumeroDuplicado({ duplicado: false, usos: [] })
      return
    }
    const t = setTimeout(() => {
      fetch(`/api/apuracao/proximo-numero?modelo_id=${modeloId}&numero=${numero}`)
        .then((r) => r.json())
        .then((d) => setNumeroDuplicado({ duplicado: !!d.duplicado, usos: d.usos || [] }))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [numero, modeloId])

  // Deteccao automatica de origem (consolidado x padrao) e sugestao de anexos
  const visitasCompativeis = useMemo(
    () => visitas.filter((v: any) => v.casa_modulo),
    [visitas],
  )

  function toggleItem(nome: string) {
    setItens((prev) =>
      prev.some((i) => i.nome === nome)
        ? prev.filter((i) => i.nome !== nome)
        : [...prev, { nome, valor: 0 }],
    )
  }
  function setItemValor(nome: string, v: string) {
    setItens((prev) => prev.map((i) => (i.nome === nome ? { ...i, valor: Number(v) || 0 } : i)))
  }

  function toggleVisita(v: any) {
    const jaTem = visitasIds.includes(v.id)
    if (jaTem) {
      setVisitasIds((prev) => prev.filter((id) => id !== v.id))
      setAnexosPdf((prev) => prev.filter((a) => a.visita_id !== v.id))
    } else {
      setVisitasIds((prev) => [...prev, v.id])
    }
  }

  function gerarTexto() {
    const nomes = clienteIds
      .map((id) => clientesArr.find((c) => c.id === id)?.nome_fantasia)
      .filter(Boolean) as string[]
    const alvo = nomes.length ? nomes.join(", ") : municipio || "cliente"
    setTexto(textoPadraoSugerido(alvo, itens.map((i) => i.nome)))
  }

  // Retorna o pathname do blob privado (servido depois via /api/file)
  async function uploadArquivo(file: File): Promise<{ pathname: string } | null> {
    try {
      const data = await uploadBlob(file)
      return { pathname: data.pathname }
    } catch {
      alert(`Falha ao enviar "${file.name}".`)
      return null
    }
  }

  async function onAddImagens(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const blob = await uploadArquivo(file)
        if (blob?.pathname) setImagens((prev) => [...prev, { url: blob.pathname, legenda: "" }])
      }
    } finally {
      setUploading(false)
    }
  }

  async function onAddAnexosPdf(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const blob = await uploadArquivo(file)
        if (blob?.pathname) setAnexosPdf((prev) => [...prev, { url: blob.pathname, nome: file.name }])
      }
    } finally {
      setUploading(false)
    }
  }

  const valorTotal = useMemo(() => {
    if (modoValor === "por_modulo") return itens.reduce((s, i) => s + (Number(i.valor) || 0), 0)
    if (modoValor === "por_item") return totalItensServico(itensServico)
    return Number(valorGlobal) || 0
  }, [modoValor, itens, itensServico, valorGlobal])

  // Alertas de consumo: itens que esgotaram ou que so cabem fracionados nesta emissao.
  // `quantidade_consumida_auto` vem do modelo (consumo ANTERIOR a esta emissao).
  const alertasConsumo = useMemo(() => {
    if (!controleConsumo || modoValor !== "por_item") return []
    return itensServico
      .map((it) => ({ item: it, s: sugestaoFracaoItem(it) }))
      .filter(({ s, item }) => s.controlado && (s.esgotado || s.deveFracionar) && Number(item.quantidade) > 0)
  }, [controleConsumo, modoValor, itensServico])

  function aplicarFracao(descricao: string, quantidade: number) {
    setItensServico((prev) =>
      prev.map((i) => {
        if (i.descricao !== descricao) return i
        const unit = i.valor_unitario ?? (i.quantidade > 0 ? i.valor / i.quantidade : i.valor)
        return { ...i, quantidade, valor: unit * quantidade }
      }),
    )
  }

  // Resumo do contrato PROJETADO com esta emissao: o consumo já registrado
  // + o valor desta apuracao. Usado apenas na TELA para alertar quando o contrato passa
  // de 80% — nao entra no PDF do relatorio. Vale para os tres modos de valor:
  // - por_item: consumo por item (auto/manual) + Σ desta emissao.
  // - global/por_modulo: consumo ja emitido (R$) + valor desta emissao.
  const resumoContrato = useMemo(() => {
    if (!controleConsumo) return null
    if (modoValor === "por_item") {
      return resumoConsumoContrato(itensServico, {
        valorTotalContrato,
        consumoAdicional: totalItensServico(itensServico),
      })
    }
    // Total do contrato: override manual OU derivado do modo.
    const totalDerivado =
      modoValor === "por_modulo"
        ? itens.reduce(
            (s, i) =>
              s +
              valorTotalAnualItem({
                valor: Number(i.valor) || 0,
                quantidade: 0,
                quantidade_contrato: i.quantidade_contrato,
                valor_total: i.valor_total,
              }),
            0,
          )
        : (Number(valorGlobal) || 0) * (Number(mesesContrato) || 0)
    const total = valorTotalContrato != null && valorTotalContrato > 0 ? valorTotalContrato : totalDerivado
    const consumidoProjetado = consumidoEmitido + valorTotal
    return avaliarConsumo(total, consumidoProjetado, { controlado: total > 0 })
  }, [controleConsumo, modoValor, itensServico, itens, valorGlobal, mesesContrato, valorTotalContrato, consumidoEmitido, valorTotal])

  async function salvar(status: "rascunho" | "emitido") {
    if (clienteIds.length === 0 || !competencia || !numero) {
      alert("Selecione o municipio, ao menos um cliente, a competencia e o numero.")
      return
    }
    setSaving(true)
    try {
      const payload = {
        modelo_id: modeloId ? Number(modeloId) : null,
        cliente_ids: clienteIds,
        cliente_id: clienteIds[0],
        municipio: municipio || null,
        numero: Number(numero),
        numero_texto: String(numero).padStart(3, "0"),
        competencia,
        exercicio: Number(competencia.slice(0, 4)),
        sigla_orgao: siglaOrgao || null,
        numero_contrato_texto: numeroContrato || null,
        destinatario_nome: gestorNome || null,
        destinatario_cargo: gestorCargo || null,
        itens,
        itens_servico: itensServico,
        modo_valor: modoValor,
        valor_global: modoValor === "global" ? Number(valorGlobal) || 0 : null,
        texto: texto || null,
        observacoes: observacoes || null,
        modalidade_remoto: remoto,
        modalidade_presencial: presencial,
        origem: visitasIds.length > 0 ? "consolidado" : "padrao",
        visitas_ids: visitasIds,
        imagens,
        anexos_pdf: anexosPdf,
        status,
      }
      const url = editando
        ? `/api/apuracao/relatorios/${relatorio!.id}`
        : "/api/apuracao/relatorios"
      const res = await fetch(url, {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Falha ao salvar")
      router.push("/dashboard/relatorios/apuracao")
      router.refresh()
    } catch (e) {
      console.error(e)
      alert("Erro ao salvar o relatorio.")
    } finally {
      setSaving(false)
    }
  }

  const anos = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i)
  const [compAno, compMes] = competencia.split("-")

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <FileText className="h-6 w-6 text-primary" />
          {editando ? "Editar apuracao mensal" : "Nova apuracao mensal"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Relatorio Mensal de Prestacao de Servicos (RMPS) por contrato e competencia.
        </p>
      </div>

      <div className="space-y-6">
        {/* Selecao base */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Identificacao</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Municipio e clientes atendidos</Label>
              <MunicipioClientesSelect
                clientes={clientesArr}
                value={clienteIds}
                municipio={municipio}
                onChange={(ids, m) => {
                  setClienteIds(ids)
                  setMunicipio(m)
                }}
                disabled={editando}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Modelo (contrato)</Label>
              <Select value={modeloId} onValueChange={onSelecionarModelo} disabled={!municipio}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o modelo/contrato" />
                </SelectTrigger>
                <SelectContent>
                  {modelosArr.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Competencia</Label>
              <div className="flex gap-2">
                <Select
                  value={compMes}
                  onValueChange={(m) => setCompetencia(`${compAno}-${m}`)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES_PT.map((mes, i) => (
                      <SelectItem key={mes} value={String(i + 1).padStart(2, "0")}>
                        {mes}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={compAno}
                  onValueChange={(a) => setCompetencia(`${a}-${compMes}`)}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map((a) => (
                      <SelectItem key={a} value={String(a)}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Numero do relatorio</Label>
              <Input
                type="number"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Auto"
              />
              {numeroDuplicado.duplicado && (
                <p className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Numero ja usado
                  {numeroDuplicado.usos[0]
                    ? ` em ${competenciaLabel(numeroDuplicado.usos[0].competencia)}`
                    : ""}
                  . Voce pode manter, mas revise.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Aglutinacao: visitas da competencia */}
        {clienteIds.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4" />
                Relatorios de visita em {competenciaLabel(competencia)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {visitas.length === 0 ? (
                <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                  Nenhum relatorio de visita nesta competencia. Sera gerado um{" "}
                  <strong>relatorio padrao</strong> com o texto do modelo.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-emerald-600">
                      {visitasCompativeis.length} de {visitas.length} compativeis
                    </span>{" "}
                    com os modulos selecionados. Marque para aglutinar e anexar o PDF.
                  </p>
                  {visitas.map((v: any) => (
                    <label
                      key={v.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border p-2.5 text-sm ${
                        visitasIds.includes(v.id)
                          ? "border-primary bg-primary/5"
                          : v.casa_modulo
                            ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-500/30"
                            : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={visitasIds.includes(v.id)}
                        onChange={() => toggleVisita(v)}
                      />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{v.tema || v.tipo_servico || "Visita"}</span>
                          {clienteIds.length > 1 && v.cliente_nome && (
                            <Badge variant="outline" className="text-[10px]">
                              {v.cliente_nome}
                            </Badge>
                          )}
                          {v.casa_modulo && (
                            <Badge className="border-transparent bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
                              modulo compativel
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {v.data_relatorio || v.data_visita} · {v.numero_autenticacao}
                          {v.modulos?.length ? ` · ${v.modulos.join(", ")}` : ""}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dados do contrato / gestor */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados do contrato</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Sigla / Orgao</Label>
              <Input value={siglaOrgao} onChange={(e) => setSiglaOrgao(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Nº do contrato</Label>
              <Input value={numeroContrato} onChange={(e) => setNumeroContrato(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Gestor do contrato</Label>
              <Input value={gestorNome} onChange={(e) => setGestorNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo do gestor</Label>
              <Input value={gestorCargo} onChange={(e) => setGestorCargo(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Modulos e valores */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Modulos aferidos e valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5 rounded-lg border p-3">
              {MODULOS_SISTEMAS.map((mod) => {
                const ativo = itens.some((i) => i.nome === mod)
                return (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => toggleItem(mod)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      ativo
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {mod}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-4">
              <div className="space-y-1.5">
                <Label>Modo de valor</Label>
                <Select value={modoValor} onValueChange={(v: any) => setModoValor(v)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Valor global</SelectItem>
                    <SelectItem value="por_modulo">Valor por modulo</SelectItem>
                    <SelectItem value="por_item">Valor por item de servico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {modoValor === "global" && (
                <div className="space-y-1.5">
                  <Label>Valor global (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-40"
                    value={valorGlobal}
                    onChange={(e) => setValorGlobal(e.target.value)}
                  />
                </div>
              )}
              <div className="ml-auto text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold text-foreground">{formatBRL(valorTotal)}</p>
              </div>
            </div>

            {/* Alerta de 80% do contrato — vale para os tres modos de valor (so na tela) */}
            {controleConsumo && resumoContrato?.controlado && resumoContrato.total > 0 && resumoContrato.emAlerta && (
              <div
                className={`space-y-2 rounded-lg border p-3 ${
                  resumoContrato.esgotado
                    ? "border-destructive/40 bg-destructive/10"
                    : "border-amber-500/50 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/30"
                }`}
              >
                <p
                  className={`flex items-center gap-1.5 text-sm font-medium ${
                    resumoContrato.esgotado ? "text-destructive" : "text-amber-800 dark:text-amber-300"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                  {resumoContrato.esgotado
                    ? "Contrato esgotado com esta emissao"
                    : "Contrato acima de 80% do valor total"}
                </p>
                <p className={`text-xs ${resumoContrato.esgotado ? "text-destructive" : "text-amber-900"}`}>
                  Com esta apuracao, o consumo projetado chega a{" "}
                  <strong>{formatPercentual(resumoContrato.percentual)}</strong> —{" "}
                  {formatBRL(resumoContrato.consumido)} de {formatBRL(resumoContrato.total)}.
                </p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/60">
                  <div
                    className={`h-full rounded-full ${resumoContrato.esgotado ? "bg-destructive" : "bg-amber-500"}`}
                    style={{ width: `${Math.min(100, resumoContrato.percentual * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {modoValor === "por_modulo" && itens.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                {itens.map((i) => (
                  <div key={i.nome} className="flex items-center gap-2">
                    <span className="flex-1 text-sm">{i.nome}</span>
                    <Input
                      type="number"
                      step="0.01"
                      className="w-32"
                      value={i.valor ?? 0}
                      onChange={(e) => setItemValor(i.nome, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}

            {modoValor === "por_item" && (
              <div className="space-y-3">
                {controleConsumo && alertasConsumo.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-950/30">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4" />
                      Atencao ao saldo do contrato nesta emissao
                    </p>
                    {alertasConsumo.map(({ item, s }) => (
                      <div
                        key={item.descricao}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200"
                      >
                        <span className="flex-1">
                          <strong>{item.descricao || "Item"}</strong>{" "}
                          {s.esgotado ? (
                            <>saldo esgotado (disponivel {s.disponivel.toLocaleString("pt-BR")} {item.unidade}).</>
                          ) : (
                            <>
                              so restam {s.disponivel.toLocaleString("pt-BR")} {item.unidade} de{" "}
                              {s.mensalCheio.toLocaleString("pt-BR")} do mes cheio.
                            </>
                          )}
                        </span>
                        {!s.esgotado && s.deveFracionar && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 border-amber-500/40 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40"
                            onClick={() => aplicarFracao(item.descricao, s.quantidadeSugerida)}
                          >
                            Aplicar fracao ({s.quantidadeSugerida.toLocaleString("pt-BR")})
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <ItensServicoEditor
                  itens={itensServico}
                  onChange={setItensServico}
                  mesesContrato={mesesContrato}
                  controleConsumo={controleConsumo}
                  previewIndice={emitidosCount}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Texto e observacoes */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Texto do relatorio</CardTitle>
              <Button size="sm" variant="ghost" onClick={gerarTexto}>
                <Wand2 className="mr-1 h-4 w-4" />
                Gerar sugestao
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} />
            <div className="space-y-1.5">
              <Label>Observacoes</Label>
              <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={remoto} onChange={(e) => setRemoto(e.target.checked)} />
                Atendimento remoto
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={presencial}
                  onChange={(e) => setPresencial(e.target.checked)}
                />
                Atendimento presencial
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Imagens e anexos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Imagens e anexos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Imagens (evidencias)</Label>
                <label className="flex cursor-pointer items-center gap-1 text-sm text-primary">
                  <Upload className="h-4 w-4" />
                  Adicionar
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => onAddImagens(e.target.files)}
                  />
                </label>
              </div>
              {imagens.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {imagens.map((img, idx) => (
                    <div key={idx} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fileUrl(img.url) || "/placeholder.svg"}
                        alt={img.legenda || `Evidencia ${idx + 1}`}
                        className="h-24 w-full rounded-md border object-cover"
                      />
                      <button
                        onClick={() => setImagens((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-destructive shadow"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Anexos PDF adicionais</Label>
                <label className="flex cursor-pointer items-center gap-1 text-sm text-primary">
                  <Paperclip className="h-4 w-4" />
                  Adicionar
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => onAddAnexosPdf(e.target.files)}
                  />
                </label>
              </div>
              {anexosPdf.length > 0 && (
                <div className="space-y-1">
                  {anexosPdf.map((a, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.nome}</span>
                      </span>
                      <button
                        onClick={() => setAnexosPdf((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {uploading && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando arquivos...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Acoes */}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => router.back()} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={() => salvar("rascunho")} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Salvar rascunho
          </Button>
          <Button onClick={() => salvar("emitido")} disabled={saving}>
            <Save className="mr-1 h-4 w-4" />
            Emitir
          </Button>
        </div>
      </div>
    </div>
  )
}
