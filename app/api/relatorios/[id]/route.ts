import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { id } = await params
    const relatorios = await sql`
      SELECT r.*, 
        t.nome as tecnico_nome,
        t.email as tecnico_email,
        c.nome_fantasia as cliente_nome,
        c.razao_social as cliente_razao_social,
        c.cnpj as cliente_cnpj,
        c.endereco as cliente_endereco,
        c.cidade as cliente_cidade,
        c.estado as cliente_estado,
        tc.nome as tecnico_cliente_nome,
        tc.email as tecnico_cliente_email,
        tc.cpf as tecnico_cliente_cpf
      FROM relatorios_visitas r
      LEFT JOIN tecnicos_rarotec t ON r.tecnico_rarotec_id = t.id
      LEFT JOIN clientes c ON r.cliente_id = c.id
      LEFT JOIN tecnicos_clientes tc ON r.tecnico_cliente_id = tc.id
      WHERE r.id = ${id}
    `
    
    if (relatorios.length === 0) {
      return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 })
    }
    
    const relatorio = relatorios[0]

    if (!isGestor(user.nome, user.cargo)) {
      const tecRow = await sql`SELECT id FROM tecnicos_rarotec WHERE email = ${user.email} LIMIT 1`
      const ownTecId: number | null = tecRow.length > 0 ? Number(tecRow[0].id) : null
      const isCreator = relatorio.criado_por_id === user.id
      let isAssigned = ownTecId ? relatorio.tecnico_rarotec_id === ownTecId : false
      if (!isAssigned && ownTecId !== null && relatorio.tecnicos_rarotec_ids) {
        try {
          const ids = typeof relatorio.tecnicos_rarotec_ids === 'string' ? JSON.parse(relatorio.tecnicos_rarotec_ids) : relatorio.tecnicos_rarotec_ids
          if (Array.isArray(ids) && ids.map(Number).includes(ownTecId)) isAssigned = true
        } catch {}
      }
      if (!isCreator && !isAssigned) {
        return NextResponse.json({ error: "Acesso negado a este relatório" }, { status: 403 })
      }
    }
    
    // Buscar nomes dos técnicos Rarotec se houver tecnicos_rarotec_ids
    let tecnicosRarotecNomes: any[] = []
    if (relatorio.tecnicos_rarotec_ids) {
      try {
        const ids = typeof relatorio.tecnicos_rarotec_ids === 'string' 
          ? JSON.parse(relatorio.tecnicos_rarotec_ids) 
          : relatorio.tecnicos_rarotec_ids
        
        if (ids && ids.length > 0) {
          tecnicosRarotecNomes = await sql`
            SELECT id, nome, email FROM tecnicos_rarotec WHERE id = ANY(${ids})
          `
        }
      } catch (e) {
        console.error("Erro ao parsear tecnicos_rarotec_ids:", e)
      }
    }
    
    // Se não houver tecnicos_rarotec_ids mas houver tecnico_nome (fallback)
    if (tecnicosRarotecNomes.length === 0 && relatorio.tecnico_nome) {
      tecnicosRarotecNomes = [{ nome: relatorio.tecnico_nome, email: relatorio.tecnico_email }]
    }
    
    // Buscar anexos do relatório
    let anexos: any[] = []
    try {
      anexos = await sql`
        SELECT id, nome_arquivo, tipo_arquivo, url, created_at
        FROM relatorios_anexos
        WHERE relatorio_id = ${id}
        ORDER BY created_at ASC
      `
    } catch (e) {
      // Tabela pode não existir ainda
      console.log("Tabela relatorios_anexos não encontrada")
    }
    
    // Processar orgao_atendido para buscar nomes corretos pelo CNPJ
    let orgaosProcessados = relatorio.orgao_atendido
    if (relatorio.orgao_atendido) {
      const partes = String(relatorio.orgao_atendido).split("; ")
      const partesProcessadas = await Promise.all(partes.map(async (parte: string) => {
        const match = parte.match(/^(.+?) \(CNPJ: (.+?)\)$/)
        if (match) {
          const nomeAtual = match[1]
          const cnpj = match[2]
          // Se o nome está como "undefined" ou vazio, buscar pelo CNPJ
          if (nomeAtual === "undefined" || !nomeAtual.trim()) {
            try {
              const orgaos = await sql`
                SELECT nome FROM orgaos_cliente WHERE cnpj = ${cnpj} LIMIT 1
              `
              if (orgaos.length > 0 && orgaos[0].nome) {
                return `${orgaos[0].nome} (CNPJ: ${cnpj})`
              }
            } catch (e) {
              // Ignorar erro
            }
          }
        }
        return parte
      }))
      orgaosProcessados = partesProcessadas.join("; ")
    }
    
    return NextResponse.json({
      ...relatorio,
      orgao_atendido: orgaosProcessados,
      tecnicos_rarotec_nomes: tecnicosRarotecNomes,
      anexos: anexos,
      // Para exibição mais fácil no frontend
      tecnico_nome: tecnicosRarotecNomes.length > 0 
        ? tecnicosRarotecNomes.map((t: any) => t.nome).join(", ")
        : relatorio.tecnico_nome || ""
    })
  } catch (error) {
    console.error("Erro ao buscar relatório:", error)
    return NextResponse.json({ error: "Erro ao buscar relatório" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { id } = await params

    if (!isGestor(user.nome, user.cargo)) {
      const existing = await sql`SELECT id, criado_por_id, tecnico_rarotec_id, tecnicos_rarotec_ids FROM relatorios_visitas WHERE id = ${id}`
      if (existing.length === 0) {
        return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 })
      }
      const rel = existing[0]
      const tecRow = await sql`SELECT id FROM tecnicos_rarotec WHERE email = ${user.email} LIMIT 1`
      const ownTecId: number | null = tecRow.length > 0 ? Number(tecRow[0].id) : null
      const isCreator = rel.criado_por_id === user.id
      let isAssigned = ownTecId ? rel.tecnico_rarotec_id === ownTecId : false
      if (!isAssigned && ownTecId !== null && rel.tecnicos_rarotec_ids) {
        try {
          const ids = typeof rel.tecnicos_rarotec_ids === 'string' ? JSON.parse(rel.tecnicos_rarotec_ids) : rel.tecnicos_rarotec_ids
          if (Array.isArray(ids) && ids.map(Number).includes(ownTecId)) isAssigned = true
        } catch {}
      }
      if (!isCreator && !isAssigned) {
        return NextResponse.json({ error: "Sem permissão para alterar este relatório" }, { status: 403 })
      }
    }

    const data = await request.json()
    
    const result = await sql`
      UPDATE relatorios_visitas SET
        tecnico_rarotec_id = ${data.tecnico_rarotec_id || null},
        cliente_id = ${data.cliente_id || null},
        tecnico_cliente_id = ${data.tecnico_cliente_id || null},
        data_visita = ${data.data_visita},
        hora_inicio = ${data.hora_inicio || null},
        hora_fim = ${data.hora_fim || null},
        tipo_servico = ${data.tipo_servico || null},
        descricao_servico = ${data.descricao_servico || null},
        observacoes = ${data.observacoes || null},
        status = ${data.status || "pendente"},
        assinatura_url = ${data.assinatura_url || null},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    
    if (result.length === 0) {
      return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 })
    }
    
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Erro ao atualizar relatório:", error)
    return NextResponse.json({ error: "Erro ao atualizar relatório" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem excluir relatórios" }, { status: 403 })
    }

    const { id } = await params
    await sql`DELETE FROM relatorios_visitas WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir relatório:", error)
    return NextResponse.json({ error: "Erro ao excluir relatório" }, { status: 500 })
  }
}
