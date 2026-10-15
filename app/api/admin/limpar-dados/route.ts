import { sql } from "@/lib/db"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { auditClient, getRequestContext } from "@/lib/audit"


export async function POST(request: Request) {
  try {
    // Verificar autenticacao usando getSession
    const session = await getSession()
    
    if (!session) {
      return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
    }
    
    // Verificar se e administrador (cargo pode ser "Administrador" ou "admin")
    const cargoLower = session.cargo?.toLowerCase() || ""
    if (cargoLower !== "administrador" && cargoLower !== "admin") {
      return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 })
    }
    
    const { confirmacao, tabelas } = await request.json()
    
    // Verificar confirmacao
    if (confirmacao !== "LIMPAR DADOS") {
      return NextResponse.json({ error: "Confirmacao invalida" }, { status: 400 })
    }
    
    if (!tabelas || tabelas.length === 0) {
      return NextResponse.json({ error: "Nenhuma tabela selecionada" }, { status: 400 })
    }
    
    const resultados: Record<string, number> = {}
    const userId = session.id
    
    // Limpar cada tabela selecionada usando template literals corretos
    if (tabelas.includes("relatorios")) {
      // Primeiro limpar anexos (tabela relacionada)
      const anexosResult = await sql`DELETE FROM relatorios_anexos RETURNING id`
      resultados["relatorios_anexos"] = anexosResult.length
      
      // Depois limpar relatórios
      const relatoriosResult = await sql`DELETE FROM relatorios_visitas RETURNING id`
      resultados["relatorios_visitas"] = relatoriosResult.length
    }
    
    if (tabelas.includes("agenda")) {
      const result = await sql`DELETE FROM agenda_trabalhista RETURNING id`
      resultados["agenda_trabalhista"] = result.length
    }
    
    if (tabelas.includes("pesquisas")) {
      const result = await sql`DELETE FROM pesquisas_satisfacao RETURNING id`
      resultados["pesquisas_satisfacao"] = result.length
    }
    
    if (tabelas.includes("tecnicos_rarotec")) {
      // Não deletar o usuário atual
      const result = await sql`DELETE FROM tecnicos_rarotec WHERE id != ${userId} RETURNING id`
      resultados["tecnicos_rarotec"] = result.length
    }
    
    if (tabelas.includes("tecnicos_clientes")) {
      const result = await sql`DELETE FROM tecnicos_clientes RETURNING id`
      resultados["tecnicos_clientes"] = result.length
    }
    
    if (tabelas.includes("clientes")) {
      const result = await sql`DELETE FROM clientes RETURNING id`
      resultados["clientes"] = result.length
    }
    
    if (tabelas.includes("usuarios")) {
      // Não deletar o usuário atual (administrador logado)
      const result = await sql`DELETE FROM usuarios WHERE id != ${userId} RETURNING id`
      resultados["usuarios"] = result.length
    }
    
    auditClient.log({
      category: "admin",
      action: "admin.data_cleared",
      severity: "CRITICAL",
      actor: {
        type: "user",
        userId: String(session.id),
        name: session.nome,
        email: session.email,
        role: session.cargo,
      },
      targets: tabelas.map((t: string) => ({
        type: "table",
        id: t,
        label: `Tabela: ${t} (${resultados[t] ?? 0} registros removidos)`,
      })),
      context: getRequestContext(request),
      details: {
        tabelas_solicitadas: tabelas,
        resultados_expurgo: resultados,
        total_registros_afetados: Object.values(resultados).reduce((a, b) => a + b, 0),
      },
    })

    return NextResponse.json({ 
      success: true, 
      message: "Dados limpos com sucesso",
      resultados 
    })
    
  } catch (error: any) {
    console.error("Erro ao limpar dados:", error)
    return NextResponse.json(
      { error: "Erro ao limpar dados", details: error.message },
      { status: 500 }
    )
  }
}
