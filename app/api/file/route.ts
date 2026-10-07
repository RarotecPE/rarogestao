import { type NextRequest, NextResponse } from "next/server"
import { getStorageFile } from "@/lib/storage"
import { getSession, resolveTecnicoRarotecId } from "@/lib/auth"
import { isGestor } from "@/lib/permissions"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const pathname = request.nextUrl.searchParams.get("pathname")

    if (!pathname) {
      return NextResponse.json({ error: "Pathname não informado" }, { status: 400 })
    }

    // Proteção de dados médicos sensíveis (ASOs / laudos): apenas gestor ou o próprio titular
    const isMedicalDoc = pathname.includes("documentos-medicos") || pathname.includes("aso")
    if (isMedicalDoc && !isGestor(user.nome, user.cargo)) {
      const meuTecnicoId = await resolveTecnicoRarotecId(user)
      if (!meuTecnicoId) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
      }
      const belongsToUser = await sql`
        SELECT 1 FROM documentos_medicos 
        WHERE tecnico_rarotec_id = ${meuTecnicoId} 
          AND (url LIKE ${'%' + pathname} OR arquivo_url LIKE ${'%' + pathname})
        LIMIT 1
      `
      if (belongsToUser.length === 0) {
        return NextResponse.json({ error: "Acesso negado a este documento médico" }, { status: 403 })
      }
    }

    const ifNoneMatch = request.headers.get("if-none-match") ?? undefined
    const result = await getStorageFile(pathname, { ifNoneMatch })

    if (!result) {
      return new NextResponse("Arquivo não encontrado", { status: 404 })
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ...(result.etag ? { ETag: result.etag } : {}),
          "Cache-Control": "private, no-cache",
        },
      })
    }

    // Extrair nome do arquivo do pathname
    const filename = pathname.split("/").pop() || "arquivo"

    // Valores de header HTTP só aceitam ISO-8859-1. Nomes com acento (ex.: "Declaração.pdf"),
    // sobretudo em forma Unicode decomposta (NFD, padrão do macOS), quebram o header e geram erro 500.
    // Usamos o padrão RFC 5987: um filename ASCII de fallback + filename* codificado em UTF-8.
    const filenameAscii =
      filename
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "") // remove diacríticos
        .replace(/[^\x20-\x7e]/g, "_") // troca qualquer outro não-ASCII por _
        .replace(/["\\]/g, "_") || "arquivo"
    const filenameUtf8 = encodeURIComponent(filename)

    // Se download=1 for especificado, força download. Caso contrário, permite visualização inline (PDF/imagens).
    const forceDownload = request.nextUrl.searchParams.get("download") === "1"
    const dispositionType = forceDownload ? "attachment" : "inline"
    const contentDisposition = `${dispositionType}; filename="${filenameAscii}"; filename*=UTF-8''${filenameUtf8}`

    const headers: Record<string, string> = {
      "Content-Type": result.contentType || "application/octet-stream",
      "Content-Disposition": contentDisposition,
      "Cache-Control": "private, no-cache",
    }

    if (result.etag) {
      headers["ETag"] = result.etag
    }
    if (result.contentLength) {
      headers["Content-Length"] = String(result.contentLength)
    }

    return new NextResponse(result.stream, {
      headers,
    })
  } catch (error) {
    console.error("[Storage] Erro ao servir arquivo:", error)
    return NextResponse.json({ error: "Erro ao servir arquivo" }, { status: 500 })
  }
}

