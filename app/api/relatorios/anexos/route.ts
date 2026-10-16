import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { putStorageFile } from "@/lib/storage"
import { getSession } from "@/lib/auth"
import { auditClient, getRequestContext } from "@/lib/audit"

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

    const parsedRelId = parseInt(relatorioId)
    const repRows = await sql`
      SELECT r.id, r.numero_autenticacao, r.cliente_id,
             COALESCE(c.nome_fantasia, c.razao_social, r.municipio, 'Local não informado') AS cliente_nome
      FROM relatorios_visitas r
      LEFT JOIN clientes c ON c.id = r.cliente_id
      WHERE r.id = ${parsedRelId}
      LIMIT 1
    `
    const rep = repRows[0]
    const clientName = String(rep?.cliente_nome || "Cliente")
    const reportLabel = `Laudo ${rep?.numero_autenticacao || "#" + parsedRelId} (${clientName})`

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
          ${parsedRelId},
          ${file.name},
          ${file.type},
          ${stored.pathname},
          ${file.size}
        )
        RETURNING *
      `

      anexosSalvos.push(result[0])
    }

    if (anexosSalvos.length > 0) {
      auditClient.log({
        category: "reports",
        action: "report.attachment_uploaded",
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
            type: "report",
            id: String(parsedRelId),
            label: reportLabel,
          },
          ...(rep?.cliente_id
            ? [{ type: "client", id: String(rep.cliente_id), label: clientName }]
            : []),
        ],
        context: getRequestContext(request),
        details: {
          relatorio_id: parsedRelId,
          numero_autenticacao: rep?.numero_autenticacao || null,
          cliente_id: rep?.cliente_id || null,
          cliente_nome: clientName,
          quantidade_arquivos: anexosSalvos.length,
          arquivos: anexosSalvos.map((a: any) => ({
            id: a.id,
            nome_arquivo: a.nome_arquivo,
            tipo_arquivo: a.tipo_arquivo,
            tamanho: a.tamanho,
          })),
        },
      })
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
