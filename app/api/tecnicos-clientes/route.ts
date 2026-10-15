import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { auditClient, getRequestContext } from "@/lib/audit"


export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const clienteId = searchParams.get("cliente_id")
    
    let tecnicos
    if (clienteId) {
      tecnicos = await sql`
        SELECT tc.*, c.nome_fantasia as cliente_nome
        FROM tecnicos_clientes tc
        LEFT JOIN clientes c ON tc.cliente_id = c.id
        WHERE tc.cliente_id = ${clienteId}
        ORDER BY tc.nome ASC
      `
    } else {
      tecnicos = await sql`
        SELECT tc.*, c.nome_fantasia as cliente_nome
        FROM tecnicos_clientes tc
        LEFT JOIN clientes c ON tc.cliente_id = c.id
        ORDER BY tc.nome ASC
      `
    }
    
    return NextResponse.json(tecnicos)
  } catch (error) {
    console.error("Erro ao buscar técnicos-clientes:", error)
    return NextResponse.json({ error: "Erro ao buscar técnicos-clientes" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const data = await request.json()
    
    const result = await sql`
      INSERT INTO tecnicos_clientes (
        cliente_id, nome, cpf, cargo, departamento,
        telefone, celular, email, foto_url, ativo
      ) VALUES (
        ${data.cliente_id}, ${data.nome}, ${data.cpf || null},
        ${data.cargo || null}, ${data.departamento || null},
        ${data.telefone || null}, ${data.celular || null},
        ${data.email || null}, ${data.foto_url || null},
        ${data.ativo !== false}
      )
      RETURNING *
    `
    
    const createdTec = result[0]
    let clienteNome = "Cliente"
    if (data.cliente_id) {
      const cRows = await sql`SELECT COALESCE(nome_fantasia, razao_social) AS nome FROM clientes WHERE id = ${data.cliente_id}`
      if (cRows[0]?.nome) clienteNome = String(cRows[0].nome)
    }

    auditClient.log({
      category: "technicians",
      action: "client_technician.created",
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
          type: "client_technician",
          id: String(createdTec.id),
          label: `${createdTec.nome} (${clienteNome})`,
        },
      ],
      context: getRequestContext(request),
      details: {
        nome: createdTec.nome,
        cliente_id: createdTec.cliente_id,
        cliente_nome: clienteNome,
        cargo: createdTec.cargo,
        email: createdTec.email,
        departamento: createdTec.departamento,
        ativo: createdTec.ativo,
      },
    })

    return NextResponse.json(createdTec, { status: 201 })
  } catch (error) {
    console.error("Erro ao criar técnico-cliente:", error)
    return NextResponse.json({ error: "Erro ao criar técnico-cliente" }, { status: 500 })
  }
}
