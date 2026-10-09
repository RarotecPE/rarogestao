"use client"

import { createContext, useContext, ReactNode, useEffect } from "react"
import useSWR from "swr"
import Image from "next/image"
import { Loader2 } from "lucide-react"

export interface User {
  id: number
  nexus_user_id?: string | null
  nome: string
  email: string
  avatar_url?: string | null
  cargo: string | null
  cargos?: string[]
  apuracao_mensal?: boolean
  tecnico_rarotec_id?: number | null
}

interface AuthContextType {
  user: User | null
  loading: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
})

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error("Not authenticated")
    return res.json()
  })

export function AuthProvider({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser?: User | null
}) {
  const { data: swrUser, mutate } = useSWR<User>("/api/auth/me", fetcher, {
    fallbackData: initialUser ?? undefined,
    revalidateOnMount: !initialUser,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 30000,
  })

  // Prioriza o usuário verificado pelo servidor caso haja divergência com o cache
  const activeUser =
    initialUser && swrUser && swrUser.id !== initialUser.id
      ? initialUser
      : (swrUser ?? initialUser ?? null)

  useEffect(() => {
    if (initialUser) {
      mutate(initialUser, false)
    }
  }, [initialUser, mutate])

  const loading = !activeUser

  const isAdmin =
    activeUser?.cargo === "Administrador" ||
    activeUser?.cargos?.includes("Administrador") ||
    false

  // Enquanto o perfil não foi verificado, exibe a tela de carregamento evitando flashes de permissão incorreta
  if (loading) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
            <Image
              src="/favicon.png"
              alt="RaroGestão"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
              priority
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Verificando perfil do usuário...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        user: activeUser,
        loading: false,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useSession() {
  return useContext(AuthContext)
}
