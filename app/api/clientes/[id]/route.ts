import { sql } from "@/lib/db"
import { neon } from "@neondatabase/serverless"
import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { id } = await params
    const cliente = await sql`SELECT * FROM clientes WHERE id = ${id}`
    
    if (cliente.length === 0) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
    }
    
    return NextResponse.json(cliente[0])
  } catch (error) {
    console.error("Erro ao buscar cliente:", error)
    return NextResponse.json({ error: "Erro ao buscar cliente" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { id } = await params
    const data = await request.json()
    
    const result = await sql`
      UPDATE clientes SET
        razao_social = ${data.razao_social},
        nome_fantasia = ${data.nome_fantasia || null},
        cnpj = ${data.cnpj || null},
        inscricao_estadual = ${data.inscricao_estadual || null},
        endereco = ${data.endereco || null},
        cidade = ${data.cidade || null},
        estado = ${data.estado || null},
        cep = ${data.cep || null},
        telefone = ${data.telefone || null},
        email = ${data.email || null},
        website = ${data.website || null},
        logo_url = ${data.logo_url || null},
        observacoes = ${data.observacoes || null},
        ativo = ${data.ativo !== false},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    
    if (result.length === 0) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
    }
    
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Erro ao atualizar cliente:", error)
    return NextResponse.json({ error: "Erro ao atualizar cliente" }, { status: 500 })
  }
}

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
      return NextResponse.json({ error: "Apenas gestores podem excluir clientes" }, { status: 403 })
    }

    const { id } = await params
    const clienteId = Number(id)

    // Regra de negocio: clientes que ja foram utilizados no sistema NAO podem ser
    // excluidos, apenas inativados. Detectamos dinamicamente todas as tabelas que
    // referenciam `cliente_id` e verificamos se ha algum registro vinculado.
    const rawSql = neon(process.env.DATABASE_URL!)
    const tabelas = (await rawSql.query(
      `SELECT c.table_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.column_name = 'cliente_id'
         AND c.table_schema = 'public'
         AND t.table_type = 'BASE TABLE'`
    )) as { table_name: string }[]

    const tabelasComVinculo: string[] = []
    for (const { table_name } of tabelas) {
      // table_name vem do catalogo do banco (nao e entrada do usuario); seguro como identificador.
      const rows = (await rawSql.query(
        `SELECT 1 FROM "${table_name}" WHERE cliente_id = $1 LIMIT 1`,
        [clienteId]
      )) as unknown[]
      if (rows.length > 0) tabelasComVinculo.push(table_name)
    }

    if (tabelasComVinculo.length > 0) {
      return NextResponse.json(
        {
          error: "cliente_em_uso",
          message:
            "Este cliente ja foi utilizado no sistema e nao pode ser excluido. Ele pode apenas ser inativado.",
          tabelas: tabelasComVinculo,
        },
        { status: 409 }
      )
    }

    await sql`DELETE FROM clientes WHERE id = ${clienteId}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erro ao excluir cliente:", error)
    return NextResponse.json({ error: "Erro ao excluir cliente" }, { status: 500 })
  }
}
