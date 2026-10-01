"use client"

import { useCallback, useEffect, useState } from "react"
import { Ban, CheckCircle2, CircleAlert, Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ClienteCombobox } from "@/components/cliente-combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ClienteCandidato {
  id: number
  nome_fantasia: string
  razao_social: string | null
  cidade: string | null
}
interface TecnicoCandidato {
  id: number
  nome: string
  email: string | null
}
interface ItemConciliacao {
  id: number
  municipio: string
  modulo_origem: string
  responsavel_origem: string
  email_origem: string | null
  observacao: string | null
  status: string
  sugestao: {
    cliente_id: number | null
    cliente_nome: string | null
    orgao_id: number | null
    modulo: string | null
    tecnico_rarotec_id: number | null
  }
  opcoes: {
    clientes: ClienteCandidato[]
    modulos: string[]
    tecnicos: TecnicoCandidato[]
  }
}

// Estado editável de cada linha da conciliação.
interface Escolha {
  clienteId: string
  modulo: string
  tecnicoId: string
  modulos: string[]
  carregandoModulos: boolean
}

export function ConciliacaoResponsaveisDialog({
  open,
  onOpenChange,
  onConcluido,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConcluido: () => void
}) {
  const [itens, setItens] = useState<ItemConciliacao[]>([])
  const [todosClientes, setTodosClientes] = useState<ClienteCandidato[]>([])
  const [clientesModulos, setClientesModulos] = useState<{ cliente_id: number; modulo: string }[]>([])
  const [modulosGlobais, setModulosGlobais] = useState<string[]>([])
  const [todosTecnicos, setTodosTecnicos] = useState<TecnicoCandidato[]>([])
  const [escolhas, setEscolhas] = useState<Record<number, Escolha>>({})
  const [carregando, setCarregando] = useState(false)
  const [processando, setProcessando] = useState<number | null>(null)

  // Rótulo "Município — Entidade" para o combobox, com consórcios ao final.
  const clientesParaSelect = todosClientes.map((c) => ({
    id: c.id,
    nome_fantasia: c.cidade ? `${c.cidade} — ${c.nome_fantasia}` : c.nome_fantasia,
  }))

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [res, resOpcoes] = await Promise.all([
        fetch("/api/responsabilidades/conciliacao"),
        fetch("/api/responsabilidades/opcoes"),
      ])
      if (!res.ok) throw new Error("Falha ao carregar pendentes")
      const json = await res.json()
      const opcoesJson = resOpcoes.ok ? await resOpcoes.json() : { clientes_modulos: [] }
      const lista: ItemConciliacao[] = json.data ?? []
      setItens(lista)
      setTodosClientes(json.todos_clientes ?? [])
      setClientesModulos(opcoesJson.clientes_modulos ?? [])
      setModulosGlobais((opcoesJson.modulos ?? []).map((m: { modulo: string }) => m.modulo))
      setTodosTecnicos(opcoesJson.tecnicos ?? [])
      // Pré-preenche cada linha com as sugestões automáticas.
      const inicial: Record<number, Escolha> = {}
      for (const it of lista) {
        inicial[it.id] = {
          clienteId: it.sugestao.cliente_id ? String(it.sugestao.cliente_id) : "",
          modulo: it.sugestao.modulo ?? "",
          tecnicoId: it.sugestao.tecnico_rarotec_id
            ? String(it.sugestao.tecnico_rarotec_id)
            : it.opcoes.tecnicos.length === 1
              ? String(it.opcoes.tecnicos[0].id)
              : "",
          modulos: it.opcoes.modulos,
          carregandoModulos: false,
        }
      }
      setEscolhas(inicial)
    } catch {
      toast.error("Não foi possível carregar os pendentes")
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (open) carregar()
  }, [open, carregar])

  // Ao trocar o cliente, filtra os módulos daquele cliente (já carregados em memória).
  function trocarCliente(itemId: number, clienteId: string) {
    const modulos = clientesModulos
      .filter((cm) => String(cm.cliente_id) === clienteId)
      .map((cm) => cm.modulo)
    setEscolhas((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], clienteId, modulo: "", modulos, carregandoModulos: false },
    }))
  }

  async function resolver(item: ItemConciliacao) {
    const escolha = escolhas[item.id]
    if (!escolha?.clienteId || !escolha?.modulo || !escolha?.tecnicoId) {
      toast.error("Selecione cliente, módulo e responsável")
      return
    }
    setProcessando(item.id)
    try {
      const res = await fetch("/api/responsabilidades/conciliacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importacao_id: item.id,
          acao: "resolver",
          cliente_id: Number(escolha.clienteId),
          modulo: escolha.modulo,
          tecnico_rarotec_id: Number(escolha.tecnicoId),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Falha ao conciliar")
      toast.success(`${item.municipio} / ${item.modulo_origem} conciliado`)
      setItens((prev) => prev.filter((i) => i.id !== item.id))
      onConcluido()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao conciliar")
    } finally {
      setProcessando(null)
    }
  }

  // Dispensa um item sem criar vínculo: "ignorar" (pendência a revisar depois) ou
  // "nao_aplicavel" (resolvido em definitivo, pois não existe responsável possível).
  async function dispensar(item: ItemConciliacao, acao: "ignorar" | "nao_aplicavel") {
    const rotulo = acao === "nao_aplicavel" ? "marcado como não se aplica" : "ignorado"
    setProcessando(item.id)
    try {
      const res = await fetch("/api/responsabilidades/conciliacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importacao_id: item.id, acao }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Falha ao atualizar")
      toast.success(`${item.municipio} / ${item.modulo_origem} ${rotulo}`)
      setItens((prev) => prev.filter((i) => i.id !== item.id))
      onConcluido()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar")
    } finally {
      setProcessando(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[95vw] max-w-5xl overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Conciliar responsáveis pendentes</DialogTitle>
          <DialogDescription>
            Confira cada registro da carga inicial e defina o cliente, o módulo e o responsável corretos. Use
            &quot;Ignorar&quot; para revisar depois ou &quot;Não se aplica&quot; quando não existe responsável para o
            registro e ele não deve mais constar como pendência.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando pendentes...
          </div>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <p className="font-medium">Nenhum pendente de conciliação</p>
            <p className="text-sm text-muted-foreground">Todos os registros da carga foram tratados.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {itens.map((item) => {
              const escolha = escolhas[item.id]
              const emProcesso = processando === item.id
              // Módulos do cliente escolhido; se ele não tiver nenhum cadastrado,
              // cai na lista global (o gestor pode vincular o módulo ao conciliar).
              const modulosCliente = escolha?.modulos ?? []
              const opcoesModulo = Array.from(
                new Set(
                  (modulosCliente.length ? modulosCliente : modulosGlobais).concat(
                    item.modulo_origem ? [item.modulo_origem] : [],
                  ),
                ),
              ).sort((a, b) => a.localeCompare(b, "pt-BR"))
              // Responsáveis sugeridos, ou a lista completa de técnicos ativos como fallback
              // (ex.: ignorados sem responsável na planilha não têm sugestão).
              const opcoesTecnico = item.opcoes.tecnicos.length ? item.opcoes.tecnicos : todosTecnicos
              return (
                <div key={item.id} className="rounded-lg border bg-card p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {item.municipio} <span className="text-muted-foreground">/</span> {item.modulo_origem}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Responsável na planilha: <span className="font-medium text-foreground">{item.responsavel_origem}</span>
                        {item.email_origem ? ` (${item.email_origem})` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Badge
                        variant="outline"
                        className={
                          item.status === "ignorado"
                            ? "gap-1 border-red-300 text-red-700 bg-red-50/50 dark:border-red-500/40 dark:text-red-300 dark:bg-red-500/10"
                            : "gap-1 border-amber-300 text-amber-800 bg-amber-50/50 dark:border-amber-500/40 dark:text-amber-300 dark:bg-amber-500/10"
                        }
                      >
                        {item.status === "ignorado" ? "Ignorado" : "Pendente"}
                      </Badge>
                      {item.observacao && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-300 text-amber-800 bg-amber-50/50 dark:border-amber-500/40 dark:text-amber-300 dark:bg-amber-500/10"
                        >
                          <CircleAlert className="h-3 w-3" /> {item.observacao}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Município / entidade</Label>
                      <ClienteCombobox
                        clientes={clientesParaSelect}
                        value={escolha?.clienteId ?? ""}
                        onChange={(v) => trocarCliente(item.id, v)}
                        placeholder="Selecione o município/cliente"
                        disabled={emProcesso}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Módulo</Label>
                      <Select
                        value={escolha?.modulo ?? ""}
                        onValueChange={(v) => setEscolhas((p) => ({ ...p, [item.id]: { ...p[item.id], modulo: v } }))}
                        disabled={emProcesso || !escolha?.clienteId}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione o módulo" />
                        </SelectTrigger>
                        <SelectContent>
                          {opcoesModulo.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Responsável</Label>
                      <Select
                        value={escolha?.tecnicoId ?? ""}
                        onValueChange={(v) => setEscolhas((p) => ({ ...p, [item.id]: { ...p[item.id], tecnicoId: v } }))}
                        disabled={emProcesso}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione o responsável" />
                        </SelectTrigger>
                        <SelectContent>
                          {opcoesTecnico.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => dispensar(item, "ignorar")} disabled={emProcesso}>
                      <XCircle className="mr-1.5 h-4 w-4" /> Ignorar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => dispensar(item, "nao_aplicavel")}
                      disabled={emProcesso}
                    >
                      <Ban className="mr-1.5 h-4 w-4" /> Não se aplica
                    </Button>
                    <Button size="sm" onClick={() => resolver(item)} disabled={emProcesso}>
                      {emProcesso ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                      Conciliar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
