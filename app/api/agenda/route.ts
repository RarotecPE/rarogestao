import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"


export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const tecnicoId = searchParams.get("tecnico_id")
    const clienteId = searchParams.get("cliente_id")
    const dataInicio = searchParams.get("data_inicio")
    const dataFim = searchParams.get("data_fim")
    const mes = searchParams.get("mes") // formato: YYYY-MM
    
    // Se mes foi passado, converter para data_inicio e data_fim do mês
    let mesInicio: string | null = null
    let mesFim: string | null = null
    if (mes) {
      const [ano, mesNum] = mes.split("-")
      mesInicio = `${ano}-${mesNum}-01`
      // Último dia do mês
      const ultimoDia = new Date(parseInt(ano), parseInt(mesNum), 0).getDate()
      mesFim = `${ano}-${mesNum}-${String(ultimoDia).padStart(2, '0')}`
    }
    
    // Usar mes se disponível, senão usar dataInicio/dataFim
    const inicioFiltro = mesInicio || dataInicio
    const fimFiltro = mesFim || dataFim
    
    // Build base query with all filters using template literals
    let agenda
    
    if (tecnicoId && clienteId && inicioFiltro && fimFiltro) {
      agenda = await sql`
        SELECT a.*, 
          t.nome as tecnico_nome,
          c.nome_fantasia as cliente_nome,
          c.cidade as cliente_cidade,
          c.estado as cliente_estado
        FROM agenda_trabalhista a
        LEFT JOIN tecnicos_rarotec t ON a.tecnico_rarotec_id = t.id
        LEFT JOIN clientes c ON a.cliente_id = c.id
        WHERE a.tecnico_rarotec_id = ${parseInt(tecnicoId)}
          AND a.cliente_id = ${parseInt(clienteId)}
          AND a.data_inicio::date >= ${inicioFiltro}::date
          AND a.data_inicio::date <= ${fimFiltro}::date
        ORDER BY a.data_inicio DESC
      `
    } else if (tecnicoId && inicioFiltro && fimFiltro) {
      agenda = await sql`
        SELECT a.*, 
          t.nome as tecnico_nome,
          c.nome_fantasia as cliente_nome,
          c.cidade as cliente_cidade,
          c.estado as cliente_estado
        FROM agenda_trabalhista a
        LEFT JOIN tecnicos_rarotec t ON a.tecnico_rarotec_id = t.id
        LEFT JOIN clientes c ON a.cliente_id = c.id
        WHERE a.tecnico_rarotec_id = ${parseInt(tecnicoId)}
          AND a.data_inicio::date >= ${inicioFiltro}::date
          AND a.data_inicio::date <= ${fimFiltro}::date
        ORDER BY a.data_inicio DESC
      `
    } else if (clienteId && inicioFiltro && fimFiltro) {
      agenda = await sql`
        SELECT a.*, 
          t.nome as tecnico_nome,
          c.nome_fantasia as cliente_nome,
          c.cidade as cliente_cidade,
          c.estado as cliente_estado
        FROM agenda_trabalhista a
        LEFT JOIN tecnicos_rarotec t ON a.tecnico_rarotec_id = t.id
        LEFT JOIN clientes c ON a.cliente_id = c.id
        WHERE a.cliente_id = ${parseInt(clienteId)}
          AND a.data_inicio::date >= ${inicioFiltro}::date
          AND a.data_inicio::date <= ${fimFiltro}::date
        ORDER BY a.data_inicio DESC
      `
    } else if (inicioFiltro && fimFiltro) {
      agenda = await sql`
        SELECT a.*, 
          t.nome as tecnico_nome,
          c.nome_fantasia as cliente_nome,
          c.cidade as cliente_cidade,
          c.estado as cliente_estado
        FROM agenda_trabalhista a
        LEFT JOIN tecnicos_rarotec t ON a.tecnico_rarotec_id = t.id
        LEFT JOIN clientes c ON a.cliente_id = c.id
        WHERE a.data_inicio::date >= ${inicioFiltro}::date
          AND a.data_inicio::date <= ${fimFiltro}::date
        ORDER BY a.data_inicio DESC
      `
    } else if (tecnicoId) {
      agenda = await sql`
        SELECT a.*, 
          t.nome as tecnico_nome,
          c.nome_fantasia as cliente_nome,
          c.cidade as cliente_cidade,
          c.estado as cliente_estado
        FROM agenda_trabalhista a
        LEFT JOIN tecnicos_rarotec t ON a.tecnico_rarotec_id = t.id
        LEFT JOIN clientes c ON a.cliente_id = c.id
        WHERE a.tecnico_rarotec_id = ${parseInt(tecnicoId)}
        ORDER BY a.data_inicio DESC
      `
    } else if (clienteId) {
      agenda = await sql`
        SELECT a.*, 
          t.nome as tecnico_nome,
          c.nome_fantasia as cliente_nome,
          c.cidade as cliente_cidade,
          c.estado as cliente_estado
        FROM agenda_trabalhista a
        LEFT JOIN tecnicos_rarotec t ON a.tecnico_rarotec_id = t.id
        LEFT JOIN clientes c ON a.cliente_id = c.id
        WHERE a.cliente_id = ${parseInt(clienteId)}
        ORDER BY a.data_inicio DESC
      `
    } else {
      agenda = await sql`
        SELECT a.*, 
          t.nome as tecnico_nome,
          c.nome_fantasia as cliente_nome,
          c.cidade as cliente_cidade,
          c.estado as cliente_estado
        FROM agenda_trabalhista a
        LEFT JOIN tecnicos_rarotec t ON a.tecnico_rarotec_id = t.id
        LEFT JOIN clientes c ON a.cliente_id = c.id
        ORDER BY a.data_inicio DESC
      `
    }
    
    return NextResponse.json(agenda)
  } catch (error) {
    console.error("Erro ao buscar agenda:", error)
    return NextResponse.json({ error: "Erro ao buscar agenda" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const data = await request.json()
    
    const result = await sql`
      INSERT INTO agenda_trabalhista (
        tecnico_rarotec_id, cliente_id, titulo, descricao,
        data_inicio, data_fim, tipo, status, local
      ) VALUES (
        ${data.tecnico_rarotec_id || null}, ${data.cliente_id || null},
        ${data.titulo}, ${data.descricao || null},
        ${data.data_inicio}, ${data.data_fim || null},
        ${data.tipo || null}, ${data.status || "agendado"},
        ${data.local || null}
      )
      RETURNING *
    `
    
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Erro ao criar evento:", error)
    return NextResponse.json({ error: "Erro ao criar evento" }, { status: 500 })
  }
}
