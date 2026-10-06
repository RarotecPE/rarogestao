import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  const { id } = await params

  try {
    const tecnicos = await sql`
      SELECT * FROM tecnicos_rarotec WHERE id = ${parseInt(id)}
    `
    
    if (tecnicos.length === 0) {
      return NextResponse.json({ error: "Tecnico nao encontrado" }, { status: 404 })
    }

    // Carregar vinculos de clientes fixos (relatorio semanal unico)
    const fixos = await sql`
      SELECT cliente_id FROM tecnico_clientes_fixos WHERE tecnico_rarotec_id = ${parseInt(id)}
    `

    return NextResponse.json({
      ...tecnicos[0],
      clientes_fixos: fixos.map((f: any) => f.cliente_id),
    })
  } catch (error) {
    console.error("Error fetching tecnico:", error)
    return NextResponse.json({ error: "Erro ao buscar tecnico" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas gestores podem alterar técnicos" }, { status: 403 })
  }

  const { id } = await params

  try {
    const data = await request.json()
    const parsedId = parseInt(id)
    
    const primaryCargo = Array.isArray(data.cargos) && data.cargos.length > 0
      ? data.cargos[0]
      : (data.cargo || null)

    const result = await sql`
      UPDATE tecnicos_rarotec SET
        nome = ${data.nome},
        cpf = ${data.cpf || null},
        rg = ${data.rg || null},
        data_nascimento = ${data.data_nascimento || null},
        endereco = ${data.endereco || null},
        cidade = ${data.cidade || null},
        estado = ${data.estado || null},
        cep = ${data.cep || null},
        telefone = ${data.telefone || null},
        celular = ${data.celular || null},
        email = ${data.email ? data.email.trim().toLowerCase() : null},
        cargo = ${primaryCargo},
        cargos = ${data.cargos || []},
        data_admissao = ${data.data_admissao || null},
        setores = ${data.setores || []},
        foto_url = ${data.foto_url || null},
        ativo = ${data.ativo ?? true},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${parsedId}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "Tecnico nao encontrado" }, { status: 404 })
    }

    // Sincronizar vinculos de clientes fixos (relatorio semanal unico)
    if (Array.isArray(data.clientes_fixos)) {
      const tecnicoId = parseInt(id)
      const novos: number[] = data.clientes_fixos.map((c: any) => Number(c))
      // Remover os que nao estao mais na lista
      if (novos.length > 0) {
        await sql`
          DELETE FROM tecnico_clientes_fixos
          WHERE tecnico_rarotec_id = ${tecnicoId}
            AND cliente_id != ALL(${novos})
        `
      } else {
        await sql`
          DELETE FROM tecnico_clientes_fixos WHERE tecnico_rarotec_id = ${tecnicoId}
        `
      }
      // Inserir os novos
      for (const clienteId of novos) {
        await sql`
          INSERT INTO tecnico_clientes_fixos (tecnico_rarotec_id, cliente_id)
          VALUES (${tecnicoId}, ${clienteId})
          ON CONFLICT (tecnico_rarotec_id, cliente_id) DO NOTHING
        `
      }
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating tecnico:", error)
    return NextResponse.json({ error: "Erro ao atualizar tecnico" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  if (!isGestor(user.nome, user.cargo)) {
    return NextResponse.json({ error: "Apenas gestores podem excluir técnicos" }, { status: 403 })
  }

  const { id } = await params

  try {
    await sql`DELETE FROM tecnicos_rarotec WHERE id = ${parseInt(id)}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting tecnico:", error)
    return NextResponse.json({ error: "Erro ao excluir tecnico" }, { status: 500 })
  }
}
