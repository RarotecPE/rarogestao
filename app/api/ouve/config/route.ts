import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { getConfig, setConfig } from "@/lib/app-config"
import { auditClient, getRequestContext } from "@/lib/audit"

// GET /api/ouve/config -> { ativo: boolean }
// Publico: usado pelo botao de login e pela area externa.
export async function GET() {
  const ativo = (await getConfig("ouve_ativo")) === "true"
  return NextResponse.json({ ativo })
}

// PUT /api/ouve/config { ativo: boolean } -> apenas gestores
export async function PUT(request: Request) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }
  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas gestores podem alterar esta configuracao" }, { status: 403 })
  }

  const beforeAtivo = (await getConfig("ouve_ativo")) === "true"
  const { ativo } = await request.json()
  const novoAtivo = !!ativo
  await setConfig("ouve_ativo", novoAtivo ? "true" : "false", user.id)

  auditClient.log({
    category: "ombudsman",
    action: "ombudsman_channel.status_changed",
    severity: novoAtivo ? "INFO" : "WARNING",
    actor: {
      type: "user",
      userId: String(user.id),
      name: user.nome,
      email: user.email,
      role: user.cargo,
    },
    targets: [
      {
        type: "system_config",
        id: "ouve_ativo",
        label: "Canal de Ouvidoria (OuveRaroTec)",
      },
    ],
    context: getRequestContext(request),
    diff: {
      before: { ativo: beforeAtivo },
      after: { ativo: novoAtivo },
    },
    details: {
      canal: "ouverarotec",
      statusAnterior: beforeAtivo ? "ativo" : "inativo",
      novoStatus: novoAtivo ? "ativo" : "inativo",
    },
  })

  return NextResponse.json({ ativo: novoAtivo })
}
