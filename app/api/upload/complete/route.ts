import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { assembleUploadChunks } from "@/lib/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "application/octet-stream",
]

const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
  ".csv",
  ".jpeg",
  ".jpg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".heic",
  ".mp4",
  ".mov",
  ".webm",
  ".mp3",
  ".wav",
]

// Limite total suportado para upload em partes: 100MB
const MAX_TOTAL_SIZE = 100 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const { uploadId, totalChunks, filename, folder, contentType, size } = body

    if (!uploadId || !totalChunks || !filename) {
      return NextResponse.json(
        { error: "uploadId, totalChunks e filename são obrigatórios" },
        { status: 400 }
      )
    }

    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(uploadId)) {
      return NextResponse.json({ error: "Identificador de upload inválido" }, { status: 400 })
    }

    const ext = "." + (String(filename).split(".").pop() || "").toLowerCase()
    const isMimeAllowed = ALLOWED_MIME_TYPES.includes(contentType)
    const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext)

    if (!isMimeAllowed && !isExtAllowed) {
      return NextResponse.json(
        { error: `Tipo de arquivo não permitido (${contentType || ext})` },
        { status: 400 }
      )
    }

    if (size && Number(size) > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { error: "Arquivo excede o limite máximo permitido (100MB)" },
        { status: 400 }
      )
    }

    const safeFolder = (String(folder || "anexos")).replace(/[^a-zA-Z0-9_-]/g, "") || "anexos"
    const timestamp = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const safeName = String(filename).replace(/[^a-zA-Z0-9.-]/g, "_")
    const pathname = `${safeFolder}/${timestamp}-${rand}-${safeName}`

    const result = await assembleUploadChunks(
      uploadId,
      Number(totalChunks),
      pathname,
      contentType || undefined
    )

    return NextResponse.json({
      pathname: result.pathname,
      filename,
      size: result.size,
    })
  } catch (error) {
    console.error("[Storage] Erro ao finalizar montagem do arquivo:", error)
    return NextResponse.json(
      { error: "Erro ao finalizar upload: " + (error instanceof Error ? error.message : "Erro desconhecido") },
      { status: 500 }
    )
  }
}

