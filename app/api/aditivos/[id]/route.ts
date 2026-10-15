import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { auditClient, getRequestContext } from "@/lib/audit"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    if (!isGestor(user.nome, user.cargo)) {
      return NextResponse.json({ error: "Apenas gestores podem excluir aditivos" }, { status: 403 })
    }

    const { id } = await params
    const existingRows = await sql`
      SELECT a.*, c.numero_contrato, c.cliente_id, cl.nome_fantasia as cliente_nome, cl.razao_social as cliente_razao 
      FROM aditivos_contrato a 
      LEFT JOIN contratos c ON a.contrato_id = c.id 
      LEFT JOIN clientes cl ON c.cliente_id = cl.id 
      WHERE a.id = ${id} 
      LIMIT 1
    `
    if (existingRows.length === 0) {
      return NextResponse.json({ error: "Aditivo não encontrado" }, { status: 404 })
    }
    const beforeAmendment = existingRows[0]
    const clientName = beforeAmendment.cliente_nome || beforeAmendment.cliente_razao || `Cliente #${beforeAmendment.cliente_id}`

    await sql`DELETE FROM aditivos_contrato WHERE id = ${id}`

    auditClient.log({
      category: "contracts",
      action: "contract.amendment_deleted",
      severity: "WARNING",
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
          id: String(id),
          label: `Aditivo nº ${beforeAmendment.numero_aditivo} (Contrato nº ${beforeAmendment.numero_contrato})`,
        },
        {
          type: "contract",
          id: String(beforeAmendment.contrato_id),
          label: `Contrato nº ${beforeAmendment.numero_contrato} (${clientName})`,
        },
      ],
      context: getRequestContext(request),
      diff: {
        before: beforeAmendment,
        after: {},
      },
      details: {
        contrato_id: beforeAmendment.contrato_id,
        numero_contrato: beforeAmendment.numero_contrato,
        cliente_id: beforeAmendment.cliente_id,
        cliente_nome: clientName,
        numero_aditivo: beforeAmendment.numero_aditivo,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir aditivo:", error)
    return NextResponse.json({ error: "Erro ao excluir aditivo" }, { status: 500 })
  }
}
