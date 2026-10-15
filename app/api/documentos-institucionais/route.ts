import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession, resolveSetoresUsuario } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"
import { isCategoriaAta, isCategoriaValida } from "@/lib/documentos-institucionais"

// GET /api/documentos-institucionais?categoria=
// Regras de acesso (forcadas no servidor):
// - Docs institucionais (organograma/atribuicoes/regulamento/demais) e ata_geral: todos veem.
// - ata_setor: gestor ve todas; nao-gestor ve apenas as dos seus setores.
// - ata_individual: gestor ve todas; nao-gestor ve apenas as com usuario_alvo_id = ele.
export async function GET(request: Request) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const categoria = searchParams.get("categoria")
  const userIsGestor = isGestor(user.nome, user.cargo)

  try {
    // Base: seleciona colunas + contagem de notas (apenas relevante para gestor)
    let rows

    if (categoria === "ata_setor") {
      if (userIsGestor) {
        rows = await sql`
          SELECT d.*, (SELECT COUNT(*)::int FROM documentos_institucionais_notas n WHERE n.documento_id = d.id) AS total_notas
          FROM documentos_institucionais d
          WHERE d.categoria = 'ata_setor'
          ORDER BY d.data_documento DESC NULLS LAST, d.id DESC
        `
      } else {
        const setores = await resolveSetoresUsuario(user)
        if (setores.length === 0) return NextResponse.json([])
        rows = await sql`
          SELECT d.*
          FROM documentos_institucionais d
          WHERE d.categoria = 'ata_setor' AND d.setor = ANY(${setores})
          ORDER BY d.data_documento DESC NULLS LAST, d.id DESC
        `
      }
    } else if (categoria === "ata_individual") {
      if (userIsGestor) {
        rows = await sql`
          SELECT d.*, (SELECT COUNT(*)::int FROM documentos_institucionais_notas n WHERE n.documento_id = d.id) AS total_notas
          FROM documentos_institucionais d
          WHERE d.categoria = 'ata_individual'
          ORDER BY d.data_documento DESC NULLS LAST, d.id DESC
        `
      } else {
        rows = await sql`
          SELECT d.*
          FROM documentos_institucionais d
          WHERE d.categoria = 'ata_individual' AND d.usuario_alvo_id = ${user.id}
          ORDER BY d.data_documento DESC NULLS LAST, d.id DESC
        `
      }
    } else if (categoria && isCategoriaValida(categoria)) {
      // Categorias abertas a todos (docs institucionais + ata_geral)
      if (userIsGestor) {
        rows = await sql`
          SELECT d.*, (SELECT COUNT(*)::int FROM documentos_institucionais_notas n WHERE n.documento_id = d.id) AS total_notas
          FROM documentos_institucionais d
          WHERE d.categoria = ${categoria}
          ORDER BY d.data_documento DESC NULLS LAST, d.id DESC
        `
      } else {
        rows = await sql`
          SELECT d.*
          FROM documentos_institucionais d
          WHERE d.categoria = ${categoria}
          ORDER BY d.data_documento DESC NULLS LAST, d.id DESC
        `
      }
    } else {
      return NextResponse.json({ error: "Categoria invalida" }, { status: 400 })
    }

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching documentos_institucionais:", error)
    return NextResponse.json({ error: "Erro ao buscar documentos" }, { status: 500 })
  }
}

// POST /api/documentos-institucionais
// Docs institucionais: apenas gestor cria/gerencia.
// Atas: apenas gestor (coordenador/gerente/diretor/admin) cria.
export async function POST(request: Request) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas gestores podem criar documentos" }, { status: 403 })
  }

  try {
    const data = await request.json()
    const {
      categoria,
      titulo,
      descricao,
      blob_pathname,
      nome_arquivo,
      tipo_arquivo,
      tamanho,
      setor,
      usuario_alvo_id,
      usuario_alvo_nome,
      data_documento,
    } = data

    if (!categoria || !isCategoriaValida(categoria) || !titulo) {
      return NextResponse.json({ error: "Campos obrigatorios: categoria valida, titulo" }, { status: 400 })
    }
    if (categoria === "ata_setor" && !setor) {
      return NextResponse.json({ error: "Ata por setor requer o setor" }, { status: 400 })
    }
    if (categoria === "ata_individual" && !usuario_alvo_id) {
      return NextResponse.json({ error: "Ata individual requer o usuario alvo" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO documentos_institucionais (
        categoria, titulo, descricao, blob_pathname, nome_arquivo, tipo_arquivo, tamanho,
        setor, usuario_alvo_id, usuario_alvo_nome, data_documento, created_by, created_by_nome
      ) VALUES (
        ${categoria}, ${titulo}, ${descricao || null}, ${blob_pathname || null},
        ${nome_arquivo || null}, ${tipo_arquivo || null}, ${tamanho || null},
        ${categoria === "ata_setor" ? setor : null},
        ${categoria === "ata_individual" ? usuario_alvo_id : null},
        ${categoria === "ata_individual" ? usuario_alvo_nome || null : null},
        ${data_documento || null}, ${user.id}, ${user.nome}
      )
      RETURNING *
    `
    const createdDoc = result[0]

    auditClient.log({
      category: "documents",
      action: "institutional_document.published",
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
          id: String(createdDoc.id),
          label: `${createdDoc.titulo} (${createdDoc.categoria})`,
        },
      ],
      context: getRequestContext(request),
      details: {
        titulo: createdDoc.titulo,
        categoria: createdDoc.categoria,
        setor: createdDoc.setor,
        usuario_alvo_id: createdDoc.usuario_alvo_id,
        usuario_alvo_nome: createdDoc.usuario_alvo_nome,
        nome_arquivo: createdDoc.nome_arquivo,
        data_documento: createdDoc.data_documento,
      },
    })

    return NextResponse.json(createdDoc, { status: 201 })
  } catch (error) {
    console.error("Error creating documento_institucional:", error)
    return NextResponse.json({ error: "Erro ao criar documento" }, { status: 500 })
  }
}
