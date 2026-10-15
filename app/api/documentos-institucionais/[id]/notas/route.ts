import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"

// GET /api/documentos-institucionais/[id]/notas - APENAS gestores
// Notas/comentarios sao privados: visiveis somente a coordenadores/gerentes/diretores/admin.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Acesso restrito a gestores" }, { status: 403 })
  }

  const { id } = await params
  const docId = parseInt(id)

  try {
    const notas = await sql`
      SELECT * FROM documentos_institucionais_notas
      WHERE documento_id = ${docId}
      ORDER BY created_at ASC, id ASC
    `
    return NextResponse.json(notas)
  } catch (error) {
    console.error("Error fetching notas:", error)
    return NextResponse.json({ error: "Erro ao buscar notas" }, { status: 500 })
  }
}

// POST /api/documentos-institucionais/[id]/notas - APENAS gestores
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas gestores podem comentar" }, { status: 403 })
  }

  const { id } = await params
  const docId = parseInt(id)

  try {
    const { nota } = await request.json()
    if (!nota || !nota.trim()) {
      return NextResponse.json({ error: "Nota vazia" }, { status: 400 })
    }
    // Garante que o documento existe
    const doc = await sql`SELECT id FROM documentos_institucionais WHERE id = ${docId}`
    if (doc.length === 0) return NextResponse.json({ error: "Documento nao encontrado" }, { status: 404 })

    const result = await sql`
      INSERT INTO documentos_institucionais_notas (documento_id, autor_id, autor_nome, nota)
      VALUES (${docId}, ${user.id}, ${user.nome}, ${nota.trim()})
      RETURNING *
    `
    const createdNota = result[0]

    auditClient.log({
      category: "documents",
      action: "institutional_note.created",
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
          type: "institutional_document",
          id: String(docId),
          label: `Documento #${docId}`,
        },
      ],
      context: getRequestContext(request),
      details: {
        documento_id: docId,
        nota_id: createdNota.id,
        autor_id: user.id,
        autor_nome: user.nome,
      },
    })

    return NextResponse.json(createdNota, { status: 201 })
  } catch (error) {
    console.error("Error creating nota:", error)
    return NextResponse.json({ error: "Erro ao criar nota" }, { status: 500 })
  }
}
