import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { saveUploadChunk } from "@/lib/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Limite por chunk: 4MB (bem abaixo do teto de 4.5MB da Vercel)
const MAX_CHUNK_SIZE = 4 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const formData = await request.formData()
    const chunk = formData.get("chunk") as File | null
    const uploadId = (formData.get("uploadId") as string) || ""
    const chunkIndexStr = formData.get("chunkIndex") as string
    const totalChunksStr = formData.get("totalChunks") as string

    const chunkIndex = parseInt(chunkIndexStr, 10)
    const totalChunks = parseInt(totalChunksStr, 10)

    if (!chunk || !uploadId || Number.isNaN(chunkIndex) || Number.isNaN(totalChunks)) {
      return NextResponse.json(
        { error: "Parâmetros do chunk inválidos ou incompletos" },
        { status: 400 }
      )
    }

    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(uploadId)) {
      return NextResponse.json({ error: "Identificador de upload inválido" }, { status: 400 })
    }

    if (chunk.size > MAX_CHUNK_SIZE) {
      return NextResponse.json(
        { error: "Tamanho do chunk excede o limite permitido (4MB)" },
        { status: 400 }
      )
    }

    const arrayBuffer = await chunk.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    await saveUploadChunk(uploadId, chunkIndex, buffer)

    return NextResponse.json({ ok: true, chunkIndex })
  } catch (error) {
    console.error("[Storage] Erro ao salvar chunk:", error)
    return NextResponse.json(
      { error: "Erro ao processar parte do arquivo: " + (error instanceof Error ? error.message : "Erro desconhecido") },
      { status: 500 }
    )
  }
}

