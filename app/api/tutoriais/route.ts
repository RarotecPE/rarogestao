import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"
import { normalizarPessoas, normalizarSetores, extensaoAceitaTutorial } from "@/lib/capacitacao"

// GET /api/tutoriais - lista todos os tutoriais (visivel a qualquer usuario logado)
export async function GET() {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  try {
    const rows = await sql`
      SELECT * FROM tutoriais
      ORDER BY data_tutorial DESC NULLS LAST, id DESC
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching tutoriais:", error)
    return NextResponse.json({ error: "Erro ao buscar tutoriais" }, { status: 500 })
  }
}

// POST /api/tutoriais - apenas gestor cria (anexo ja enviado ao Blob pelo cliente)
export async function POST(request: Request) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas gestores podem criar tutoriais" }, { status: 403 })
  }

  try {
    const data = await request.json()
    const titulo = String(data.titulo ?? "").trim()
    const dataTutorial = String(data.data_tutorial ?? "").trim()
    const responsaveis = normalizarPessoas(data.responsaveis)
    const setores = normalizarSetores(data.setores)
    const blobPathname = String(data.blob_pathname ?? "").trim()
    const nomeArquivo = String(data.nome_arquivo ?? "").trim()

    // Validacao dos campos obrigatorios (asterisco).
    if (!titulo) return NextResponse.json({ error: "Titulo do tutorial e obrigatorio" }, { status: 400 })
    if (responsaveis.length === 0)
      return NextResponse.json({ error: "Informe ao menos um responsavel" }, { status: 400 })
    if (setores.length === 0)
      return NextResponse.json({ error: "Informe ao menos um setor/departamento" }, { status: 400 })
    if (!dataTutorial) return NextResponse.json({ error: "Data do tutorial e obrigatoria" }, { status: 400 })
    if (!blobPathname) return NextResponse.json({ error: "Anexo (PDF ou Word) e obrigatorio" }, { status: 400 })
    if (nomeArquivo && !extensaoAceitaTutorial(nomeArquivo)) {
      return NextResponse.json({ error: "Anexo deve ser PDF ou Word (.pdf, .doc, .docx)" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO tutoriais (
        titulo, data_tutorial, responsaveis, setores,
        blob_pathname, nome_arquivo, tipo_arquivo, tamanho, observacoes,
        created_by, created_by_nome
      ) VALUES (
        ${titulo}, ${dataTutorial}, ${JSON.stringify(responsaveis)}::jsonb, ${setores},
        ${blobPathname}, ${nomeArquivo || null}, ${data.tipo_arquivo?.trim() || null},
        ${Number(data.tamanho) || null}, ${data.observacoes?.trim() || null},
        ${user.id}, ${user.nome}
      )
      RETURNING *
    `
    const createdTutorial = result[0]

    auditClient.log({
      category: "tutorials",
      action: "tutorial.created",
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
          type: "tutorial",
          id: String(createdTutorial.id),
          label: `${createdTutorial.titulo} (${createdTutorial.data_tutorial})`,
        },
      ],
      context: getRequestContext(request),
      details: {
        titulo: createdTutorial.titulo,
        data_tutorial: createdTutorial.data_tutorial,
        responsaveis,
        setores,
        hasAttachment: Boolean(createdTutorial.blob_pathname || createdTutorial.nome_arquivo),
        nome_arquivo: createdTutorial.nome_arquivo,
        storagePath: createdTutorial.blob_pathname || null,
      },
    })

    return NextResponse.json(createdTutorial, { status: 201 })
  } catch (error) {
    console.error("Error creating tutorial:", error)
    return NextResponse.json({ error: "Erro ao criar tutorial" }, { status: 500 })
  }
}
