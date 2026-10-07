import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"


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
      const existing = await sql`SELECT tecnico_rarotec_id FROM agenda_trabalhista WHERE id = ${id}`
      if (existing.length === 0) {
        return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
      }
      const tecUser = await sql`SELECT id FROM tecnicos_rarotec WHERE email = ${user.email} LIMIT 1`
      const tecId = tecUser.length > 0 ? tecUser[0].id : null
      if (!tecId || existing[0].tecnico_rarotec_id !== tecId) {
        return NextResponse.json({ error: "Sem permissão para alterar este evento" }, { status: 403 })
      }
    }

    const data = await request.json()
    
    // Tipos internos que não requerem cliente/local
    const tiposInternos = ['home_office', 'escritorio', 'folga', 'ferias', 'atestado', 'lic_maternidade', 'lic_paternidade', 'licenca_medica', 'suspensao', 'indisponivel', 'feriado']
    const tipoAtual = (data.tipo || '').toLowerCase().replace(/[- ]/g, '_')
    const isInterno = tiposInternos.includes(tipoAtual)
    
    // Se mudou para tipo interno, limpar cliente e local para evitar dados inconsistentes
    let titulo = data.titulo
    let clienteId = data.cliente_id || null
    let local = data.local || null
    
    if (isInterno) {
      // Para tipos internos, usar o nome do tipo como título se o título atual contém dados de visita
      const tituloLower = (titulo || '').toLowerCase()
      if (tituloLower.includes('visita') || tituloLower.includes('treinamento') || 
          tituloLower.includes('reuniao') || tituloLower.includes('implantacao') ||
          tituloLower.includes('processo')) {
        // Formatar o nome do tipo para exibição
        const nomesFormatados: Record<string, string> = {
          'home_office': 'Home-Office',
          'escritorio': 'Escritorio',
          'folga': 'Folga',
          'ferias': 'Ferias',
          'atestado': 'Atestado',
          'lic_maternidade': 'Lic. Maternidade',
          'lic_paternidade': 'Lic. Paternidade',
          'licenca_medica': 'Licenca Medica',
          'suspensao': 'Suspensao',
          'indisponivel': 'Indisponivel',
          'feriado': 'Feriado'
        }
        titulo = nomesFormatados[tipoAtual] || titulo
      }
      // Limpar cliente e local para tipos internos
      clienteId = null
      local = null
    }
    
    const result = await sql`
      UPDATE agenda_trabalhista SET
        tecnico_rarotec_id = ${data.tecnico_rarotec_id || null},
        cliente_id = ${clienteId},
        titulo = ${titulo},
        descricao = ${data.descricao || null},
        data_inicio = ${data.data_inicio},
        data_fim = ${data.data_fim || null},
        tipo = ${data.tipo || null},
        status = ${data.status || "agendado"},
        local = ${local},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    
    if (result.length === 0) {
      return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
    }
    
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Erro ao atualizar evento:", error)
    return NextResponse.json({ error: "Erro ao atualizar evento" }, { status: 500 })
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

    const { id } = await params

    if (!isGestor(user.nome, user.cargo)) {
      const existing = await sql`SELECT tecnico_rarotec_id FROM agenda_trabalhista WHERE id = ${id}`
      if (existing.length === 0) {
        return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 })
      }
      const tecUser = await sql`SELECT id FROM tecnicos_rarotec WHERE email = ${user.email} LIMIT 1`
      const tecId = tecUser.length > 0 ? tecUser[0].id : null
      if (!tecId || existing[0].tecnico_rarotec_id !== tecId) {
        return NextResponse.json({ error: "Sem permissão para excluir este evento" }, { status: 403 })
      }
    }

    await sql`DELETE FROM agenda_trabalhista WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir evento:", error)
    return NextResponse.json({ error: "Erro ao excluir evento" }, { status: 500 })
  }
}
