import { redirect } from "next/navigation"
import { getSession, resolveTecnicoRarotecId } from "@/lib/auth"
import { AppSidebar } from "@/components/app-sidebar"
import { DashboardHeaderActions } from "@/components/dashboard-header-actions"
import { ChecklistPendenciaBanner } from "@/components/checklist-pendencia-banner"
import { SessionGuard } from "@/components/session-guard"
import { AuthProvider, User } from "@/lib/auth-context"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSession()

  if (!user) {
    redirect("/login")
  }

  const tecnicoRarotecId = await resolveTecnicoRarotecId(user)
  const initialUser: User = {
    id: user.id,
    nexus_user_id: user.nexus_user_id ?? null,
    nome: user.nome,
    email: user.email,
    avatar_url: user.avatar_url ?? null,
    cargo: user.cargo ?? null,
    cargos: user.cargo ? [user.cargo] : [],
    apuracao_mensal: user.apuracao_mensal ?? false,
    tecnico_rarotec_id: tecnicoRarotecId,
  }

  return (
    <AuthProvider initialUser={initialUser}>
      <SessionGuard />
      <div className="min-h-screen bg-background">
        <AppSidebar user={initialUser} />
        <main className="lg:pl-64">
          <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-border bg-card/85 px-6 backdrop-blur-xl lg:flex">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">RaroGestão</p>
              <h2 className="text-lg font-semibold text-foreground">
                Sistema de Gestão Administrativa
              </h2>
            </div>
            <DashboardHeaderActions user={initialUser} />
          </header>
          <div className="min-h-[calc(100vh-4rem)]">
            {children}
          </div>
        </main>
        <ChecklistPendenciaBanner />
      </div>
    </AuthProvider>
  )
}
