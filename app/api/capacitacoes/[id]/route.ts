import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"

// DELETE /api/capacitacoes/[id] - apenas gestor
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas gestores podem excluir" }, { status: 403 })
  }

  const { id } = await params
  const regId = parseInt(id)

  try {
    const existing = await sql`SELECT * FROM capacitacoes WHERE id = ${regId}`
    if (existing.length === 0) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 })
    const beforeTraining = existing[0]

    await sql`DELETE FROM capacitacoes WHERE id = ${regId}`

    auditClient.log({
      category: "trainings",
      action: "training.deleted",
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
          type: "training",
          id: String(regId),
          label: `${beforeTraining.titulo} (${beforeTraining.data_treinamento})`,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: beforeTraining,
        after: {},
      },
      details: {
        titulo: beforeTraining.titulo,
        data_treinamento: beforeTraining.data_treinamento,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting capacitacao:", error)
    return NextResponse.json({ error: "Erro ao excluir treinamento" }, { status: 500 })
  }
}
