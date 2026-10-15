import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession, resolveTecnicoRarotecId } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"
import { deleteStorageFile } from "@/lib/storage"

// PATCH /api/documentos-medicos/[id]
// Dois modos:
//  - action:"substituir_arquivo" -> gestor OU tecnico dono reenvia/troca o PDF.
//    Reseta o status para "pendente" (volta para a fila de validacao do gestor).
//  - validacao (status_validacao) -> apenas gestor valida/recusa.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  const { id } = await params
  const docId = parseInt(id)

  try {
    const body = await request.json()

    const docs = await sql<any>`SELECT * FROM documentos_medicos WHERE id = ${docId}`
    if (docs.length === 0) {
      return NextResponse.json({ error: "Documento nao encontrado" }, { status: 404 })
    }
    const doc = docs[0]
    const userIsGestor = isGestor(user.nome, user.cargo)

    // --- Modo 1: substituir/reenviar o arquivo (gestor ou tecnico dono) ---
    if (body.action === "substituir_arquivo") {
      const meuTecnicoId = await resolveTecnicoRarotecId(user)
      const isDono = meuTecnicoId && doc.tecnico_rarotec_id === meuTecnicoId
      if (!userIsGestor && !isDono) {
        return NextResponse.json({ error: "Sem permissao para alterar o documento" }, { status: 403 })
      }
      if (!body.blob_pathname) {
        return NextResponse.json({ error: "Arquivo obrigatorio" }, { status: 400 })
      }

      // Remove o arquivo antigo do blob, se existir e for diferente
      if (doc.blob_pathname && doc.blob_pathname !== body.blob_pathname) {
        try {
          await deleteStorageFile(doc.blob_pathname)
        } catch (e) {
          console.error("Erro ao remover blob antigo (seguindo):", e)
        }
      }

      const result = await sql`
        UPDATE documentos_medicos
        SET blob_pathname = ${body.blob_pathname},
            nome_arquivo = ${body.nome_arquivo || null},
            tipo_arquivo = ${body.tipo_arquivo || null},
            tamanho = ${body.tamanho || null},
            status_validacao = 'pendente',
            motivo_validacao = NULL,
            validado_por = NULL,
            validado_por_nome = NULL,
            validado_em = NULL
        WHERE id = ${docId}
        RETURNING *
      `

      auditClient.log({
        category: "medical_docs",
        action: "medical_doc.replaced",
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
            label: `${doc.tipo} #${docId}`,
          },
        ],
        context: getRequestContext(request),
        diff: {
          before: doc,
          after: result[0],
        },
        details: {
          documento_id: docId,
          tipo: doc.tipo,
          nome_arquivo: body.nome_arquivo,
        },
      })

      return NextResponse.json(result[0])
    }

    // --- Modo 2: validar/recusar (apenas gestor) ---
    if (!userIsGestor) {
      return NextResponse.json({ error: "Apenas gestores podem validar documentos" }, { status: 403 })
    }
    const { status_validacao, motivo } = body
    if (!["pendente", "validado", "recusado", "aguardando_tecnico"].includes(status_validacao)) {
      return NextResponse.json({ error: "status_validacao invalido" }, { status: 400 })
    }

    const result = await sql`
      UPDATE documentos_medicos
      SET status_validacao = ${status_validacao},
          motivo_validacao = ${motivo || null},
          validado_por = ${user.id},
          validado_por_nome = ${user.nome},
          validado_em = now()
      WHERE id = ${docId}
      RETURNING *
    `

    auditClient.log({
      category: "medical_docs",
      action: "medical_doc.aptitude_assessed",
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
          label: `${doc.tipo} #${docId}`,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: doc,
        after: result[0],
      },
      details: {
        documento_id: docId,
        tipo: doc.tipo,
        status_validacao,
        motivo,
      },
    })

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating documento_medico:", error)
    return NextResponse.json({ error: "Erro ao atualizar documento" }, { status: 500 })
  }
}

// DELETE /api/documentos-medicos/[id]
// Remove um documento (gestor pode qualquer um; tecnico apenas os proprios).
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  const { id } = await params
  const docId = parseInt(id)

  try {
    const docs = await sql<any>`SELECT * FROM documentos_medicos WHERE id = ${docId}`
    if (docs.length === 0) {
      return NextResponse.json({ error: "Documento nao encontrado" }, { status: 404 })
    }
    const doc = docs[0]

    const userIsGestor = isGestor(user.nome, user.cargo)
    const meuTecnicoId = await resolveTecnicoRarotecId(user)
    const isDono = meuTecnicoId && doc.tecnico_rarotec_id === meuTecnicoId
    if (!userIsGestor && !isDono) {
      return NextResponse.json({ error: "Sem permissao para remover" }, { status: 403 })
    }

    // Remover o arquivo do storage, se houver
    if (doc.blob_pathname) {
      try {
        await deleteStorageFile(doc.blob_pathname)
      } catch (e) {
        console.error("Erro ao remover blob (seguindo com delete do registro):", e)
      }
    }

    await sql`DELETE FROM documentos_medicos WHERE id = ${docId}`

    auditClient.log({
      category: "medical_docs",
      action: "medical_doc.deleted",
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
          type: "medical_doc",
          id: String(docId),
          label: `${doc.tipo} #${docId}`,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: doc,
        after: {},
      },
      details: {
        documento_id: docId,
        tipo: doc.tipo,
        nome_arquivo: doc.nome_arquivo,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting documento_medico:", error)
    return NextResponse.json({ error: "Erro ao remover documento" }, { status: 500 })
  }
}
