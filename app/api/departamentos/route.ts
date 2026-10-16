import { sql } from "@/lib/db"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { auditClient, getRequestContext } from "@/lib/audit"


export async function GET() {
  try {
    const departamentos = await sql`
      SELECT * FROM departamentos ORDER BY nome ASC
    `
    return NextResponse.json(departamentos)
  } catch (error) {
    console.error("Erro ao buscar departamentos:", error)
    return NextResponse.json({ error: "Erro ao buscar departamentos" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { nome } = await request.json()
    
    const result = await sql`
      INSERT INTO departamentos (nome)
      VALUES (${nome})
      ON CONFLICT (nome) DO NOTHING
      RETURNING *
    `
    
    if (result.length === 0) {
      const existing = await sql`SELECT * FROM departamentos WHERE nome = ${nome}`
      return NextResponse.json(existing[0])
    }

    const user = await getSession().catch(() => null)
    const createdDept = result[0]
    auditClient.log({
      category: "clients",
      action: "department.created",
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
          type: "department",
          id: String(createdDept.id),
          label: String(createdDept.nome),
        },
      ],
      context: getRequestContext(request),
      details: {
        id: createdDept.id,
        nome: createdDept.nome,
      },
    })
    
    return NextResponse.json(createdDept, { status: 201 })
  } catch (error) {
    console.error("Erro ao criar departamento:", error)
    return NextResponse.json({ error: "Erro ao criar departamento" }, { status: 500 })
  }
}
