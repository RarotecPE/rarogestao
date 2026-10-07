import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { putStorageFile } from "@/lib/storage"
import { getSession } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll("files") as File[]
    const relatorioId = formData.get("relatorio_id") as string

    if (!relatorioId) {
      return NextResponse.json({ error: "relatorio_id é obrigatório" }, { status: 400 })
    }

    const anexosSalvos = []

    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
      const pathname = `relatorios/${relatorioId}/${Date.now()}-${safeName}`
      const stored = await putStorageFile(pathname, file, {
        contentType: file.type || undefined,
      })

      // Salvar referencia no banco
      const result = await sql`
        INSERT INTO relatorios_anexos (
          relatorio_id, nome_arquivo, tipo_arquivo, url, tamanho
        ) VALUES (
          ${parseInt(relatorioId)},
          ${file.name},
          ${file.type},
          ${stored.pathname},
          ${file.size}
        )
        RETURNING *
      `

      anexosSalvos.push(result[0])
    }

    return NextResponse.json(anexosSalvos, { status: 201 })
  } catch (error) {
    console.error("Erro ao fazer upload de anexos:", error)
    return NextResponse.json({ error: "Erro ao fazer upload" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const relatorioId = searchParams.get("relatorio_id")

    if (!relatorioId) {
      return NextResponse.json({ error: "relatorio_id é obrigatório" }, { status: 400 })
    }

    const anexos = await sql`
      SELECT * FROM relatorios_anexos 
      WHERE relatorio_id = ${parseInt(relatorioId)}
      ORDER BY created_at DESC
    `

    return NextResponse.json(anexos)
  } catch (error) {
    console.error("Erro ao buscar anexos:", error)
    return NextResponse.json({ error: "Erro ao buscar anexos" }, { status: 500 })
  }
}
