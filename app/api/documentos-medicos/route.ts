import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession, resolveTecnicoRarotecId } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"

// GET /api/documentos-medicos?tecnico_id=
// Gestor ve todos (ou filtra por tecnico_id); tecnico ve APENAS os proprios
// (o tecnico_id de um nao-gestor e sempre forcado para o da sessao no servidor).
export async function GET(request: Request) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const tecnicoIdParam = searchParams.get("tecnico_id")
  const userIsGestor = isGestor(user.nome, user.cargo)

  try {
    let documentos
    if (userIsGestor) {
      // Gestor: todos, ou filtrado por tecnico_id se informado
      const tecnicoId = tecnicoIdParam ? parseInt(tecnicoIdParam) : null
      if (tecnicoId) {
        documentos = await sql`
          SELECT d.*, t.nome AS tecnico_nome
          FROM documentos_medicos d
          LEFT JOIN tecnicos_rarotec t ON t.id = d.tecnico_rarotec_id
          WHERE d.tecnico_rarotec_id = ${tecnicoId}
          ORDER BY d.data_inicio DESC, d.id DESC
        `
      } else {
        documentos = await sql`
          SELECT d.*, t.nome AS tecnico_nome
          FROM documentos_medicos d
          LEFT JOIN tecnicos_rarotec t ON t.id = d.tecnico_rarotec_id
          ORDER BY d.data_inicio DESC, d.id DESC
        `
      }
    } else {
      // Nao-gestor: SEMPRE forcar o tecnico da sessao (ignora o parametro do cliente)
      const meuTecnicoId = await resolveTecnicoRarotecId(user)
      if (!meuTecnicoId) return NextResponse.json([])
      documentos = await sql`
        SELECT d.*, t.nome AS tecnico_nome
        FROM documentos_medicos d
        LEFT JOIN tecnicos_rarotec t ON t.id = d.tecnico_rarotec_id
        WHERE d.tecnico_rarotec_id = ${meuTecnicoId}
        ORDER BY d.data_inicio DESC, d.id DESC
      `
    }
    return NextResponse.json(documentos)
  } catch (error) {
    console.error("Error fetching documentos_medicos:", error)
    return NextResponse.json({ error: "Erro ao buscar documentos" }, { status: 500 })
  }
}

// POST /api/documentos-medicos
// Cria um documento medico (upload do arquivo ja feito via /api/upload; recebe pathname + metadados).
export async function POST(request: Request) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  try {
    const data = await request.json()
    const {
      tipo,
      data_inicio,
      data_fim,
      descricao,
      blob_pathname,
      nome_arquivo,
      tipo_arquivo,
      tamanho,
      agenda_evento_id,
    } = data

    // Nao-gestor so cria para o proprio tecnico; gestor pode informar tecnico_rarotec_id
    const userIsGestor = isGestor(user.nome, user.cargo)
    let tecnico_rarotec_id = data.tecnico_rarotec_id
    if (!userIsGestor) {
      const meuTecnicoId = await resolveTecnicoRarotecId(user)
      if (!meuTecnicoId) {
        return NextResponse.json({ error: "Usuario sem tecnico vinculado" }, { status: 403 })
      }
      tecnico_rarotec_id = meuTecnicoId
    }

    if (!tecnico_rarotec_id || !tipo || !data_inicio || !data_fim) {
      return NextResponse.json(
        { error: "Campos obrigatorios: tecnico_rarotec_id, tipo, data_inicio, data_fim" },
        { status: 400 },
      )
    }

    const result = await sql`
      INSERT INTO documentos_medicos (
        tecnico_rarotec_id, tipo, data_inicio, data_fim, descricao,
        blob_pathname, nome_arquivo, tipo_arquivo, tamanho, agenda_evento_id, created_by
      ) VALUES (
        ${tecnico_rarotec_id}, ${tipo}, ${data_inicio}, ${data_fim}, ${descricao || null},
        ${blob_pathname || null}, ${nome_arquivo || null}, ${tipo_arquivo || null},
        ${tamanho || null}, ${agenda_evento_id || null}, ${user.id}
      )
      RETURNING *
    `
    const createdDoc = result[0]
    const tecRows = await sql`SELECT nome FROM tecnicos_rarotec WHERE id = ${tecnico_rarotec_id}`
    const tecNome = tecRows[0]?.nome || "Técnico"

    auditClient.log({
      category: "medical_docs",
      action: "medical_doc.uploaded",
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
          id: String(createdDoc.id),
          label: `${createdDoc.tipo} - ${tecNome}`,
        },
      ],
      context: getRequestContext(request),
      details: {
        tipo: createdDoc.tipo,
        tecnico_id: tecnico_rarotec_id,
        tecnico_nome: tecNome,
        data_inicio: createdDoc.data_inicio,
        data_fim: createdDoc.data_fim,
        nome_arquivo: createdDoc.nome_arquivo,
      },
    })

    return NextResponse.json(createdDoc, { status: 201 })
  } catch (error) {
    console.error("Error creating documento_medico:", error)
    return NextResponse.json({ error: "Erro ao criar documento" }, { status: 500 })
  }
}
