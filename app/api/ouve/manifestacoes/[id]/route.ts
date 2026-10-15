import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"
import { isOuveAtivo } from "@/lib/app-config"

// GET /api/ouve/manifestacoes/[id] -> detalhe com anexos e respostas (visao interna)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }
  if (!(await isOuveAtivo())) {
    return NextResponse.json({ error: "Modulo inativo" }, { status: 403 })
  }

  const { id } = await params
  const mid = parseInt(id)
  const userIsGestor = isGestor(user.nome, user.cargo)

  try {
    const rows = await sql`SELECT * FROM ouve_manifestacoes WHERE id = ${mid} LIMIT 1`
    if (rows.length === 0) {
      return NextResponse.json({ error: "Nao encontrada" }, { status: 404 })
    }
    const m = { ...rows[0] }
    const ehAutor = m.autor_id && m.autor_id === user.id

    // Controle de acesso: nao-gestor so acessa abertas ou as proprias sigilosas.
    // Sigilosas de terceiros e anonimas sao restritas a gestores.
    if (!userIsGestor) {
      const permitido = m.tipo_sigilo === "identificavel_aberta" || ehAutor
      if (!permitido) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
      }
    }

    // Sanitizacao de identificacao
    if (m.tipo_sigilo === "anonima") {
      m.autor_id = null
      m.autor_nome = null
      m.autor_email = null
      m.autor_cargo = null
    } else if (m.tipo_sigilo === "identificavel_sigilosa" && !userIsGestor && !ehAutor) {
      m.autor_id = null
      m.autor_nome = null
      m.autor_email = null
      m.autor_cargo = null
    }

    const anexos = await sql`
      SELECT id, manifestacao_id, blob_pathname, nome_arquivo, tipo_arquivo, tamanho
      FROM ouve_anexos WHERE manifestacao_id = ${mid} ORDER BY id
    `
    const respostas = await sql`
      SELECT id, manifestacao_id, autor_id, autor_nome, mensagem, created_at
      FROM ouve_respostas WHERE manifestacao_id = ${mid} ORDER BY created_at
    `

    return NextResponse.json({ ...m, anexos, respostas, isGestor: userIsGestor })
  } catch (error) {
    console.error("Error fetching manifestacao detail:", error)
    return NextResponse.json({ error: "Erro ao buscar detalhe" }, { status: 500 })
  }
}

// PATCH /api/ouve/manifestacoes/[id] { status } -> apenas gestor
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas gestores" }, { status: 403 })
  }
  const { id } = await params
  const mid = parseInt(id)
  const { status } = await request.json()
  if (!["aberta", "em_analise", "respondida", "encerrada"].includes(status)) {
    return NextResponse.json({ error: "status invalido" }, { status: 400 })
  }

  const existingRows = await sql`SELECT * FROM ouve_manifestacoes WHERE id = ${mid} LIMIT 1`
  if (existingRows.length === 0) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 })
  const beforeManifestacao = existingRows[0]

  const result = await sql`
    UPDATE ouve_manifestacoes SET status = ${status} WHERE id = ${mid} RETURNING id, status
  `
  if (result.length === 0) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 })

  auditClient.log({
    category: "ombudsman",
    action: "ombudsman.status_changed",
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
        label: `Manifestação ${beforeManifestacao.codigo}`,
      },
    ],
    context: getRequestContext(request),
    diff: {
      before: beforeManifestacao,
      after: { ...beforeManifestacao, status },
    },
    details: {
      codigo: beforeManifestacao.codigo,
      status_anterior: beforeManifestacao.status,
      novo_status: status,
    },
  })

  return NextResponse.json(result[0])
}
