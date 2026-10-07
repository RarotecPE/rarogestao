import { sql } from "@/lib/db"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"

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

    return NextResponse.json(result[0])
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

    await sql`
      DELETE FROM agenda_abonos 
      WHERE agenda_evento_id = ${parseInt(agenda_evento_id)} 
      AND tecnico_id = ${parseInt(tecnico_id)}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao remover abono:", error)
    return NextResponse.json({ error: "Erro ao remover abono" }, { status: 500 })
  }
}
