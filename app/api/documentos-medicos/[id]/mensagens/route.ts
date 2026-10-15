import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession, resolveTecnicoRarotecId } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"

// Verifica se o usuario pode acessar as mensagens do documento
// (gestor sempre; tecnico apenas se for o dono do documento).
async function podeAcessar(user: any, docId: number) {
  const docs = await sql`SELECT * FROM documentos_medicos WHERE id = ${docId}`
  if (docs.length === 0) return { ok: false, status: 404, doc: null }
  const doc = docs[0]
  const userIsGestor = isGestor(user.nome, user.cargo)
  if (userIsGestor) return { ok: true, doc, userIsGestor }
  const meuTecnicoId = await resolveTecnicoRarotecId(user)
  if (meuTecnicoId && doc.tecnico_rarotec_id === meuTecnicoId) {
    return { ok: true, doc, userIsGestor }
  }
  return { ok: false, status: 403, doc: null }
}

// GET /api/documentos-medicos/[id]/mensagens
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })

  const { id } = await params
  const docId = parseInt(id)

  const acesso = await podeAcessar(user, docId)
  if (!acesso.ok) {
    return NextResponse.json({ error: "Sem acesso" }, { status: acesso.status })
  }

  try {
    const mensagens = await sql`
      SELECT * FROM documentos_medicos_mensagens
      WHERE documento_id = ${docId}
      ORDER BY created_at ASC, id ASC
    `
    return NextResponse.json(mensagens)
  } catch (error) {
    console.error("Error fetching mensagens:", error)
    return NextResponse.json({ error: "Erro ao buscar mensagens" }, { status: 500 })
  }
}

// POST /api/documentos-medicos/[id]/mensagens
// Gestor: solicita esclarecimento. Tecnico dono: responde.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })

  const { id } = await params
  const docId = parseInt(id)

  const acesso = await podeAcessar(user, docId)
  if (!acesso.ok) {
    return NextResponse.json({ error: "Sem acesso" }, { status: acesso.status })
  }

  try {
    const { mensagem, anexo_pathname, anexo_nome } = await request.json()
    if (!mensagem || !mensagem.trim()) {
      return NextResponse.json({ error: "Mensagem obrigatoria" }, { status: 400 })
    }

    const papel = acesso.userIsGestor ? "gestor" : "tecnico"
    const result = await sql`
      INSERT INTO documentos_medicos_mensagens (
        documento_id, autor_id, autor_nome, autor_papel, mensagem, anexo_pathname, anexo_nome
      ) VALUES (
        ${docId}, ${user.id}, ${user.nome}, ${papel}, ${mensagem.trim()},
        ${anexo_pathname || null}, ${anexo_nome || null}
      )
      RETURNING *
    `

    // Atualiza o status para deixar claro de quem e a "bola da vez",
    // sem reabrir documentos ja validados.
    const statusAtual = acesso.doc?.status_validacao || "pendente"
    if (statusAtual !== "validado") {
      // Gestor pediu esclarecimento -> aguardando o tecnico responder/corrigir.
      // Tecnico respondeu -> volta para a fila de validacao do gestor.
      const novoStatus = papel === "gestor" ? "aguardando_tecnico" : "pendente"
      if (novoStatus !== statusAtual) {
        await sql`
          UPDATE documentos_medicos
          SET status_validacao = ${novoStatus}
          WHERE id = ${docId}
        `
      }
    }

    const createdMsg = result[0]

    auditClient.log({
      category: "medical_docs",
      action: "medical_doc.message_exchanged",
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
          type: "medical_doc",
          id: String(docId),
          label: `Doc Médico #${docId}`,
        },
      ],
      context: getRequestContext(request),
      details: {
        documento_id: docId,
        mensagem_id: createdMsg.id,
        autor_papel: papel,
        autor_nome: user.nome,
      },
    })

    return NextResponse.json(createdMsg, { status: 201 })
  } catch (error) {
    console.error("Error creating mensagem:", error)
    return NextResponse.json({ error: "Erro ao enviar mensagem" }, { status: 500 })
  }
}
