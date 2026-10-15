import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isAdmin, isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"

async function requireGestor() {
  const user = await getSession()
  if (!user) return { response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) }
  if (!isGestor(user.nome, user.cargo)) return { response: NextResponse.json({ error: "Acesso negado" }, { status: 403 }) }
  return { user }
}

async function isTargetAdmin(id: number) {
  const rows = await sql<{ cargo: string | null }>`SELECT cargo FROM usuarios WHERE id = ${id} LIMIT 1`
  return rows[0]?.cargo?.toLowerCase() === "administrador"
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireGestor()
    if ("response" in auth) return auth.response

    const { id } = await params
    const usuarios = await sql`
      SELECT id, nexus_user_id, nexus_email, nome, email, cargo, ativo, apuracao_mensal, created_at, updated_at
      FROM usuarios
      WHERE id = ${parseInt(id)}
    `
    if (usuarios.length === 0) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }
    return NextResponse.json(usuarios[0])
  } catch (error) {
    console.error("Erro ao buscar usuário:", error)
    return NextResponse.json({ error: "Erro ao buscar usuário" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireGestor()
    if ("response" in auth) return auth.response

    const { id } = await params
    const parsedId = parseInt(id)
    const body = await request.json()
    const { nome, email, nexus_email, ativo, apuracao_mensal } = body
    if (!nome || !email) {
      return NextResponse.json({ error: "Nome e e-mail são obrigatórios." }, { status: 400 })
    }
    const nexusEmail = typeof nexus_email === "string" && nexus_email.trim() ? nexus_email.trim().toLowerCase() : null
    if (nexusEmail) {
      const existingNexusEmail = await sql`SELECT id FROM usuarios WHERE LOWER(nexus_email) = ${nexusEmail} AND id <> ${parsedId} LIMIT 1`
      if (existingNexusEmail.length > 0) {
        return NextResponse.json({ error: "E-mail do Nexus já vinculado a outro usuário." }, { status: 400 })
      }
    }
    if ((await isTargetAdmin(parsedId)) && !isAdmin(auth.user.cargo)) {
      return NextResponse.json({ error: "Apenas administradores podem editar administradores." }, { status: 403 })
    }

    const beforeResult = await sql`
      SELECT id, nexus_user_id, nexus_email, nome, email, cargo, ativo, apuracao_mensal, created_at, updated_at
      FROM usuarios
      WHERE id = ${parsedId}
      LIMIT 1
    `
    if (beforeResult.length === 0) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }
    const beforeUser = beforeResult[0]

    const result = await sql`
      UPDATE usuarios
      SET nexus_user_id = CASE WHEN COALESCE(nexus_email, '') <> COALESCE(${nexusEmail}, '') THEN NULL ELSE nexus_user_id END,
          nexus_email = ${nexusEmail},
          nome = ${nome}, email = ${email.toLowerCase()}, ativo = ${ativo},
          apuracao_mensal = COALESCE(${apuracao_mensal ?? null}, apuracao_mensal),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${parsedId}
      RETURNING id, nexus_user_id, nexus_email, nome, email, cargo, ativo, apuracao_mensal, created_at, updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }
    const updatedUser = result[0]

    auditClient.log({
      category: "users",
      action: "user.local_profile_updated",
      severity: "INFO",
      actor: {
        type: "user",
        userId: String(auth.user.id),
        name: auth.user.nome,
        email: auth.user.email,
        role: auth.user.cargo,
      },
      targets: [
        {
          type: "user",
          id: String(parsedId),
          label: `${updatedUser.nome} (${updatedUser.email})`,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: beforeUser,
        after: updatedUser,
      },
      details: {
        usuario_alvo_id: parsedId,
        usuario_alvo_nome: updatedUser.nome,
        usuario_alvo_email: updatedUser.email,
        cargo: updatedUser.cargo,
        ativo: updatedUser.ativo,
      },
    })

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error)
    return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireGestor()
    if ("response" in auth) return auth.response

    const { id } = await params
    const parsedId = parseInt(id)

    const beforeResult = await sql`
      SELECT id, nexus_user_id, nexus_email, nome, email, cargo, ativo, apuracao_mensal, created_at, updated_at
      FROM usuarios
      WHERE id = ${parsedId}
      LIMIT 1
    `
    if (beforeResult.length === 0) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }
    const beforeUser = beforeResult[0]

    if (await isTargetAdmin(parsedId) && !isAdmin(auth.user.cargo)) {
      return NextResponse.json({ error: "Apenas administradores podem excluir administradores." }, { status: 403 })
    }
    if (auth.user.id === parsedId) {
      return NextResponse.json({ error: "Você não pode excluir sua própria configuração local." }, { status: 400 })
    }

    await sql`DELETE FROM usuarios WHERE id = ${parsedId}`

    auditClient.log({
      category: "users",
      action: "user.local_profile_deleted",
      severity: "WARNING",
      actor: {
        type: "user",
        userId: String(auth.user.id),
        name: auth.user.nome,
        email: auth.user.email,
        role: auth.user.cargo,
      },
      targets: [
        {
          type: "user",
          id: String(parsedId),
          label: `${beforeUser.nome} (${beforeUser.email})`,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: beforeUser,
        after: {},
      },
      details: {
        usuario_alvo_id: parsedId,
        usuario_alvo_nome: beforeUser.nome,
        usuario_alvo_email: beforeUser.email,
        cargo: beforeUser.cargo,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir usuário:", error)
    return NextResponse.json({ error: "Erro ao excluir usuário" }, { status: 500 })
  }
}

