// Sistema de Permissões baseado em papéis (sincronizados via RaroNexus)
// Papéis determinados estritamente pelo cargo cadastrado (admin, diretor, gerente, coordenador, tecnico)

export type UserRole = 'admin' | 'diretor' | 'gerente' | 'coordenador' | 'tecnico'

function normalize(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

// Determina o papel do usuário baseado estritamente no cargo cadastrado
export function getUserRole(userName?: string, cargo?: string | null): UserRole {
  const cargoLower = normalize(cargo || "")
  if (cargoLower === "administrador" || cargoLower === "admin") return "admin"
  if (cargoLower.includes("diretor")) return "diretor"
  if (cargoLower.includes("gerente") || cargoLower.includes("gestor")) return "gerente"
  if (cargoLower.includes("coordenador") || cargoLower.includes("coordenacao")) return "coordenador"
  
  return "tecnico"
}

// Verifica se o usuário é gestor (admin, diretor, gerente ou coordenador)
export function isGestor(userName?: string, cargo?: string | null): boolean {
  const role = getUserRole(userName, cargo)
  return role === "admin" || role === "diretor" || role === "gerente" || role === "coordenador"
}

// Verifica se o usuário é diretor
export function isDiretor(userName?: string, cargo?: string | null): boolean {
  const role = getUserRole(userName, cargo)
  return role === "admin" || role === "diretor"
}

// Verifica se o usuário é administrador
export function isAdmin(cargo?: string | null): boolean {
  const cargoLower = normalize(cargo || "")
  return cargoLower === "administrador" || cargoLower === "admin"
}

// Acesso a Apuração Mensal / Modelos de Apuração.
// Liberado apenas para usuários com o flag habilitado no cadastro
// (Administração > Usuários) ou para administradores (sempre liberados).
export function canApuracaoMensal(cargo?: string | null, apuracaoMensal?: boolean): boolean {
  return isAdmin(cargo) || !!apuracaoMensal
}

// Permissões específicas por funcionalidade
export const permissions = {
  // Cadastros
  cadastros: {
    clientes: {
      visualizar: () => true,
      gerenciar: () => true,
    },
    tecnicosClientes: {
      visualizar: () => true,
      gerenciar: () => true,
    },
    tecnicosRarotec: {
      visualizar: (userName: string) => isGestor(userName),
      gerenciar: (userName: string) => isGestor(userName),
    },
  },
  
  // Agenda
  agenda: {
    visualizar: () => true,
    gerenciarTodos: (userName: string) => isGestor(userName),
    gerenciarPropria: () => true,
    solicitarAlteracao: () => true,
    aprovarSolicitacao: (userName: string) => isGestor(userName),
  },
  
  // Relatórios
  relatorios: {
    novoRelatorio: () => true,
    historico: {
      verTodos: (userName: string) => isGestor(userName),
      verProprios: () => true,
    },
    batimento: (userName: string) => isGestor(userName),
  },
  
  // Administração
  admin: {
    usuarios: (userName: string) => isGestor(userName),
    configuracoes: {
      verTudo: (userName: string) => isGestor(userName),
      alterarPropriaSenha: () => false,
    },
  },
}

// Helper para verificar permissão
export function hasPermission(
  userName: string,
  permission: (userName: string) => boolean
): boolean {
  return permission(userName)
}

// Itens do menu baseados em permissões
export function getMenuItems(userName: string, cargo?: string | null, apuracaoMensal?: boolean) {
  const isUserGestor = isGestor(userName, cargo)
  const podeApuracao = canApuracaoMensal(cargo, apuracaoMensal)
  
  return {
    // Cadastros
    showClientes: true,
    showTecnicosClientes: true,
    showTecnicosRarotec: isUserGestor,
    
    // Agenda
    showAgenda: true,
    showPlanejamento: isUserGestor,
    
    // Relatórios
    showNovoRelatorio: true,
    showHistorico: true,
    showBatimento: isUserGestor,
    showApuracao: podeApuracao,
    showApuracaoModelos: podeApuracao,

    // Gestão de responsáveis e produtividade
    showResponsabilidades: isUserGestor,
    showChecklists: true,
    showProdutividade: isUserGestor,
    
    // Documentos Médicos
    showDocumentosMedicos: true, // técnico vê os próprios; gestor vê de todos
    showBatimentoMedico: isUserGestor,
    
    // Documentos Institucionais (acesso fino aplicado no servidor)
    showDocumentosInstitucionais: true,
    showAtas: true,
    // Visivel a todos os logados; criar/excluir e restrito a gestores (via isGestor).
    showCapacitacaoTutoriais: true,
    
    // OuveRarotec (visivel quando o modulo estiver ativo; gate no cliente/servidor)
    showOuveRarotec: true,
    
    // Admin
    showUsuarios: isUserGestor,
    showConfiguracoes: true,
  }
}

// Verifica se pode editar agenda de outro usuário
export function canEditAgenda(userName: string, agendaTecnicoId: number, userTecnicoId: number, cargo?: string | null): boolean {
  // Gestores podem editar qualquer agenda
  if (isGestor(userName, cargo)) return true
  
  // Técnicos só podem editar/solicitar alteração na própria agenda
  return agendaTecnicoId === userTecnicoId
}

// Verifica se pode ver relatório
export function canViewRelatorio(userName: string, relatorioTecnicoIds: number[], userTecnicoId: number, cargo?: string | null): boolean {
  // Gestores podem ver todos
  if (isGestor(userName, cargo)) return true
  
  // Técnicos só veem relatórios onde estão vinculados
  return relatorioTecnicoIds.includes(userTecnicoId)
}
