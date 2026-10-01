"use client"

import { useState } from "react"
import useSWR from "swr"
import { useSession } from "@/lib/auth-context"
import { isGestor } from "@/lib/permissions"
import {
  CATEGORIAS_ATA,
  LABEL_CATEGORIA,
  DESCRICAO_CATEGORIA,
  type DocumentoInstitucional,
} from "@/lib/documentos-institucionais"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ClipboardList, Users, User, Lock } from "lucide-react"
import { DocumentosLista } from "@/components/documentos-institucionais-lista"
import { NovoDocumentoDialog } from "@/components/novo-documento-institucional-dialog"
import { NotasAtaDialog } from "@/components/notas-ata-dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const ICONES: Record<string, React.ElementType> = {
  ata_geral: Users,
  ata_setor: ClipboardList,
  ata_individual: User,
}

export default function AtasPage() {
  const { user } = useSession()
  const userIsGestor = user ? isGestor(user.nome, user.cargo) : false
  const [categoria, setCategoria] = useState<string>("ata_geral")
  const [novoOpen, setNovoOpen] = useState(false)
  const [notasDoc, setNotasDoc] = useState<DocumentoInstitucional | null>(null)
  const [notasOpen, setNotasOpen] = useState(false)

  const { data: atas, isLoading, mutate } = useSWR<DocumentoInstitucional[]>(
    `/api/documentos-institucionais?categoria=${categoria}`,
    fetcher,
  )

  function abrirNotas(doc: DocumentoInstitucional) {
    setNotasDoc(doc)
    setNotasOpen(true)
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-balance">Atas</h1>
            <p className="text-sm text-muted-foreground">
              Registros de reuniões gerais, por setor e individuais
            </p>
          </div>
        </div>
        {userIsGestor && <Button onClick={() => setNovoOpen(true)}>Nova Ata</Button>}
      </div>

      {userIsGestor && (
        <div className="mb-4 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
          <Lock className="h-4 w-4 shrink-0" />
          Suas anotações e comentários nas atas são privados e visíveis apenas a coordenadores e gerentes.
        </div>
      )}

      <Tabs value={categoria} onValueChange={setCategoria}>
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-1">
          {CATEGORIAS_ATA.map((cat) => {
            const Icon = ICONES[cat]
            return (
              <TabsTrigger key={cat} value={cat} className="gap-1.5">
                <Icon className="h-4 w-4" />
                {LABEL_CATEGORIA[cat]}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {CATEGORIAS_ATA.map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-0">
            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-medium">{LABEL_CATEGORIA[cat]}</h2>
                    <p className="text-sm text-muted-foreground">{DESCRICAO_CATEGORIA[cat]}</p>
                  </div>
                  {!userIsGestor && (cat === "ata_setor" || cat === "ata_individual") && (
                    <Badge variant="secondary" className="shrink-0 font-normal">
                      {cat === "ata_setor" ? "Apenas do seu setor" : "Apenas as suas"}
                    </Badge>
                  )}
                </div>
                <DocumentosLista
                  documentos={categoria === cat ? atas : undefined}
                  isLoading={categoria === cat ? isLoading : false}
                  userIsGestor={userIsGestor}
                  onChanged={() => mutate()}
                  onAbrirNotas={abrirNotas}
                  mostrarSetor={cat === "ata_setor"}
                  mostrarUsuarioAlvo={cat === "ata_individual"}
                  emptyLabel="Nenhuma ata cadastrada nesta categoria."
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <NovoDocumentoDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        modoAta
        categoriaAtaInicial={categoria}
        onCreated={() => mutate()}
      />

      <NotasAtaDialog
        documento={notasDoc}
        open={notasOpen}
        onOpenChange={setNotasOpen}
        onChanged={() => mutate()}
      />
    </div>
  )
}
