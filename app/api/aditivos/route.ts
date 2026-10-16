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
    const contratoId = searchParams.get("contrato_id")
    
    if (!contratoId) {
      return NextResponse.json({ error: "contrato_id é obrigatório" }, { status: 400 })
    }
    
    const aditivos = await sql`
      SELECT * FROM aditivos_contrato 
      WHERE contrato_id = ${contratoId}
      ORDER BY data_aditivo DESC
    `
    
    return NextResponse.json(aditivos)
  } catch (error) {
    console.error("Erro ao buscar aditivos:", error)
    return NextResponse.json({ error: "Erro ao buscar aditivos" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem cadastrar aditivos" }, { status: 403 })
    }

    const data = await request.json()
    
    const result = await sql`
      INSERT INTO aditivos_contrato (
        contrato_id, numero_aditivo, data_aditivo, descricao, valor_adicional, arquivo_url
      ) VALUES (
        ${data.contrato_id}, ${data.numero_aditivo}, ${data.data_aditivo},
        ${data.descricao || null}, ${data.valor_adicional || null}, ${data.arquivo_url || null}
      )
      RETURNING *
    `
    
    const newAmendment = result[0]
    const contractRows = await sql`
      SELECT c.numero_contrato, c.cliente_id, cl.nome_fantasia as cliente_nome, cl.razao_social as cliente_razao 
      FROM contratos c 
      LEFT JOIN clientes cl ON c.cliente_id = cl.id 
      WHERE c.id = ${data.contrato_id} 
      LIMIT 1
    `
    const contract = contractRows[0]
    const clientName = contract?.cliente_nome || contract?.cliente_razao || `Cliente #${contract?.cliente_id}`

    auditClient.log({
      category: "contracts",
      action: "contract.amendment_created",
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
          type: "contract_amendment",
          id: String(newAmendment.id),
          label: `Aditivo nº ${newAmendment.numero_aditivo} (Contrato nº ${contract?.numero_contrato})`,
        },
        {
          type: "contract",
          id: String(data.contrato_id),
          label: `Contrato nº ${contract?.numero_contrato} (${clientName})`,
        },
      ],
      context: getRequestContext(request),
      details: {
        contrato_id: data.contrato_id,
        numero_contrato: contract?.numero_contrato,
        cliente_id: contract?.cliente_id,
        cliente_nome: clientName,
        numero_aditivo: newAmendment.numero_aditivo,
        valor_adicional: newAmendment.valor_adicional,
        data_aditivo: newAmendment.data_aditivo,
      },
    })
    
    return NextResponse.json(newAmendment, { status: 201 })
  } catch (error) {
    console.error("Erro ao criar aditivo:", error)
    return NextResponse.json({ error: "Erro ao criar aditivo" }, { status: 500 })
  }
}
