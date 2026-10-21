import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"

// DELETE /api/tutoriais/[id] - apenas gestor
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas gestores podem excluir" }, { status: 403 })
  }

  const { id } = await params
  const regId = parseInt(id)

  try {
    const existing = await sql`SELECT * FROM tutoriais WHERE id = ${regId}`
    if (existing.length === 0) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 })
    const beforeTutorial = existing[0]

    await sql`DELETE FROM tutoriais WHERE id = ${regId}`

    auditClient.log({
      category: "tutorials",
      action: "tutorial.deleted",
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
          type: "tutorial",
          id: String(regId),
          label: `${beforeTutorial.titulo} (${beforeTutorial.data_tutorial})`,
        },
      ],
      context: getRequestContext(request),
      details: {
        titulo: beforeTutorial.titulo,
        data_tutorial: beforeTutorial.data_tutorial,
        hasAttachment: Boolean(beforeTutorial.blob_pathname || beforeTutorial.nome_arquivo),
        removedFilename: beforeTutorial.nome_arquivo || null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting tutorial:", error)
    return NextResponse.json({ error: "Erro ao excluir tutorial" }, { status: 500 })
  }
}
