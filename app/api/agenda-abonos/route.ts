import { sql } from "@/lib/db"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"

// GET - Listar abonos
export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const abonos = await sql`
      SELECT * FROM agenda_abonos
      ORDER BY created_at DESC
    `
    return NextResponse.json(abonos)
  } catch (error) {
    console.error("Erro ao buscar abonos:", error)
    return NextResponse.json({ error: "Erro ao buscar abonos" }, { status: 500 })
  }
}

// POST - Criar abono
export async function POST(request: Request) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem abonar eventos" }, { status: 403 })
    }

    const body = await request.json()
    const { agenda_evento_id, tecnico_id, motivo } = body

    if (!agenda_evento_id || !tecnico_id) {
      return NextResponse.json(
        { error: "agenda_evento_id e tecnico_id são obrigatórios" },
        { status: 400 }
      )
    }

    const abonadoPor = user.nome

    const result = await sql`
      INSERT INTO agenda_abonos (agenda_evento_id, tecnico_id, motivo, abonado_por)
      VALUES (${agenda_evento_id}, ${tecnico_id}, ${motivo || 'Visita sem necessidade de relatório'}, ${abonadoPor})
      ON CONFLICT (agenda_evento_id, tecnico_id) 
      DO UPDATE SET motivo = ${motivo || 'Visita sem necessidade de relatório'}, abonado_por = ${abonadoPor}
      RETURNING *
    `

    const newAllowance = result[0]
    const [tRows, eRows] = await Promise.all([
      sql`SELECT nome FROM tecnicos_rarotec WHERE id = ${tecnico_id} LIMIT 1`,
      sql`SELECT titulo FROM agenda_trabalhista WHERE id = ${agenda_evento_id} LIMIT 1`,
    ])
    const tecName = String(tRows[0]?.nome || `Técnico #${tecnico_id}`)
    const eventTitle = String(eRows[0]?.titulo || `Evento #${agenda_evento_id}`)

    auditClient.log({
      category: "schedule",
      action: "schedule_allowance.created",
      severity: "INFO",
      actor: {
        type: "user",
        userId: String(user.id),
        name: user.nome,
        email: user.email,
        role: user.cargo,
      },
      targets: [
        {
          type: "schedule_allowance",
          id: `${agenda_evento_id}_${tecnico_id}`,
          label: `Abono: ${tecName} (${eventTitle})`,
        },
        {
          type: "schedule",
          id: String(agenda_evento_id),
          label: eventTitle,
        },
        {
          type: "technician",
          id: String(tecnico_id),
          label: tecName,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: {},
        after: newAllowance,
      },
      details: {
        agenda_evento_id,
        tecnico_id,
        tecnico_nome: tecName,
        evento_titulo: eventTitle,
        motivo: newAllowance.motivo,
        abonado_por: abonadoPor,
      },
    })

    return NextResponse.json(newAllowance)
  } catch (error) {
    console.error("Erro ao criar abono:", error)
    return NextResponse.json({ error: "Erro ao criar abono" }, { status: 500 })
  }
}

// DELETE - Remover abono
export async function DELETE(request: Request) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem remover abonos" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const agenda_evento_id = searchParams.get('agenda_evento_id')
    const tecnico_id = searchParams.get('tecnico_id')

    if (!agenda_evento_id || !tecnico_id) {
      return NextResponse.json(
        { error: "agenda_evento_id e tecnico_id são obrigatórios" },
        { status: 400 }
      )
    }

    const evId = parseInt(agenda_evento_id)
    const tecId = parseInt(tecnico_id)

    const existingRows = await sql`
      SELECT a.*, t.nome as tecnico_nome, e.titulo as evento_titulo 
      FROM agenda_abonos a 
      LEFT JOIN tecnicos_rarotec t ON a.tecnico_id = t.id 
      LEFT JOIN agenda_trabalhista e ON a.agenda_evento_id = e.id 
      WHERE a.agenda_evento_id = ${evId} AND a.tecnico_id = ${tecId} 
      LIMIT 1
    `
    const beforeAllowance = existingRows[0] || {}
    const tecName = String(beforeAllowance.tecnico_nome || `Técnico #${tecId}`)
    const eventTitle = String(beforeAllowance.evento_titulo || `Evento #${evId}`)

    await sql`
      DELETE FROM agenda_abonos 
      WHERE agenda_evento_id = ${evId} 
      AND tecnico_id = ${tecId}
    `

    auditClient.log({
      category: "schedule",
      action: "schedule_allowance.deleted",
      severity: "WARNING",
      actor: {
        type: "user",
        userId: String(user.id),
        name: user.nome,
        email: user.email,
        role: user.cargo,
      },
      targets: [
        {
          type: "schedule_allowance",
          id: `${evId}_${tecId}`,
          label: `Abono: ${tecName} (${eventTitle})`,
        },
        {
          type: "schedule",
          id: String(evId),
          label: eventTitle,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: beforeAllowance,
        after: {},
      },
      details: {
        agenda_evento_id: evId,
        tecnico_id: tecId,
        tecnico_nome: tecName,
        evento_titulo: eventTitle,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao remover abono:", error)
    return NextResponse.json({ error: "Erro ao remover abono" }, { status: 500 })
  }
}
