import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor, canApuracaoMensal } from "@/lib/permissions"

// GET /api/apuracao/proximo-numero?modelo_id=&numero=
// Sem "numero": retorna o proximo numero sugerido (ultimo_numero + 1) do modelo.
// Com "numero": verifica se o numero informado ja foi usado por esse modelo (aviso).
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo) && !canApuracaoMensal(user.cargo, user.apuracao_mensal)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const modeloId = searchParams.get("modelo_id")
    const numeroParam = searchParams.get("numero")

    if (!modeloId) {
      return NextResponse.json({ error: "modelo_id obrigatorio" }, { status: 400 })
    }
    const modeloIdNum = parseInt(modeloId)

    // Verificacao de duplicidade para um numero especifico
    if (numeroParam) {
      const numero = parseInt(numeroParam)
      const usados = await sql`
        SELECT id, competencia, exercicio FROM apuracao_relatorios
        WHERE modelo_id = ${modeloIdNum} AND numero = ${numero}
        ORDER BY exercicio DESC
      `
      return NextResponse.json({
        numero,
        duplicado: usados.length > 0,
        usos: usados,
      })
    }

    // Proximo numero sugerido: maior entre ultimo_numero do modelo e o maior numero emitido
    const modelo = await sql`SELECT ultimo_numero FROM apuracao_modelos WHERE id = ${modeloIdNum}`
    const maxEmitido = await sql`
      SELECT COALESCE(MAX(numero), 0) AS max FROM apuracao_relatorios WHERE modelo_id = ${modeloIdNum}
    `
    const base = Math.max(
      Number(modelo[0]?.ultimo_numero || 0),
      Number(maxEmitido[0]?.max || 0),
    )
    return NextResponse.json({ proximo: base + 1 })
  } catch (error) {
    console.error("Erro ao calcular proximo numero:", error)
    return NextResponse.json({ error: "Erro ao calcular numero" }, { status: 500 })
  }
}
