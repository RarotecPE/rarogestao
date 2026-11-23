import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isOuveAtivo } from "@/lib/app-config"
import { canApuracaoMensal, isGestor } from "@/lib/permissions"
import { getAvisosDisponiveis, sanitizarAvisosOcultos } from "@/lib/central-avisos"
import {
  getCentralAvisosOcultos,
  setCentralAvisosOcultos,
} from "@/lib/central-avisos-prefs"

// GET /api/configuracoes/central-avisos
// Retorna as preferencias individuais da Central de Avisos do usuario autenticado.
export async function GET() {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const ocultos = await getCentralAvisosOcultos(user.id)
    return NextResponse.json({ ocultos })
  } catch (error) {
    console.error("Erro ao buscar preferencias da Central de Avisos:", error)
    return NextResponse.json(
      { error: "Erro ao buscar preferências da Central de Avisos" },
      { status: 500 },
    )
  }
}

// PUT /api/configuracoes/central-avisos
// Atualiza as preferencias da Central de Avisos apenas para o usuario autenticado.
export async function PUT(request: Request) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => null)
    if (!body || !Array.isArray(body.ocultos)) {
      return NextResponse.json({ error: "Campo ocultos inválido" }, { status: 400 })
    }

    const ouveAtivo = await isOuveAtivo()
    const disponiveis = getAvisosDisponiveis({
      isGestor: isGestor(user.nome, user.cargo),
      podeApuracao: canApuracaoMensal(user.cargo, user.apuracao_mensal),
      ouveAtivo,
    })
    const permitidos = new Set(disponiveis.map((item) => item.chave))

    const ocultosValidos = sanitizarAvisosOcultos(body.ocultos).filter((chave) =>
      permitidos.has(chave),
    )

    const saved = await setCentralAvisosOcultos(user.id, ocultosValidos)
    return NextResponse.json({ ocultos: saved })
  } catch (error) {
    console.error("Erro ao salvar preferencias da Central de Avisos:", error)
    return NextResponse.json(
      { error: "Erro ao salvar preferências da Central de Avisos" },
      { status: 500 },
    )
  }
}
