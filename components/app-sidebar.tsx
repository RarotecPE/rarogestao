"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  Users,
  Building2,
  Calendar,
  FileText,
  LayoutDashboard,
  LogOut,
  ChevronRight,
  BookOpen,
  Shield,
  UserCircle,
  Menu,
  X,
  HeartPulse,
  FolderArchive,
  MessagesSquare,
  UserRoundCog,
} from "lucide-react"
import useSWR from "swr"
import { cn } from "@/lib/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useState, useEffect, useMemo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { getMenuItems, getUserRole } from "@/lib/permissions"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { DashboardHeaderActions } from "@/components/dashboard-header-actions"

interface NavItem {
  title: string
  href?: string
  icon: React.ElementType
  items?: { title: string; href: string; key?: string }[]
  key?: string
  requiresOuveAtivo?: boolean
}

const swrFetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || "Erro ao carregar dados")
  return data
}

const ouveConfigSWRConfig = {
  refreshInterval: 30000,
  dedupingInterval: 15000,
  revalidateOnFocus: false,
  shouldRetryOnError: false,
}

// Items base do menu - filtrados por permissão
const baseNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Cadastros",
    icon: Users,
    items: [
      { title: "Tecnicos Rarotec", href: "/dashboard/tecnicos-rarotec", key: "showTecnicosRarotec" },
      { title: "Clientes", href: "/dashboard/clientes", key: "showClientes" },
      { title: "Tecnicos-Clientes", href: "/dashboard/tecnicos-clientes", key: "showTecnicosClientes" },
    ],
  },
  {
    title: "Agenda",
    href: "/dashboard/agenda",
    icon: Calendar,
  },
  {
    title: "Gestao Tecnica",
    icon: UserRoundCog,
    items: [
      { title: "Responsaveis por Modulo", href: "/dashboard/responsabilidades", key: "showResponsabilidades" },
      { title: "Checklist Mensal do Responsavel", href: "/dashboard/checklists", key: "showChecklists" },
      { title: "Produtividade", href: "/dashboard/produtividade", key: "showProdutividade" },
    ],
  },
  {
    title: "Relatorios",
    icon: FileText,
    items: [
      { title: "Novo Relatorio", href: "/dashboard/relatorios/novo", key: "showNovoRelatorio" },
      { title: "Historico", href: "/dashboard/relatorios", key: "showHistorico" },
      { title: "Batimento", href: "/dashboard/relatorios/batimento", key: "showBatimento" },
      { title: "Apuracao Mensal", href: "/dashboard/relatorios/apuracao", key: "showApuracao" },
      { title: "Modelos de Apuracao", href: "/dashboard/relatorios/apuracao/modelos", key: "showApuracaoModelos" },
    ],
  },
  {
    title: "Documentos Medicos",
    icon: HeartPulse,
    items: [
      { title: "Anexos", href: "/dashboard/documentos-medicos/anexos", key: "showDocumentosMedicos" },
      { title: "Batimento", href: "/dashboard/documentos-medicos/batimento", key: "showBatimentoMedico" },
    ],
  },
  {
    title: "Documentos Institucionais",
    icon: FolderArchive,
    items: [
      { title: "Documentos", href: "/dashboard/documentos-institucionais", key: "showDocumentosInstitucionais" },
      { title: "Atas", href: "/dashboard/documentos-institucionais/atas", key: "showAtas" },
      {
        title: "Capacitacao e Tutoriais",
        href: "/dashboard/documentos-institucionais/capacitacao-tutoriais",
        key: "showCapacitacaoTutoriais",
      },
    ],
  },
  {
    title: "OuveRarotec",
    href: "/dashboard/ouve-rarotec",
    icon: MessagesSquare,
    key: "showOuveRarotec",
    requiresOuveAtivo: true,
  },
  {
    title: "Administracao",
    icon: Shield,
    items: [
      { title: "Usuarios", href: "/dashboard/usuarios", key: "showUsuarios" },
      { title: "Configuracoes", href: "/dashboard/configuracoes", key: "showConfiguracoes" },
    ],
  },
]

interface AppSidebarProps {
  user: {
    nome: string
    email: string
    cargo: string | null
    apuracao_mensal?: boolean
  }
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()
  const [openItems, setOpenItems] = useState<string[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)
  
  // Obter permissões do usuário
  const menuPermissions = useMemo(
    () => getMenuItems(user.nome, user.cargo, user.apuracao_mensal),
    [user.nome, user.cargo, user.apuracao_mensal],
  )
  const userRole = useMemo(() => getUserRole(user.nome, user.cargo), [user.nome, user.cargo])

  // Estado do modulo OuveRarotec (ativo/inativo)
  const { data: ouveConfig } = useSWR<{ ativo: boolean }>("/api/ouve/config", swrFetcher, ouveConfigSWRConfig)
  const ouveAtivo = ouveConfig?.ativo ?? false
  
  // Filtrar itens do menu baseado em permissões
  const navItems = useMemo(() => {
    return baseNavItems.map(item => {
      if (!item.items) return item
      
      // Filtrar subitens baseado em permissões
      const filteredItems = item.items.filter(subItem => {
        if (!subItem.key) return true
        return menuPermissions[subItem.key as keyof typeof menuPermissions]
      })
      
      return { ...item, items: filteredItems }
    }).filter(item => {
      // Itens que dependem do modulo OuveRarotec estar ativo
      if (item.requiresOuveAtivo && !ouveAtivo) return false
      // Verificar permissao de item simples (com key)
      if (!item.items && item.key) {
        if (!menuPermissions[item.key as keyof typeof menuPermissions]) return false
      }
      // Remover grupos vazios
      if (item.items) return item.items.length > 0
      return true
    })
  }, [menuPermissions, ouveAtivo])

  // Auto-open the group that contains the current path
  useEffect(() => {
    navItems.forEach((item) => {
      if (item.items?.some((sub) => pathname.startsWith(sub.href))) {
        setOpenItems((prev) => 
          prev.includes(item.title) ? prev : [...prev, item.title]
        )
      }
    })
  }, [pathname])

  // Fechar menu mobile ao mudar de rota
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const toggleItem = (title: string) => {
    setOpenItems((prev) =>
      prev.includes(title)
        ? prev.filter((item) => item !== title)
        : [...prev, title]
    )
  }

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard"
    // Para rotas exatas (como /dashboard/relatorios), verificar se é exatamente igual
    // ou se é uma subrota que não tem outro item de menu mais específico
    if (pathname === href) return true
    // Para /dashboard/relatorios, não marcar como ativo se estiver em /dashboard/relatorios/novo
    if (href === "/dashboard/relatorios" && pathname.startsWith("/dashboard/relatorios/")) return false
    // Apuracao: nao acender o item base nas subrotas (novo/editar/modelos)
    if (href === "/dashboard/relatorios/apuracao" && pathname.startsWith("/dashboard/relatorios/apuracao/")) return false
    // Para /dashboard/documentos-institucionais, não marcar como ativo nas subrotas (ex.: /atas)
    if (href === "/dashboard/documentos-institucionais" && pathname.startsWith("/dashboard/documentos-institucionais/")) return false
    return pathname.startsWith(href + "/")
  }

  const roleLabel =
    user.cargo ||
    (userRole === "diretor"
      ? "Diretor"
      : userRole === "gerente"
        ? "Gerente"
        : userRole === "coordenador"
          ? "Coordenador"
          : "Técnico")

  // Conteúdo do sidebar (reutilizado no desktop e mobile)
  const SidebarContent = () => (
    <>
      {/* Logo Header */}
      <div className="flex h-16 shrink-0 items-center gap-3 px-6">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white p-0.5 shadow-sm ring-1 ring-white/10">
          <Image
            src="/logo.png"
            alt="RaroGestão"
            width={34}
            height={34}
            className="h-[34px] w-[34px] object-contain"
          />
        </div>
        <div>
          <h1 className="text-base font-semibold text-sidebar-foreground">RaroGestão</h1>
          <p className="text-xs text-sidebar-foreground/50">Rarotec</p>
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <ScrollArea className="min-h-0 flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const hasSubmenu = item.items && item.items.length > 0
            const isOpen = openItems.includes(item.title)
            const groupActive = item.items?.some((sub) => isActive(sub.href))

            if (hasSubmenu) {
              return (
                <Collapsible
                  key={item.title}
                  open={isOpen}
                  onOpenChange={() => toggleItem(item.title)}
                >
                  <CollapsibleTrigger
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      groupActive && "text-sidebar-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{item.title}</span>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 text-sidebar-foreground/40 transition-transform duration-200",
                        isOpen && "rotate-90"
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapse data-[state=open]:animate-expand">
                    <div className="ml-4 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                      {item.items?.map((subItem) => (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-all duration-200",
                            isActive(subItem.href)
                              ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                              : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full transition-colors",
                              isActive(subItem.href) 
                                ? "bg-sidebar-primary-foreground" 
                                : "bg-sidebar-foreground/30"
                            )}
                          />
                          {subItem.title}
                        </Link>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )
            }

            return (
              <Link
                key={item.title}
                href={item.href!}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive(item.href!)
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.title}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      <div className="shrink-0 border-t border-sidebar-border px-6 py-4 text-xs text-sidebar-foreground/45">
        {roleLabel}
      </div>
    </>
  )

  return (
    <>
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/90 px-4 backdrop-blur-xl lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0">
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
            <div className="flex h-full flex-col">
              <SidebarContent />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-0.5 shadow-sm ring-1 ring-white/10">
              <Image
                src="/logo.png"
                alt="RaroGestão"
                width={30}
                height={30}
                className="h-[30px] w-[30px] object-contain"
              />
            </div>
            <span className="truncate font-semibold">RaroGestão</span>
          </div>
          <DashboardHeaderActions user={user} />
        </div>
      </header>

      {/* Spacer for mobile header */}
      <div className="h-14 lg:hidden" />

      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarContent />
      </aside>
    </>
  )
}
