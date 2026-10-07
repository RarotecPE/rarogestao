import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"


// Gera numero de autenticacao unico
function gerarNumeroAutenticacao() {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `RAR-${timestamp}-${random}`
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const paramTecnicoId = searchParams.get("tecnico_id")
    const clienteId = searchParams.get("cliente_id")
    const status = searchParams.get("status")
    const dataInicio = searchParams.get("data_inicio")
    const dataFim = searchParams.get("data_fim")
    
    const userIsGestor = isGestor(user.nome, user.cargo)

    // Se o usuário não for gestor, restringir apenas aos seus próprios relatórios
    let ownTecnicoId: number | null = null
    if (!userIsGestor) {
      const tecRow = await sql`SELECT id FROM tecnicos_rarotec WHERE email = ${user.email} LIMIT 1`
      ownTecnicoId = tecRow.length > 0 ? Number(tecRow[0].id) : null
    }

    // Construir cláusula WHERE dinamicamente via SQL fragments
    let whereClause = sql`WHERE TRUE`

    if (!userIsGestor) {
      if (ownTecnicoId) {
        whereClause = sql`${whereClause} AND (r.tecnico_rarotec_id = ${ownTecnicoId} OR r.tecnicos_rarotec_ids::text LIKE ${'%' + ownTecnicoId + '%'} OR r.criado_por_id = ${user.id})`
      } else {
        whereClause = sql`${whereClause} AND r.criado_por_id = ${user.id}`
      }
    } else if (paramTecnicoId && !isNaN(parseInt(paramTecnicoId))) {
      const tecIdNum = parseInt(paramTecnicoId)
      whereClause = sql`${whereClause} AND (r.tecnico_rarotec_id = ${tecIdNum} OR r.tecnicos_rarotec_ids::text LIKE ${'%' + paramTecnicoId + '%'})`
    }

    if (clienteId && !isNaN(parseInt(clienteId))) {
      const cliIdNum = parseInt(clienteId)
      whereClause = sql`${whereClause} AND r.cliente_id = ${cliIdNum}`
    }

    if (status && status.trim() !== '') {
      whereClause = sql`${whereClause} AND r.status = ${status.trim()}`
    }

    if (dataInicio && /^\d{4}-\d{2}-\d{2}/.test(dataInicio)) {
      whereClause = sql`${whereClause} AND COALESCE(r.data_visita, r.data_relatorio)::date >= ${dataInicio.slice(0, 10)}::date`
    }

    if (dataFim && /^\d{4}-\d{2}-\d{2}/.test(dataFim)) {
      whereClause = sql`${whereClause} AND COALESCE(r.data_visita, r.data_relatorio)::date <= ${dataFim.slice(0, 10)}::date`
    }

    // Executar a consulta de relatórios filtrados e a lista de técnicos ativos em paralelo
    const [relatoriosRows, tecnicosRarotec] = await Promise.all([
      sql`
        SELECT r.id, r.numero_autenticacao, r.data_visita, r.tipo_servico, r.status,
          r.municipio, r.estado, r.orgao_atendido, r.descricao_servico, r.observacoes,
          r.hora_inicio, r.hora_fim, r.assinatura_url, r.modulos, r.tema,
          r.tecnicos_rarotec_ids, r.tecnicos_cliente_info, r.created_at,
          r.tecnico_rarotec_id, r.cliente_id, r.tecnico_cliente_id,
          t.nome as tecnico_nome,
          t.email as tecnico_email,
          c.nome_fantasia as cliente_nome,
          c.email as cliente_email,
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
        ${whereClause}
        ORDER BY r.data_visita DESC, r.created_at DESC
      `,
      sql`SELECT id, nome, email FROM tecnicos_rarotec WHERE ativo = true`
    ])
    
    // Indexar técnicos em Map para lookup O(1)
    const tecnicosMap = new Map<number, any>()
    for (const t of (tecnicosRarotec as any[])) {
      tecnicosMap.set(Number(t.id), t)
    }
    
    // Enriquecer relatórios com nomes dos técnicos
    let relatorios = (relatoriosRows as any[]).map((r: any) => {
      let tecnicosIds: number[] = []
      if (r.tecnicos_rarotec_ids) {
        try {
          tecnicosIds = typeof r.tecnicos_rarotec_ids === 'string' 
            ? JSON.parse(r.tecnicos_rarotec_ids) 
            : r.tecnicos_rarotec_ids
        } catch { tecnicosIds = [] }
      }
      
      const tecnicosNomes = Array.isArray(tecnicosIds)
        ? tecnicosIds.map((id: number) => tecnicosMap.get(Number(id))).filter(Boolean)
        : []
      
      // Parse tecnicos_cliente_info se existir
      let tecnicosClientesData: any[] = []
      if (r.tecnicos_cliente_info) {
        try {
          tecnicosClientesData = typeof r.tecnicos_cliente_info === 'string'
            ? JSON.parse(r.tecnicos_cliente_info)
            : r.tecnicos_cliente_info
        } catch { tecnicosClientesData = [] }
      }
      
      return {
        ...r,
        tecnicos_rarotec_nomes: tecnicosNomes,
        // Para exibição na tabela, usar primeiro técnico ou fallback
        tecnico_nome: tecnicosNomes.length > 0 
          ? tecnicosNomes.map((t: any) => t.nome).join(", ")
          : r.tecnico_nome || "-",
        // Emails dos técnicos para envio de email
        tecnico_email: tecnicosNomes.length > 0 
          ? tecnicosNomes.map((t: any) => t.email).filter(Boolean).join(", ")
          : r.tecnico_email || null,
        // Cliente ou município
        cliente_ou_municipio: r.cliente_nome || r.municipio || "Não informado",
        cliente_email: r.cliente_email || null,
        // Representantes do cliente (técnicos do cliente)
        representantes_cliente: Array.isArray(tecnicosClientesData)
          ? tecnicosClientesData.filter((tc: any) => tc && tc.nome)
          : []
      }
    })

    // Refino estrito de técnico se filtro foi solicitado
    if (paramTecnicoId && !isNaN(parseInt(paramTecnicoId))) {
      const tecIdNum = parseInt(paramTecnicoId)
      relatorios = relatorios.filter((r: any) => {
        if (r.tecnico_rarotec_id === tecIdNum) return true
        if (r.tecnicos_rarotec_ids) {
          try {
            const ids = typeof r.tecnicos_rarotec_ids === 'string'
              ? JSON.parse(r.tecnicos_rarotec_ids)
              : r.tecnicos_rarotec_ids
            if (Array.isArray(ids) && ids.map(Number).includes(tecIdNum)) return true
          } catch {}
        }
        return false
      })
    }
    
    return NextResponse.json(relatorios)
  } catch (error) {
    console.error("Erro ao buscar relatorios:", error)
    return NextResponse.json({ error: "Erro ao buscar relatorios" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const data = await request.json()

    // Validação: todo relatório precisa de um local (cliente OU município).
    // Evita registros salvos como "Local não informado".
    const temCliente = data.cliente_id != null
    const temMunicipio = typeof data.municipio === "string" && data.municipio.trim() !== ""
    if (!temCliente && !temMunicipio) {
      return NextResponse.json(
        { error: "Informe o cliente/entidade ou o município do atendimento." },
        { status: 400 },
      )
    }

    // Gera numero de autenticacao
    const numeroAutenticacao = gerarNumeroAutenticacao()
    
    // Se houver tecnicos_cliente_info e cliente_id, cadastrar automaticamente os técnicos que não existem
    if (data.tecnicos_cliente_info && data.cliente_id) {
      const tecnicosInfo = Array.isArray(data.tecnicos_cliente_info) 
        ? data.tecnicos_cliente_info 
        : []
      
      for (const tecnico of tecnicosInfo) {
        if (tecnico && tecnico.nome && tecnico.nome.trim() !== '') {
          // Verificar se já existe um técnico com esse nome para este cliente
          const existente = await sql`
            SELECT id FROM tecnicos_clientes 
            WHERE cliente_id = ${data.cliente_id} 
            AND LOWER(TRIM(nome)) = LOWER(TRIM(${tecnico.nome}))
            LIMIT 1
          `
          
          // Se não existe, cadastrar
          if (existente.length === 0) {
            await sql`
              INSERT INTO tecnicos_clientes (cliente_id, nome, cpf, email, ativo, created_at)
              VALUES (
                ${data.cliente_id},
                ${tecnico.nome.trim()},
                ${tecnico.cpf && tecnico.cpf.trim() !== '' ? tecnico.cpf.trim() : null},
                ${tecnico.email && tecnico.email.trim() !== '' ? tecnico.email.trim() : null},
                true,
                NOW()
              )
            `
          }
        }
      }
    }
    
    const result = await sql`
      INSERT INTO relatorios_visitas (
        tecnico_rarotec_id, cliente_id, tecnico_cliente_id,
        data_visita, hora_inicio, hora_fim, tipo_servico,
        descricao_servico, observacoes, status, assinatura_url,
        estado, municipio, orgao_atendido, modulos, 
        tecnicos_rarotec_ids, tema, data_relatorio, historico,
        numero_autenticacao, tecnicos_cliente_info,
        criado_por_id, criado_por_nome
      ) VALUES (
        ${data.tecnico_rarotec_id || null}, 
        ${data.cliente_id || null},
        ${data.tecnico_cliente_id || null}, 
        ${data.data_visita || data.data_relatorio},
        ${data.hora_inicio || null}, 
        ${data.hora_fim || null},
        ${data.tipo_servico || data.tema || null}, 
        ${data.descricao_servico || data.historico || null},
        ${data.observacoes || null}, 
        ${data.status || "pendente"},
        ${data.assinatura_url || null},
        ${data.estado || "PE"},
        ${data.municipio || null},
        ${data.orgao_atendido || null},
        ${data.modulos ? JSON.stringify(data.modulos) : null},
        ${data.tecnicos_rarotec_ids ? JSON.stringify(data.tecnicos_rarotec_ids) : null},
        ${data.tema || null},
        ${data.data_relatorio || data.data_visita},
        ${data.historico || data.descricao_servico || null},
        ${numeroAutenticacao},
        ${data.tecnicos_cliente_info ? JSON.stringify(data.tecnicos_cliente_info) : null},
        ${user.id},
        ${user.nome}
      )
      RETURNING *
    `
    
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Erro ao criar relatorio:", error)
    return NextResponse.json({ error: "Erro ao criar relatorio" }, { status: 500 })
  }
}
