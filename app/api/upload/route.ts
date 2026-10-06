import { putStorageFile } from "@/lib/storage"
import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"

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
]

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const requestedFolder = (formData.get("folder") as string) || "anexos"
    const safeFolder = requestedFolder.replace(/[^a-zA-Z0-9_-]/g, "") || "anexos"

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 })
    }

    // Validar tipo de arquivo por MIME ou extensão (para compatibilidade com navegadores)
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase()
    const isMimeAllowed = ALLOWED_MIME_TYPES.includes(file.type)
    const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext)

    if (!isMimeAllowed && !isExtAllowed) {
      return NextResponse.json(
        { error: `Tipo de arquivo não permitido (${file.type || ext})` },
        { status: 400 }
      )
    }

    // Limitar tamanho (25MB)
    const MAX_SIZE = 25 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Arquivo muito grande (máximo 25MB)" },
        { status: 400 }
      )
    }

    // Gerar nome único e seguro
    const timestamp = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
    const pathname = `${safeFolder}/${timestamp}-${rand}-${safeName}`

    const result = await putStorageFile(pathname, file, {
      contentType: file.type || undefined,
    })

    return NextResponse.json({
      pathname: result.pathname,
      filename: file.name,
      size: file.size,
    })
  } catch (error) {
    console.error("[Storage] Erro no upload:", error)
    return NextResponse.json(
      { error: "Erro no upload: " + (error instanceof Error ? error.message : "Erro desconhecido") },
      { status: 500 }
    )
  }
}

