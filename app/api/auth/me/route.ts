import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest, resolveTecnicoRarotecId } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const usuario = await getSessionFromRequest(request)

    if (!usuario) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const tecnicoRarotecId = await resolveTecnicoRarotecId(usuario)

    return NextResponse.json({
      id: usuario.id,
      nexus_user_id: usuario.nexus_user_id ?? null,
      nome: usuario.nome,
      email: usuario.email,
      avatar_url: usuario.avatar_url ?? null,
      cargo: usuario.cargo,
      cargos: usuario.cargo ? [usuario.cargo] : [],
      apuracao_mensal: usuario.apuracao_mensal ?? false,
      tecnico_rarotec_id: tecnicoRarotecId,
    })
  } catch (error) {
    console.error("Erro ao buscar usuário:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
