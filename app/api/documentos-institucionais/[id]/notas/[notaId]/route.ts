import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"

// DELETE /api/documentos-institucionais/[id]/notas/[notaId]
// Gestor pode remover a propria nota.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; notaId: string }> },
) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Acesso restrito a gestores" }, { status: 403 })
  }

  const { id: docIdStr, notaId } = await params
  const id = parseInt(notaId)

  try {
    const existing = await sql`
      SELECT n.*, d.titulo AS documento_titulo, d.categoria AS documento_categoria
      FROM documentos_institucionais_notas n
      LEFT JOIN documentos_institucionais d ON d.id = n.documento_id
      WHERE n.id = ${id} AND n.autor_id = ${user.id}
    `
    if (existing.length === 0) {
      return NextResponse.json({ error: "Nota nao encontrada ou sem permissao" }, { status: 404 })
    }
    const beforeNota = existing[0]
    const docTitle = beforeNota.documento_titulo
      ? `${beforeNota.documento_titulo} (${beforeNota.documento_categoria || "Documento"})`
      : `Documento #${docIdStr}`

    // Autor remove a propria nota
    await sql`
      DELETE FROM documentos_institucionais_notas
      WHERE id = ${id} AND autor_id = ${user.id}
    `

    auditClient.log({
      category: "documents",
      action: "institutional_note.deleted",
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
          type: "institutional_document",
          id: String(docIdStr),
          label: docTitle,
        },
      ],
      context: getRequestContext(request),
      details: {
        documento_id: docIdStr,
        documento_titulo: beforeNota.documento_titulo,
        nota_id: id,
        nota: beforeNota.nota,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting nota:", error)
    return NextResponse.json({ error: "Erro ao excluir nota" }, { status: 500 })
  }
}
