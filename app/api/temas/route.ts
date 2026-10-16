import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { auditClient, getRequestContext } from "@/lib/audit"


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const modulo = searchParams.get("modulo")
    
    if (modulo) {
      const temas = await sql`
        SELECT * FROM temas_relatorio 
        WHERE modulo = ${modulo} AND ativo = true
        ORDER BY nome ASC
      `
      return NextResponse.json(temas)
    }
    
    const temas = await sql`
      SELECT * FROM temas_relatorio WHERE ativo = true ORDER BY modulo, nome ASC
    `
    return NextResponse.json(temas)
  } catch (error) {
    console.error("Erro ao buscar temas:", error)
    return NextResponse.json({ error: "Erro ao buscar temas" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    
    const result = await sql`
      INSERT INTO temas_relatorio (nome, modulo, descricao)
      VALUES (${data.nome}, ${data.modulo || null}, ${data.descricao || null})
      RETURNING *
    `
    const createdTheme = result[0]
    const user = await getSession().catch(() => null)

    auditClient.log({
      category: "reports",
      action: "report.theme_created",
      severity: "INFO",
      actor: user
        ? {
            type: "user",
            userId: String(user.id),
            name: user.nome,
            email: user.email,
            role: user.cargo,
          }
        : { type: "system", systemName: "rarogestao" },
      targets: [
        {
          type: "report_theme",
          id: String(createdTheme.id),
          label: `${createdTheme.nome}${createdTheme.modulo ? ` (${createdTheme.modulo})` : ""}`,
        },
      ],
      context: getRequestContext(request),
      details: {
        id: createdTheme.id,
        nome: createdTheme.nome,
        modulo: createdTheme.modulo,
        descricao: createdTheme.descricao,
      },
    })
    
    return NextResponse.json(createdTheme, { status: 201 })
  } catch (error) {
    console.error("Erro ao criar tema:", error)
    return NextResponse.json({ error: "Erro ao criar tema" }, { status: 500 })
  }
}
