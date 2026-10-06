import { sql } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getStorageFile } from "@/lib/storage"
import { getSession } from "@/lib/auth"


// GET /api/relatorios/anexos/[id] - Retorna o conteúdo do anexo (streaming)
// Para blobs privados, precisamos fazer o download server-side e retornar o conteúdo
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

    // Buscar anexo no banco
    const anexos = await sql<any>`
      SELECT * FROM relatorios_anexos WHERE id = ${parseInt(id)}
    `

    if (anexos.length === 0) {
      return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 })
    }

    const anexo = anexos[0]
    const fileRef = anexo.url || anexo.nome_arquivo

    if (fileRef && (fileRef.startsWith("http://") || fileRef.startsWith("https://"))) {
      try {
        const response = await fetch(fileRef, {
          headers: {
            ...(process.env.BLOB_READ_WRITE_TOKEN && {
              Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
            }),
          },
        })
        if (response.ok) {
          const blob = await response.blob()
          return new NextResponse(blob, {
            headers: {
              "Content-Type": anexo.tipo_arquivo || "application/octet-stream",
              "Content-Disposition": `inline; filename="${anexo.nome_arquivo}"`,
              "Content-Length": String(blob.size),
            },
          })
        }
      } catch (e) {
        console.warn("Erro ao buscar URL remota do anexo:", e)
      }
    }

    const stored = await getStorageFile(fileRef)
    if (!stored) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
    }

    return new NextResponse(stored.stream, {
      headers: {
        "Content-Type": stored.contentType || anexo.tipo_arquivo || "application/octet-stream",
        "Content-Disposition": `inline; filename="${anexo.nome_arquivo}"`,
        ...(stored.contentLength ? { "Content-Length": String(stored.contentLength) } : {}),
      },
    })
  } catch (error) {
    console.error("Erro ao buscar anexo:", error)
    return NextResponse.json({ error: "Erro ao buscar anexo" }, { status: 500 })
  }
}
