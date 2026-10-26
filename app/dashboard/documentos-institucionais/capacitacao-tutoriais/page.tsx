"use client"

import { useState } from "react"
import useSWR from "swr"
import { useSession } from "@/lib/auth-context"
import { isGestor } from "@/lib/permissions"
import type { Capacitacao, Tutorial } from "@/lib/capacitacao"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { GraduationCap, BookOpen } from "lucide-react"
import { NovoTreinamentoDialog } from "@/components/novo-treinamento-dialog"
import { NovoTutorialDialog } from "@/components/novo-tutorial-dialog"
import { TreinamentosLista } from "@/components/treinamentos-lista"
import { TutoriaisLista } from "@/components/tutoriais-lista"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function CapacitacaoTutoriaisPage() {
  const { user } = useSession()
  const userIsGestor = user ? isGestor(user.nome, user.cargo) : false
  const [aba, setAba] = useState<"treinamentos" | "tutoriais">("treinamentos")
  const [novoTreino, setNovoTreino] = useState(false)
  const [novoTutorial, setNovoTutorial] = useState(false)

  const { data: treinamentos, isLoading: loadingTreino, mutate: mutateTreino } = useSWR<Capacitacao[]>(
    "/api/capacitacoes",
    fetcher,
  )
  const { data: tutoriais, isLoading: loadingTut, mutate: mutateTut } = useSWR<Tutorial[]>(
    "/api/tutoriais",
    fetcher,
  )

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
            <GraduationCap className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-balance">Capacitação e Tutoriais</h1>
            <p className="text-sm text-muted-foreground">Registros de treinamentos realizados e tutoriais da equipe</p>
          </div>
        </div>
        {userIsGestor &&
          (aba === "treinamentos" ? (
            <Button onClick={() => setNovoTreino(true)}>Novo Treinamento</Button>
          ) : (
            <Button onClick={() => setNovoTutorial(true)}>Novo Tutorial</Button>
          ))}
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as "treinamentos" | "tutoriais")}>
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="treinamentos" className="gap-1.5">
            <GraduationCap className="h-4 w-4" />
            Treinamentos
          </TabsTrigger>
          <TabsTrigger value="tutoriais" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            Tutoriais
          </TabsTrigger>
        </TabsList>

        <TabsContent value="treinamentos" className="mt-0">
          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="mb-4">
                <h2 className="text-lg font-medium">Treinamentos</h2>
                <p className="text-sm text-muted-foreground">Capacitações realizadas, instrutores e participantes.</p>
              </div>
              <TreinamentosLista
                treinamentos={treinamentos}
                isLoading={loadingTreino}
                userIsGestor={userIsGestor}
                onChanged={() => mutateTreino()}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tutoriais" className="mt-0">
          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="mb-4">
                <h2 className="text-lg font-medium">Tutoriais</h2>
                <p className="text-sm text-muted-foreground">Materiais e tutoriais em vídeo da equipe.</p>
              </div>
              <TutoriaisLista
                tutoriais={tutoriais}
                isLoading={loadingTut}
                userIsGestor={userIsGestor}
                onChanged={() => mutateTut()}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <NovoTreinamentoDialog open={novoTreino} onOpenChange={setNovoTreino} onCreated={() => mutateTreino()} />
      <NovoTutorialDialog open={novoTutorial} onOpenChange={setNovoTutorial} onCreated={() => mutateTut()} />
    </div>
  )
}
