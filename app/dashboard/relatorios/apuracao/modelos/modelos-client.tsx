"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { MunicipioClientesSelect } from "@/components/municipio-clientes-select"
import { ItensServicoEditor } from "@/components/itens-servico-editor"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Plus, Pencil, Trash2, Layers, Loader2, FileCog, CalendarClock, AlertTriangle } from "lucide-react"
import {
  MODULOS_SISTEMAS,
  formatBRL,
  textoPadraoSugerido,
  valorTotalAnual,
  valorTotalAnualItem,
  totalAnualItensServico,
  totalItensServico,
  saldoContrato,
  valorConsumidoItens,
  quantidadeConsumidaModulo,
  quantidadeDisponivelModulo,
  valorConsumidoModulo,
  valorConsumidoModulos,
  isCompetenciaValida,
  resumoConsumoContrato,
  avaliarConsumo,
  formatPercentual,
  normalizarItensServico,
  type ApuracaoModelo,
  type ApuracaoItem,
  type ApuracaoItemServico,
  type ApuracaoModoValor,
} from "@/lib/apuracao"
import { toast } from "sonner"

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || "Erro ao carregar dados")
  return data
}

const emptyForm = {
  municipio: "",
  nome: "",
  sigla_orgao: "",
  numero_contrato_texto: "",
  destinatario_nome: "",
  destinatario_cargo: "",
  modo_valor: "global" as ApuracaoModoValor,
  valor_global: "",
  // Controle de contrato (consumo é rastreado por item, na tabela)
  meses_contrato: "12",
  valor_total_contrato: "",
  controle_consumo: false,
  // Sementes de consumo inicial (modo 'global'): meses ja consumidos antes do sistema.
  meses_consumidos_inicial: "",
  // Competencia (YYYY-MM) a partir da qual a contagem automatica reinicia (aditivo).
  reinicio_competencia: "",
  // Instante exato do reinicio (botao "Reiniciar agora"); ISO string. Tem prioridade.
  reinicio_em: "",
  texto_padrao: "",
  observacoes_padrao: "",
  modalidade_remoto: true,
  modalidade_presencial: false,
  ultimo_numero: "0",
  emissao_automatica: false,
}

export function ModelosClient() {
  const { data: modelos, mutate, isLoading } = useSWR<ApuracaoModelo[]>(
    "/api/apuracao/modelos",
    fetcher,
  )
  const { data: clientes } = useSWR<any[]>("/api/clientes", fetcher)

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [clienteIds, setClienteIds] = useState<number[]>([])
  const [itens, setItens] = useState<ApuracaoItem[]>([])
  const [itensServico, setItensServico] = useState<ApuracaoItemServico[]>([])
  // Consumo ja emitido (R$) do modelo em edicao — base dos modos 'global'/'por_modulo'.
  const [consumidoEmitido, setConsumidoEmitido] = useState(0)
  // Nº de apuracoes ja emitidas — base da quantidade consumida no modo 'global' (1 emissao = 1 mes).
  const [emitidosCount, setEmitidosCount] = useState(0)
  // Historico anterior ao reinicio (quando ha aditivo). Exibido lado a lado com o ativo.
  const [historico, setHistorico] = useState<ApuracaoModelo["historico"]>(undefined)
  const [saving, setSaving] = useState(false)
  const [excluirId, setExcluirId] = useState<number | null>(null)

  const clientesArr = Array.isArray(clientes) ? clientes : []
  const modelosArr = Array.isArray(modelos) ? modelos : []

  function abrirNovo() {
    setEditId(null)
    setForm({ ...emptyForm })
    setClienteIds([])
    setItens([])
    setItensServico([])
    setConsumidoEmitido(0)
    setEmitidosCount(0)
    setHistorico(undefined)
    setOpen(true)
  }

  function abrirEdicao(m: ApuracaoModelo) {
    setEditId(m.id)
    const ids =
      Array.isArray(m.cliente_ids) && m.cliente_ids.length > 0 ? m.cliente_ids : [m.cliente_id]
    setClienteIds(ids)
    setForm({
      municipio: m.municipio || "",
      nome: m.nome || "",
      sigla_orgao: m.sigla_orgao || "",
      numero_contrato_texto: m.numero_contrato_texto || "",
      destinatario_nome: m.destinatario_nome || "",
      destinatario_cargo: m.destinatario_cargo || "",
      modo_valor: m.modo_valor || "global",
      valor_global: m.valor_global != null ? String(m.valor_global) : "",
      meses_contrato: m.meses_contrato != null ? String(m.meses_contrato) : "12",
      valor_total_contrato: m.valor_total_contrato != null ? String(m.valor_total_contrato) : "",
      controle_consumo: m.controle_consumo ?? false,
      meses_consumidos_inicial:
        m.meses_consumidos_inicial != null ? String(m.meses_consumidos_inicial) : "",
      reinicio_competencia: m.reinicio_competencia || "",
      reinicio_em: m.reinicio_em || "",
      texto_padrao: m.texto_padrao || "",
      observacoes_padrao: m.observacoes_padrao || "",
      modalidade_remoto: m.modalidade_remoto,
      modalidade_presencial: m.modalidade_presencial,
      ultimo_numero: String(m.ultimo_numero ?? 0),
      emissao_automatica: m.emissao_automatica ?? false,
    })
    setItens(Array.isArray(m.itens) ? m.itens : [])
    setItensServico(normalizarItensServico(m.itens_servico))
    setConsumidoEmitido(Number(m.consumido_emitido) || 0)
    setEmitidosCount(Number(m.emitidos_count) || 0)
    setHistorico(m.historico)
    setOpen(true)
  }

  function toggleItem(nome: string) {
    setItens((prev) =>
      prev.some((i) => i.nome === nome)
        ? prev.filter((i) => i.nome !== nome)
        : [...prev, { nome, valor: 0 }],
    )
  }

  function setItemValor(nome: string, valor: string) {
    setItens((prev) =>
      prev.map((i) => (i.nome === nome ? { ...i, valor: Number(valor) || 0 } : i)),
    )
  }

  function setItemCampo(nome: string, patch: Partial<ApuracaoItem>) {
    setItens((prev) => prev.map((i) => (i.nome === nome ? { ...i, ...patch } : i)))
  }

  function preencherTextoPadrao() {
    const nomes = clienteIds
      .map((id) => clientesArr.find((c) => c.id === id)?.nome_fantasia)
      .filter(Boolean) as string[]
    const nomeCliente = nomes.length ? nomes.join(", ") : form.municipio || "cliente"
    setForm((f) => ({ ...f, texto_padrao: textoPadraoSugerido(nomeCliente, itens.map((i) => i.nome)) }))
  }

  async function salvar() {
    if (clienteIds.length === 0 || !form.nome) {
      alert("Selecione o municipio, ao menos um cliente e informe o nome do modelo.")
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        cliente_ids: clienteIds,
        cliente_id: clienteIds[0],
        municipio: form.municipio || null,
        valor_global: form.valor_global ? Number(form.valor_global) : null,
        meses_contrato: Number(form.meses_contrato) || 12,
        valor_total_contrato: form.valor_total_contrato ? Number(form.valor_total_contrato) : null,
        controle_consumo: form.controle_consumo,
        meses_consumidos_inicial: form.meses_consumidos_inicial
          ? Number(form.meses_consumidos_inicial)
          : null,
        reinicio_competencia: form.reinicio_competencia || null,
        reinicio_em: form.reinicio_em || null,
        ultimo_numero: Number(form.ultimo_numero) || 0,
        itens,
        itens_servico: itensServico,
      }
      const url = editId ? `/api/apuracao/modelos/${editId}` : "/api/apuracao/modelos"
      const method = editId ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Falha ao salvar")
      setOpen(false)
      mutate()
    } catch (e) {
      console.error(e)
      alert("Erro ao salvar o modelo.")
    } finally {
      setSaving(false)
    }
  }

  async function excluir() {
    if (!excluirId) return
    const id = excluirId
    setExcluirId(null)
    const prev = modelos ?? []
    mutate(
      prev.filter((m: ApuracaoModelo) => m.id !== id),
      false
    )

    try {
      const res = await fetch(`/api/apuracao/modelos/${id}`, { method: "DELETE" })
      if (!res.ok) {
        mutate(prev, false)
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Erro ao excluir modelo")
      }
      toast.success("Modelo excluído com sucesso")
      await mutate()
    } catch (e) {
      mutate(prev, false)
      toast.error(e instanceof Error ? e.message : "Erro ao excluir modelo")
    }
  }

  // Liga/desliga a emissao automatica direto do card (atualizacao otimista)
  async function toggleEmissaoAutomatica(m: ApuracaoModelo, valor: boolean) {
    mutate(
      (atual) =>
        (atual || []).map((x) => (x.id === m.id ? { ...x, emissao_automatica: valor } : x)),
      { revalidate: false },
    )
    try {
      await fetch(`/api/apuracao/modelos/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emissao_automatica: valor }),
      })
    } catch (e) {
      console.error(e)
    } finally {
      mutate()
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FileCog className="h-6 w-6 text-primary" />
            Modelos de Apuracao
          </h1>
          <p className="text-sm text-muted-foreground">
            Padroes semi-automaticos por contrato: gestor, modulos, valores, numeracao e texto padrao.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="mr-1 h-4 w-4" />
          Novo modelo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
        </div>
      ) : modelosArr.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Layers className="mx-auto mb-3 h-10 w-10 opacity-40" />
            Nenhum modelo cadastrado. Crie um modelo por contrato (ex.: Paulista - Contabilidade).
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {modelosArr.map((m) => (
            <Card key={m.id} className={m.ativo ? "" : "opacity-60"}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{m.nome}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {m.municipio ? `${m.municipio} — ` : ""}
                      {(() => {
                        const ids =
                          Array.isArray(m.cliente_ids) && m.cliente_ids.length > 0
                            ? m.cliente_ids
                            : [m.cliente_id]
                        const nomes = ids
                          .map((id) => clientesArr.find((c) => c.id === id)?.nome_fantasia)
                          .filter(Boolean)
                        return nomes.length ? nomes.join(", ") : m.cliente_nome
                      })()}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => abrirEdicao(m)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setExcluirId(m.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-1">
                  {(m.itens || []).map((i) => (
                    <Badge key={i.nome} variant="secondary" className="font-normal">
                      {i.nome}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                  <span>
                    Valor:{" "}
                    <strong className="text-foreground">
                      {m.modo_valor === "global"
                        ? formatBRL(m.valor_global)
                        : m.modo_valor === "por_item"
                          ? `${(m.itens_servico || []).length} itens`
                          : "por modulo"}
                    </strong>
                  </span>
                  <span>
                    Ultimo nº: <strong className="text-foreground">{m.ultimo_numero}</strong>
                  </span>
                  {m.numero_contrato_texto && <span>Contrato: {m.numero_contrato_texto}</span>}
                </div>
                {m.destinatario_nome && (
                  <p className="text-muted-foreground">
                    Gestor: <span className="text-foreground">{m.destinatario_nome}</span>
                    {m.destinatario_cargo ? ` — ${m.destinatario_cargo}` : ""}
                  </p>
                )}
                <div
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                    m.emissao_automatica
                      ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-500/30"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <CalendarClock
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        m.emissao_automatica ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                      }`}
                    />
                    <div className="leading-tight">
                      <p
                        className={`text-sm font-medium ${
                          m.emissao_automatica ? "text-emerald-700" : "text-foreground"
                        }`}
                      >
                        Emissao automatica
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.emissao_automatica
                          ? "Gera no 1º dia util, competencia anterior."
                          : "Desligada. Emissao apenas manual."}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={!!m.emissao_automatica}
                    onCheckedChange={(v) => toggleEmissaoAutomatica(m, v)}
                    aria-label="Alternar emissao automatica"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de criacao/edicao */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar modelo" : "Novo modelo de apuracao"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Municipio e clientes atendidos</Label>
                <MunicipioClientesSelect
                  clientes={clientesArr}
                  value={clienteIds}
                  municipio={form.municipio}
                  onChange={(ids, municipio) => {
                    setClienteIds(ids)
                    setForm((f) => ({ ...f, municipio }))
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nome do modelo</Label>
                <Input
                  placeholder="Ex.: Paulista - Contabilidade"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sigla / Orgao</Label>
                <Input
                  placeholder="Ex.: PMP - Secretaria de Financas"
                  value={form.sigla_orgao}
                  onChange={(e) => setForm((f) => ({ ...f, sigla_orgao: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nº do contrato</Label>
                <Input
                  placeholder="Ex.: 023/2024"
                  value={form.numero_contrato_texto}
                  onChange={(e) => setForm((f) => ({ ...f, numero_contrato_texto: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Gestor do contrato</Label>
                <Input
                  placeholder="Nome do gestor"
                  value={form.destinatario_nome}
                  onChange={(e) => setForm((f) => ({ ...f, destinatario_nome: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cargo do gestor</Label>
                <Input
                  placeholder="Ex.: Secretario de Financas"
                  value={form.destinatario_cargo}
                  onChange={(e) => setForm((f) => ({ ...f, destinatario_cargo: e.target.value }))}
                />
              </div>
            </div>

            {/* Modulos aferidos */}
            <div className="space-y-2">
              <Label>Modulos aferidos</Label>
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
            </div>

            {/* Modo de valor */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Modo de valor</Label>
                <Select
                  value={form.modo_valor}
                  onValueChange={(v: ApuracaoModoValor) =>
                    setForm((f) => ({ ...f, modo_valor: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Valor global</SelectItem>
                    <SelectItem value="por_modulo">Valor por modulo</SelectItem>
                    <SelectItem value="por_item">Valor por item de servico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.modo_valor === "global" ? (
                <div className="space-y-1.5">
                  <Label>Valor mensal (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={form.valor_global}
                    onChange={(e) => setForm((f) => ({ ...f, valor_global: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Numeracao inicial (ultimo nº)</Label>
                  <Input
                    type="number"
                    value={form.ultimo_numero}
                    onChange={(e) => setForm((f) => ({ ...f, ultimo_numero: e.target.value }))}
                  />
                </div>
              )}
            </div>

            {/* Bloco de Contrato (comum aos tres modos) */}
            {(() => {
              const meses = Number(form.meses_contrato) || 0
              // Valor total do contrato (auto):
              // - por item/módulo: Σ (valor unitário × quantidade em contrato)
              // - global: valor mensal × meses (não há quantidades por item)
              const totalAuto =
                form.modo_valor === "por_item"
                  ? totalAnualItensServico(itensServico)
                  : form.modo_valor === "por_modulo"
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
                    : valorTotalAnual(Number(form.valor_global) || 0, meses)
              const totalContrato = form.valor_total_contrato ? Number(form.valor_total_contrato) : totalAuto
              // Quando ha reinicio ativo, a semente manual (consumo pre-sistema) vira historico
              // e o consumo ATIVO passa a contar apenas o automatico pos-corte.
              const reinicioAtivo =
                form.controle_consumo &&
                (!!form.reinicio_em || isCompetenciaValida(form.reinicio_competencia))
              // Consumo (R$) — cada modo com sua mecânica, sempre incluindo o consumo automático
              // gerado pelas apurações já emitidas (após o corte, quando ha reinicio):
              // - por_item: Σ(qtd consumida × valor unitário) por item.
              // - por_modulo: Σ(meses consumidos × valor mensal) por módulo.
              // - global: (meses consumidos inicial + nº de emissões) × valor mensal.
              const mesesConsumidosGlobal =
                (reinicioAtivo ? 0 : Number(form.meses_consumidos_inicial) || 0) + emitidosCount
              const consumidoValor =
                form.modo_valor === "por_item"
                  ? valorConsumidoItens(itensServico)
                  : form.modo_valor === "por_modulo"
                    ? valorConsumidoModulos(itens, reinicioAtivo)
                    : mesesConsumidosGlobal * (Number(form.valor_global) || 0)
              const saldo = saldoContrato(totalContrato, consumidoValor, 0)
              const resumo =
                form.modo_valor === "por_item"
                  ? resumoConsumoContrato(itensServico, {
                      valorTotalContrato: form.valor_total_contrato ? Number(form.valor_total_contrato) : null,
                    })
                  : avaliarConsumo(totalContrato, consumidoValor, { controlado: totalContrato > 0 })
              return (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Contrato</Label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Meses de contrato</Label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={form.meses_contrato}
                        onChange={(e) => setForm((f) => ({ ...f, meses_contrato: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Valor total do contrato (R$)
                      </Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className={form.valor_total_contrato ? "" : "text-muted-foreground"}
                          title={
                            form.valor_total_contrato
                              ? "Valor manual (override)"
                              : `Automático = mensal × ${meses} meses`
                          }
                          value={form.valor_total_contrato || totalAuto.toFixed(2)}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, valor_total_contrato: e.target.value }))
                          }
                        />
                        {form.valor_total_contrato && (
                          <button
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, valor_total_contrato: "" }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                            title="Voltar ao cálculo automático"
                          >
                            auto
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={form.controle_consumo}
                          onCheckedChange={(v) =>
                            setForm((f) => ({ ...f, controle_consumo: v }))
                          }
                        />
                        Controlar consumo
                      </label>
                    </div>
                  </div>

                  {form.controle_consumo && (
                    <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {form.modo_valor === "por_item"
                          ? "Informe o consumo já realizado por item (em quantidade) na coluna “Consumida” da tabela abaixo. O saldo é calculado automaticamente."
                          : "O consumo é somado automaticamente a partir das apurações já emitidas para este contrato. O saldo é calculado automaticamente."}
                      </p>
                      <div className="flex items-center gap-6 sm:justify-end">
                        <div className="flex flex-col sm:items-end">
                          <span className="text-xs text-muted-foreground">Consumido até o momento (R$)</span>
                          <span className="text-base font-semibold text-foreground">
                            {formatBRL(consumidoValor)}
                          </span>
                        </div>
                        <div className="flex flex-col sm:items-end">
                          <span className="text-xs text-muted-foreground">Saldo previsto (R$)</span>
                          <span
                            className={`text-base font-bold ${saldo < 0 ? "text-destructive" : "text-foreground"}`}
                          >
                            {formatBRL(saldo)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Reinicio da contagem: por instante ("Reiniciar agora") ou por competencia
                      (aditivo que prorroga o prazo). Os dois criterios sao mutuamente exclusivos. */}
                  {form.controle_consumo && (
                    <div className="space-y-2 rounded-md border border-dashed p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div className="space-y-1">
                          <Label className="text-sm">Reiniciar contagem do consumo</Label>
                          <p className="text-xs text-muted-foreground">
                            Use &ldquo;Reiniciar agora&rdquo; para zerar neste instante, ou informe a
                            competência do aditivo. As apurações anteriores ao reinício deixam de
                            contar no consumo ativo e passam a compor o histórico.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="month"
                            className="w-40"
                            aria-label="Competência do aditivo"
                            value={form.reinicio_competencia}
                            onChange={(e) =>
                              // Corte por mês (aditivo) — limpa o corte por instante.
                              setForm((f) => ({
                                ...f,
                                reinicio_competencia: e.target.value,
                                reinicio_em: "",
                              }))
                            }
                          />
                          {/* Reinicia de fato num clique: grava o INSTANTE atual. Só emissões
                              criadas depois deste momento contam — distingue novas de antigas
                              dentro do mesmo mês. */}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                reinicio_em: new Date().toISOString(),
                                reinicio_competencia: "",
                              }))
                            }
                          >
                            Reiniciar agora
                          </Button>
                          {(form.reinicio_competencia || form.reinicio_em) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setForm((f) => ({ ...f, reinicio_competencia: "", reinicio_em: "" }))
                              }
                            >
                              Limpar
                            </Button>
                          )}
                        </div>
                      </div>
                      {(!!form.reinicio_em || isCompetenciaValida(form.reinicio_competencia)) &&
                        (() => {
                          // O `historico` do servidor só reflete o corte já salvo. Ao reiniciar
                          // "agora" (corte recém-aplicado), o backend ainda não recalculou — então
                          // mostramos o que estava ativo (emissões + semente manual) como prévia.
                          const apuracoes = historico?.emitidos_count ?? emitidosCount
                          const consumido = historico?.consumido_emitido ?? consumidoEmitido
                          const salvoNoServidor = !!historico
                          const rotuloCorte = form.reinicio_em
                            ? `Reiniciado em ${new Date(form.reinicio_em).toLocaleString("pt-BR")}`
                            : `Reinício a partir de ${form.reinicio_competencia}`
                          return (
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-2 text-xs">
                              <span className="font-medium text-muted-foreground">{rotuloCorte}</span>
                              <span className="text-muted-foreground">
                                Histórico: {apuracoes} {apuracoes === 1 ? "apuração" : "apurações"}
                              </span>
                              <span className="text-muted-foreground">
                                Consumido: {formatBRL(consumido)}
                              </span>
                              {!salvoNoServidor && (
                                <span className="text-muted-foreground italic">
                                  (salve para aplicar o reinício)
                                </span>
                              )}
                            </div>
                          )
                        })()}
                    </div>
                  )}

                  {/* Barra de consumo + alerta de 80% do contrato */}
                  {form.controle_consumo && resumo?.controlado && resumo.total > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Consumo do contrato</span>
                        <span
                          className={`font-semibold ${
                            resumo.esgotado
                              ? "text-destructive"
                              : resumo.emAlerta
                                ? "text-amber-600"
                                : "text-foreground"
                          }`}
                        >
                          {formatPercentual(resumo.percentual)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${
                            resumo.esgotado ? "bg-destructive" : resumo.emAlerta ? "bg-amber-500" : "bg-primary"
                          }`}
                          style={{ width: `${Math.min(100, resumo.percentual * 100)}%` }}
                        />
                      </div>
                      {resumo.emAlerta && (
                        <div
                          className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
                            resumo.esgotado
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : "border-amber-500/40 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300"
                          }`}
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            {resumo.esgotado
                              ? "Contrato esgotado: 100% do valor total já foi consumido."
                              : `Atenção: o contrato atingiu ${formatPercentual(resumo.percentual)} do valor total (limite de alerta em 80%).`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {form.modo_valor === "por_modulo" && itens.length > 0 && (() => {
              // Colunas de consumo (Consumida, Autom., Disponível, Consumido R$) só quando o
              // controle está ligado. Cada emissão consome 1 "mês" do módulo (unidade = mês).
              const controle = form.controle_consumo
              // Reinicio ativo: a semente manual vira histórico e o ativo conta só o automático.
              // A coluna extra "Anterior" aparece sempre que houver reinício válido.
              const reinicioAtivo =
                controle &&
                (!!form.reinicio_em || isCompetenciaValida(form.reinicio_competencia))
              const temHist = reinicioAtivo
              const GRID = controle
                ? temHist
                  ? "sm:grid-cols-[1fr_120px_104px_130px_84px_84px_84px_92px_116px]"
                  : "sm:grid-cols-[1fr_120px_104px_130px_92px_84px_92px_116px]"
                : "sm:grid-cols-[1fr_120px_110px_130px]"
              const MIN_W = controle ? (temHist ? "sm:min-w-[1080px]" : "sm:min-w-[1000px]") : ""
              const totalConsumidoModulos = valorConsumidoModulos(itens, reinicioAtivo)
              return (
              <div className="space-y-2 rounded-lg border p-3">
                <Label className="text-xs text-muted-foreground">Valor por modulo</Label>
                <div className={controle ? "overflow-x-auto" : ""}>
                <div className={MIN_W}>
                <div className={`hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid ${GRID}`}>
                  <span>Módulo</span>
                  <span className="text-right">Vlr. mensal (R$)</span>
                  <span className="text-center">Qtd. contrato</span>
                  <span className="text-right">Vlr. total anual (R$)</span>
                  {controle && (
                    <>
                      <span className="text-center">Consumida Manual</span>
                      {temHist && (
                        <span className="text-center" title="Meses consumidos antes do reinício (aditivo)">
                          Anterior
                        </span>
                      )}
                      <span className="text-center">Autom.</span>
                      <span className="text-center">Disponível</span>
                      <span className="text-right">Consumido (R$)</span>
                    </>
                  )}
                </div>
                {itens.map((i) => {
                  const override = i.valor_total != null
                  // Total do módulo = valor mensal (unitário) × quantidade em contrato.
                  const anualValor = valorTotalAnualItem({
                    valor: Number(i.valor) || 0,
                    quantidade: 0,
                    quantidade_contrato: i.quantidade_contrato,
                    valor_total: i.valor_total,
                  })
                  const disponivel = quantidadeDisponivelModulo(i, reinicioAtivo)
                  const negativo = disponivel != null && disponivel < 0
                  // "Anterior" = emissões antes do corte + semente manual (consumo pré-sistema).
                  const anteriorModulo =
                    (Number(historico?.consumo_modulos?.[i.nome.trim().toLowerCase()]) || 0) +
                    (Number(i.quantidade_consumida_inicial) || 0)
                  return (
                    <div
                      key={i.nome}
                      className={`grid grid-cols-1 gap-2 sm:items-center ${GRID}`}
                    >
                      <span className="text-sm">{i.nome}</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="sm:text-right"
                        aria-label={`Valor mensal de ${i.nome}`}
                        value={i.valor ?? 0}
                        onChange={(e) => setItemValor(i.nome, e.target.value)}
                      />
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        className="sm:text-center"
                        placeholder="—"
                        aria-label={`Quantidade prevista em contrato de ${i.nome}`}
                        value={i.quantidade_contrato ?? ""}
                        onChange={(e) =>
                          setItemCampo(i.nome, {
                            quantidade_contrato:
                              e.target.value === "" ? undefined : Number(e.target.value) || 0,
                          })
                        }
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className={`sm:text-right ${override ? "" : "text-muted-foreground"}`}
                        title={override ? "Valor manual (override)" : "Automático = valor mensal × quantidade em contrato"}
                        aria-label={`Valor total anual de ${i.nome}`}
                        value={anualValor.toFixed(2)}
                        onChange={(e) =>
                          setItemCampo(i.nome, { valor_total: Number(e.target.value) || 0 })
                        }
                      />
                      {controle && (
                        <>
                          {/* Consumida — semente manual (em meses); pode ser fracionada.
                              Com reinício ativo, o consumo pré-sistema vira histórico: o campo
                              some do ativo (mostra 0, desabilitado) e aparece em "Anterior". */}
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="sm:text-center"
                            placeholder="0"
                            disabled={reinicioAtivo}
                            aria-label={`Quantidade consumida de ${i.nome}`}
                            title={
                              reinicioAtivo
                                ? "Zerado pelo reinício — o consumo anterior foi movido para “Anterior”"
                                : "Consumo inicial (meses) já realizado antes do sistema"
                            }
                            value={reinicioAtivo ? 0 : i.quantidade_consumida_inicial ?? ""}
                            onChange={(e) =>
                              setItemCampo(i.nome, {
                                quantidade_consumida_inicial:
                                  e.target.value === "" ? undefined : Number(e.target.value) || 0,
                              })
                            }
                          />
                          {/* Anterior — consumo antes do reinício = emissões antigas + semente manual */}
                          {temHist && (
                            <Input
                              readOnly
                              tabIndex={-1}
                              className="sm:text-center bg-muted/30 text-muted-foreground italic"
                              aria-label={`Consumo anterior ao reinício de ${i.nome}`}
                              title="Consumo antes do reinício (aditivo) — apenas histórico"
                              value={anteriorModulo}
                            />
                          )}
                          {/* Automática — meses consumidos pelas apurações emitidas (somente leitura) */}
                          <Input
                            readOnly
                            tabIndex={-1}
                            className="sm:text-center bg-muted/50 text-muted-foreground"
                            aria-label={`Consumo automático de ${i.nome}`}
                            title="Gerado automaticamente pelas apurações emitidas a partir do reinício"
                            value={i.quantidade_consumida_auto ?? 0}
                          />
                          {/* Disponível — calculado */}
                          <Input
                            readOnly
                            tabIndex={-1}
                            className={`sm:text-center bg-muted/50 ${negativo ? "text-destructive font-medium" : "text-muted-foreground"}`}
                            aria-label={`Quantidade disponível de ${i.nome}`}
                            title="Prevista em contrato − consumida (manual + automática)"
                            value={disponivel == null ? "—" : disponivel.toFixed(2)}
                          />
                          {/* Consumido R$ — calculado (meses consumidos × valor mensal) */}
                          <Input
                            readOnly
                            tabIndex={-1}
                            className="sm:text-right bg-muted/50 text-muted-foreground"
                            aria-label={`Valor consumido de ${i.nome}`}
                            title="Consumido = meses consumidos × valor mensal"
                            value={valorConsumidoModulo(i).toFixed(2)}
                          />
                        </>
                      )}
                    </div>
                  )
                })}
                </div>
                </div>
                <div className="space-y-1 border-t pt-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">Totalização mensal</span>
                      <span className="text-xs text-muted-foreground">Soma dos valores mensais &middot; consta no relatório de apuração</span>
                    </div>
                    <span className="text-base font-bold text-foreground">
                      {formatBRL(itens.reduce((s, i) => s + (Number(i.valor) || 0), 0))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-medium text-muted-foreground">Valor global do contrato</span>
                      <span className="text-xs text-muted-foreground">Soma de (valor mensal &times; qtd. contrato) &middot; uso interno, não sai no relatório</span>
                    </div>
                    <span className="text-base font-semibold text-muted-foreground">
                      {formatBRL(
                        itens.reduce(
                          (s, i) =>
                            s +
                            valorTotalAnualItem({
                              valor: Number(i.valor) || 0,
                              quantidade: 0,
                              quantidade_contrato: i.quantidade_contrato,
                              valor_total: i.valor_total,
                            }),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                  {controle && (
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="font-medium text-muted-foreground">Consumido até o momento</span>
                        <span className="text-xs text-muted-foreground">Soma de (meses consumidos &times; valor mensal) de todos os módulos</span>
                      </div>
                      <span className="text-base font-semibold text-muted-foreground">{formatBRL(totalConsumidoModulos)}</span>
                    </div>
                  )}
                </div>
              </div>
              )
            })()}

            {form.modo_valor === "por_item" && (
              <ItensServicoEditor
                itens={itensServico}
                onChange={setItensServico}
                mesesContrato={Number(form.meses_contrato) || 12}
                controleConsumo={form.controle_consumo}
              />
            )}

            {form.modo_valor === "global" && form.controle_consumo && (() => {
              // Modo global = 1 "linha" (o próprio contrato). Unidade de consumo = mês:
              // cada apuração emitida consome 1 mês; a semente inicial cobre meses anteriores.
              const valorMensal = Number(form.valor_global) || 0
              const mesesContratoG = Number(form.meses_contrato) || 0
              const inicial = Number(form.meses_consumidos_inicial) || 0
              // Reinício ativo: a semente manual vira histórico e o ativo conta só o automático.
              const reinicioAtivoG =
                !!form.reinicio_em || isCompetenciaValida(form.reinicio_competencia)
              const consumidas = (reinicioAtivoG ? 0 : inicial) + emitidosCount
              const disponivel = mesesContratoG - consumidas
              const negativo = disponivel < 0
              // "Anterior" = emissões antes do corte (servidor) + semente manual (pré-sistema).
              const anteriorG = (Number(historico?.emitidos_count) || 0) + inicial
              // Coluna "Anterior" aparece sempre que houver reinício válido.
              const temHistG = reinicioAtivoG
              const GRID_G = temHistG
                ? "sm:grid-cols-[1fr_120px_104px_92px_84px_84px_92px_116px]"
                : "sm:grid-cols-[1fr_120px_104px_92px_84px_92px_116px]"
              return (
                <div className="space-y-2 rounded-lg border p-3">
                  <Label className="text-xs text-muted-foreground">Acompanhamento do contrato (por mês)</Label>
                  <div className="overflow-x-auto">
                    <div className={temHistG ? "sm:min-w-[900px]" : "sm:min-w-[820px]"}>
                      <div className={`hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid ${GRID_G}`}>
                        <span>Contrato</span>
                        <span className="text-right">Vlr. mensal (R$)</span>
                        <span className="text-center">Meses contrato</span>
                        <span className="text-center">Consumida Manual</span>
                        {temHistG && (
                          <span className="text-center" title="Meses consumidos antes do reinício (aditivo)">
                            Anterior
                          </span>
                        )}
                        <span className="text-center">Autom.</span>
                        <span className="text-center">Disponível</span>
                        <span className="text-right">Consumido (R$)</span>
                      </div>
                      <div className={`grid grid-cols-1 gap-2 sm:items-center ${GRID_G}`}>
                        <span className="text-sm">Valor global mensal</span>
                        <Input
                          readOnly
                          tabIndex={-1}
                          className="sm:text-right bg-muted/50 text-muted-foreground"
                          aria-label="Valor mensal do contrato"
                          title="Definido no campo “Valor mensal” acima"
                          value={valorMensal.toFixed(2)}
                        />
                        <Input
                          readOnly
                          tabIndex={-1}
                          className="sm:text-center bg-muted/50 text-muted-foreground"
                          aria-label="Meses de contrato"
                          title="Definido no campo “Meses de contrato” acima"
                          value={mesesContratoG || "—"}
                        />
                        {/* Consumida — semente manual (meses já consumidos antes do sistema).
                            Com reinício ativo, some do ativo (mostra 0, desabilitado) e aparece
                            em "Anterior". */}
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="sm:text-center"
                          placeholder="0"
                          disabled={reinicioAtivoG}
                          aria-label="Meses já consumidos antes do sistema"
                          title={
                            reinicioAtivoG
                              ? "Zerado pelo reinício — o consumo anterior foi movido para “Anterior”"
                              : "Meses já consumidos antes do sistema (semente inicial)"
                          }
                          value={reinicioAtivoG ? 0 : form.meses_consumidos_inicial}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, meses_consumidos_inicial: e.target.value }))
                          }
                        />
                        {/* Anterior — consumo antes do reinício = emissões antigas + semente manual */}
                        {temHistG && (
                          <Input
                            readOnly
                            tabIndex={-1}
                            className="sm:text-center bg-muted/30 text-muted-foreground italic"
                            aria-label="Meses consumidos antes do reinício"
                            title="Consumo antes do reinício (aditivo) — apenas histórico"
                            value={anteriorG}
                          />
                        )}
                        {/* Automática — nº de apurações emitidas a partir do reinício (somente leitura) */}
                        <Input
                          readOnly
                          tabIndex={-1}
                          className="sm:text-center bg-muted/50 text-muted-foreground"
                          aria-label="Meses consumidos automaticamente"
                          title="Gerado automaticamente pelas apurações emitidas a partir do reinício (1 emissão = 1 mês)"
                          value={emitidosCount}
                        />
                        {/* Disponível — calculado */}
                        <Input
                          readOnly
                          tabIndex={-1}
                          className={`sm:text-center bg-muted/50 ${negativo ? "text-destructive font-medium" : "text-muted-foreground"}`}
                          aria-label="Meses disponíveis"
                          title="Meses de contrato − consumidos (manual + automático)"
                          value={disponivel.toFixed(2)}
                        />
                        {/* Consumido R$ — calculado */}
                        <Input
                          readOnly
                          tabIndex={-1}
                          className="sm:text-right bg-muted/50 text-muted-foreground"
                          aria-label="Valor consumido em reais"
                          title="Consumido = meses consumidos × valor mensal"
                          value={(consumidas * valorMensal).toFixed(2)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {form.modo_valor === "global" && (
              <div className="space-y-1.5">
                <Label>Numeracao inicial (ultimo nº emitido)</Label>
                <Input
                  type="number"
                  className="w-40"
                  value={form.ultimo_numero}
                  onChange={(e) => setForm((f) => ({ ...f, ultimo_numero: e.target.value }))}
                />
              </div>
            )}

            {/* Texto padrao */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Texto padrao</Label>
                <Button type="button" size="sm" variant="ghost" onClick={preencherTextoPadrao}>
                  Gerar sugestao
                </Button>
              </div>
              <Textarea
                rows={4}
                placeholder="Texto que sera reaproveitado a cada emissao..."
                value={form.texto_padrao}
                onChange={(e) => setForm((f) => ({ ...f, texto_padrao: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Observacoes padrao</Label>
              <Textarea
                rows={2}
                value={form.observacoes_padrao}
                onChange={(e) => setForm((f) => ({ ...f, observacoes_padrao: e.target.value }))}
              />
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.modalidade_remoto}
                  onChange={(e) => setForm((f) => ({ ...f, modalidade_remoto: e.target.checked }))}
                />
                Atendimento remoto
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.modalidade_presencial}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, modalidade_presencial: e.target.checked }))
                  }
                />
                Atendimento presencial
              </label>
            </div>

            {/* Emissao automatica */}
            <div
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                form.emissao_automatica
                  ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-500/30"
                  : "border-border"
              }`}
            >
              <div className="flex items-start gap-2">
                <CalendarClock
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    form.emissao_automatica ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  }`}
                />
                <div className="leading-tight">
                  <p className="text-sm font-medium text-foreground">Emissao automatica</p>
                  <p className="text-xs text-muted-foreground">
                    No primeiro dia util de cada mes, gera o relatorio da competencia anterior
                    anexando as visitas do periodo.
                  </p>
                </div>
              </div>
              <Switch
                checked={form.emissao_automatica}
                onCheckedChange={(v) => setForm((f) => ({ ...f, emissao_automatica: v }))}
                aria-label="Alternar emissao automatica"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editId ? "Salvar alteracoes" : "Criar modelo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={excluirId !== null} onOpenChange={(o) => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              Os relatorios ja emitidos com este modelo serao mantidos, mas perderao o vinculo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
