import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const clienteId = searchParams.get("cliente_id")
    
    let contratos
    if (clienteId) {
      contratos = await sql`
        SELECT * FROM contratos 
        WHERE cliente_id = ${clienteId}
        ORDER BY data_inicio DESC
      `
    } else {
      contratos = await sql`
        SELECT c.*, cl.nome_fantasia as cliente_nome
        FROM contratos c
        LEFT JOIN clientes cl ON c.cliente_id = cl.id
        ORDER BY c.data_inicio DESC
      `
    }
    
    return NextResponse.json(contratos)
  } catch (error) {
    console.error("Erro ao buscar contratos:", error)
    return NextResponse.json({ error: "Erro ao buscar contratos" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem cadastrar contratos" }, { status: 403 })
    }

    const data = await request.json()
    
    const result = await sql`
      INSERT INTO contratos (
        cliente_id, orgao_id, numero_contrato, tipo, data_inicio, data_fim,
        valor_total, descricao, arquivo_url, status
      ) VALUES (
        ${data.cliente_id}, ${data.orgao_id || null}, ${data.numero_contrato}, ${data.tipo},
        ${data.data_inicio}, ${data.data_fim || null},
        ${data.valor_total || null}, ${data.descricao || null},
        ${data.arquivo_url || null}, ${data.status || "ativo"}
      )
      RETURNING *
    `
    
    const newContract = result[0]
    const clientRows = await sql`SELECT nome_fantasia, razao_social FROM clientes WHERE id = ${data.cliente_id} LIMIT 1`
    const clientName = String(clientRows[0]?.nome_fantasia || clientRows[0]?.razao_social || `Cliente #${data.cliente_id}`)

    auditClient.log({
      category: "contracts",
      action: "contract.created",
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
          type: "contract",
          id: String(newContract.id),
          label: `Contrato nº ${newContract.numero_contrato} (${clientName})`,
        },
        {
          type: "client",
          id: String(data.cliente_id),
          label: clientName,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: {},
        after: newContract,
      },
      details: {
        numero_contrato: newContract.numero_contrato,
        cliente_id: data.cliente_id,
        cliente_nome: clientName,
        tipo: newContract.tipo,
        valor_total: newContract.valor_total,
        data_inicio: newContract.data_inicio,
        data_fim: newContract.data_fim,
      },
    })
    
    return NextResponse.json(newContract, { status: 201 })
  } catch (error) {
    console.error("Erro ao criar contrato:", error)
    return NextResponse.json({ error: "Erro ao criar contrato" }, { status: 500 })
  }
}
