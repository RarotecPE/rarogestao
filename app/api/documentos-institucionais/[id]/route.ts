import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"
import { podeVerDocumento } from "@/lib/documentos-institucionais-access"

// GET /api/documentos-institucionais/[id] - retorna o documento se o usuario puder ve-lo
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })

  const { id } = await params
  const docId = parseInt(id)

  try {
    const rows = await sql<any>`SELECT * FROM documentos_institucionais WHERE id = ${docId}`
    if (rows.length === 0) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 })
    const doc = rows[0]
    if (!(await podeVerDocumento(user, doc))) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }
    return NextResponse.json(doc)
  } catch (error) {
    console.error("Error fetching documento_institucional:", error)
    return NextResponse.json({ error: "Erro ao buscar documento" }, { status: 500 })
  }
}

// DELETE /api/documentos-institucionais/[id] - apenas gestor
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas gestores podem excluir" }, { status: 403 })
  }

  const { id } = await params
  const docId = parseInt(id)

  try {
    const existing = await sql<any>`SELECT * FROM documentos_institucionais WHERE id = ${docId}`
    if (existing.length === 0) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 })
    const beforeDoc = existing[0]

    await sql`DELETE FROM documentos_institucionais WHERE id = ${docId}`

    auditClient.log({
      category: "documents",
      action: "institutional_document.deleted",
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
          id: String(docId),
          label: `${beforeDoc.titulo} (${beforeDoc.categoria})`,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: beforeDoc,
        after: {},
      },
      details: {
        titulo: beforeDoc.titulo,
        categoria: beforeDoc.categoria,
        setor: beforeDoc.setor,
        nome_arquivo: beforeDoc.nome_arquivo,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting documento_institucional:", error)
    return NextResponse.json({ error: "Erro ao excluir documento" }, { status: 500 })
  }
}
