import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"
import { isOuveAtivo } from "@/lib/app-config"

// POST /api/ouve/manifestacoes/[id]/respostas { mensagem }
// Gestor pode responder qualquer manifestacao; o autor (nao anonima) pode complementar a propria.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  if (!(await isOuveAtivo())) return NextResponse.json({ error: "Modulo inativo" }, { status: 403 })

  const { id } = await params
  const mid = parseInt(id)

  const rows = await sql`SELECT codigo, autor_id, tipo_sigilo FROM ouve_manifestacoes WHERE id = ${mid} LIMIT 1`
  if (rows.length === 0) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 })

  const userIsGestor = isGestor(user.nome, user.cargo)
  const ehAutor = rows[0].autor_id && rows[0].autor_id === user.id
  if (!userIsGestor && !ehAutor) {
    return NextResponse.json({ error: "Sem permissao para responder" }, { status: 403 })
  }

  const { mensagem } = await request.json()
  if (!mensagem?.trim()) return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 })

  const result = await sql`
    INSERT INTO ouve_respostas (manifestacao_id, autor_id, autor_nome, mensagem)
    VALUES (${mid}, ${user.id}, ${user.nome}, ${mensagem})
    RETURNING id, manifestacao_id, autor_id, autor_nome, mensagem, created_at
  `
  // Ao responder, marca como respondida (se gestor)
  if (userIsGestor) {
    await sql`UPDATE ouve_manifestacoes SET status = 'respondida' WHERE id = ${mid} AND status != 'encerrada'`
  }

  const createdResp = result[0]
  auditClient.log({
    category: "ombudsman",
    action: "ombudsman.answered",
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
        type: "ombudsman_complaint",
        id: String(mid),
        label: `Manifestação ${rows[0].codigo || '#' + mid}`,
      },
    ],
    context: getRequestContext(request),
    details: {
      manifestacao_id: mid,
      resposta_id: createdResp.id,
      autor_papel: userIsGestor ? "gestor" : "autor",
      autor_nome: user.nome,
    },
  })

  return NextResponse.json(createdResp)
}
