import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"

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
    await sql`DELETE FROM aditivos_contrato WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir aditivo:", error)
    return NextResponse.json({ error: "Erro ao excluir aditivo" }, { status: 500 })
  }
}
