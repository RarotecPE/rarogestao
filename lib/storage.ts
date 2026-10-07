// Camada de armazenamento unificada (Cloudflare R2 / Vercel Blob / Local) - Sisgar
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { put as vercelBlobPut, get as vercelBlobGet, del as vercelBlobDel } from "@vercel/blob"
import fs from "node:fs/promises"
import { existsSync, createReadStream } from "node:fs"
import path from "node:path"
import { Readable } from "node:stream"

export interface StorageUploadResult {
  pathname: string
  url?: string
  contentType?: string
  size?: number
}

export interface StorageGetResult {
  stream: ReadableStream | Readable | any
  contentType: string
  etag?: string
  contentLength?: number
  statusCode?: number
}

const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET = process.env.R2_BUCKET || "rarobucket-homolog"
const R2_BASE_PREFIX = (process.env.R2_BASE_PREFIX || "sisgar").replace(/^\/+|\/+$/g, "")
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN

export const isR2Configured = Boolean(
  R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET
)

let s3Instance: S3Client | null = null

function getR2Client(): S3Client {
  if (!s3Instance) {
    s3Instance = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    })
  }
  return s3Instance
}

export function getR2Key(pathname: string): string {
  const clean = pathname.replace(/^\/+/, "")
  if (clean.startsWith(`${R2_BASE_PREFIX}/`)) {
    return clean
  }
  return `${R2_BASE_PREFIX}/${clean}`
}

/**
 * Valida e resolve um caminho seguro para armazenamento local dentro de .uploads/.
 * Previne ataques de Path Traversal (LFI / Directory Traversal).
 * Retorna o caminho absoluto resolvido se for válido e seguro dentro de .uploads, ou null se houver tentativa de traversal.
 */
export function getSafeLocalPath(pathname: string): string | null {
  if (!pathname || typeof pathname !== "string" || !pathname.trim()) {
    return null
  }

  // Tenta decodificar sequências URL encoded (ex: %2e%2e, %2f)
  let decoded = pathname
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    } catch {
      break
    }
  }

  // Rejeita explicitamente referências a diretório pai ('..') ou null bytes ('\0')
  if (decoded.includes("..") || decoded.includes("\0")) {
    return null
  }

  const localBase = path.resolve(process.cwd(), ".uploads")
  const localBaseWithSep = localBase.endsWith(path.sep) ? localBase : localBase + path.sep

  // Remove barras e contrabarras iniciais para garantir resolução estritamente relativa à base
  const sanitized = decoded.replace(/^[\/\\]+/, "").replace(/\//g, path.sep)
  const resolved = path.resolve(localBase, sanitized)

  // O caminho resolvido DEVE iniciar estritamente com o diretório raiz permitido (.uploads/)
  if (!resolved.startsWith(localBaseWithSep)) {
    return null
  }

  return resolved
}

/**
 * Upload a file to storage.
 * Strategy:
 * 1. Cloudflare R2 (primary)
 * 2. Vercel Blob (if token configured)
 * 3. Local disk (.uploads/) fallback
 */
export async function putStorageFile(
  pathname: string,
  body: Buffer | Uint8Array | Blob | File,
  options?: { contentType?: string }
): Promise<StorageUploadResult> {
  const contentType =
    options?.contentType ||
    (body instanceof Blob || (typeof File !== "undefined" && body instanceof File)
      ? (body as Blob).type
      : "application/octet-stream") ||
    "application/octet-stream"

  let buffer: Buffer
  if (Buffer.isBuffer(body)) {
    buffer = body
  } else if (body instanceof Uint8Array) {
    buffer = Buffer.from(body)
  } else if (body && typeof (body as any).arrayBuffer === "function") {
    buffer = Buffer.from(await (body as Blob).arrayBuffer())
  } else {
    buffer = Buffer.from(body as any)
  }

  // 1. Try Cloudflare R2
  if (isR2Configured) {
    const key = getR2Key(pathname)
    const client = getR2Client()
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    )
    return {
      pathname,
      contentType,
      size: buffer.length,
    }
  }

  // 2. Try Vercel Blob
  if (BLOB_TOKEN) {
    const blob = await vercelBlobPut(pathname, buffer, {
      access: "private",
      contentType,
      token: BLOB_TOKEN,
    })
    return {
      pathname: blob.pathname,
      url: blob.url,
      contentType,
      size: buffer.length,
    }
  }

  // 3. Fallback: Local filesystem (.uploads/)
  const filePath = getSafeLocalPath(pathname)
  if (!filePath) {
    throw new Error(`Caminho inválido ou inseguro para armazenamento local: ${pathname}`)
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, buffer)

  return {
    pathname,
    contentType,
    size: buffer.length,
  }
}

/**
 * Retrieve a file from storage.
 * Checks R2 first, then Vercel Blob (if configured), then local disk (.uploads/).
 */
export async function getStorageFile(
  pathname: string,
  options?: { ifNoneMatch?: string }
): Promise<StorageGetResult | null> {
  let cleanPath = pathname
  try {
    if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
      cleanPath = decodeURIComponent(new URL(pathname).pathname.replace(/^\/+/, ""))
    }
  } catch {}

  // 1. Try Cloudflare R2
  if (isR2Configured) {
    const client = getR2Client()
    const keysToTry = Array.from(new Set([
      getR2Key(cleanPath),
      cleanPath.replace(/^\/+/, ""),
      getR2Key(pathname),
      pathname.replace(/^\/+/, ""),
    ])).filter(Boolean)
    for (const key of keysToTry) {
      try {
        const res = await client.send(
          new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            IfNoneMatch: options?.ifNoneMatch,
          })
        )

        if (res.Body) {
          const stream =
            typeof (res.Body as any).transformToWebStream === "function"
              ? (res.Body as any).transformToWebStream()
              : (res.Body as any)
          return {
            stream,
            contentType: res.ContentType || "application/octet-stream",
            etag: res.ETag,
            contentLength: res.ContentLength,
          }
        }
      } catch (err: any) {
        if (err.name === "304" || err["$metadata"]?.httpStatusCode === 304) {
          return {
            stream: null,
            contentType: "application/octet-stream",
            statusCode: 304,
          }
        }
        if (err.name !== "NoSuchKey" && err["$metadata"]?.httpStatusCode !== 404) {
          console.warn(`[Storage] R2 get error for key ${key}:`, err?.message || err)
        }
      }
    }
  }

  // 2. Try Vercel Blob
  if (BLOB_TOKEN) {
    try {
      const result = await vercelBlobGet(pathname, {
        access: "private",
        token: BLOB_TOKEN,
        ifNoneMatch: options?.ifNoneMatch,
      })
      if (result) {
        if (result.statusCode === 304) {
          return {
            stream: null,
            contentType: "application/octet-stream",
            etag: result.blob.etag,
            statusCode: 304,
          }
        }
        return {
          stream: result.stream,
          contentType: result.blob.contentType,
          etag: result.blob.etag,
        }
      }
    } catch (err: any) {
      console.warn(`[Storage] Vercel Blob get error for ${pathname}:`, err?.message || err)
    }
  }

  // 3. Try Local filesystem (.uploads/)
  const candidates = cleanPath !== pathname ? [cleanPath, pathname] : [pathname]
  for (const candidate of candidates) {
    const filePath = getSafeLocalPath(candidate)
    if (filePath && existsSync(filePath)) {
      try {
        const stats = await fs.stat(filePath)
        const nodeStream = createReadStream(filePath)
        const webStream = Readable.toWeb(nodeStream)
        return {
          stream: webStream,
          contentType: getMimeTypeFromExt(filePath),
          contentLength: stats.size,
        }
      } catch (err) {
        console.warn(`[Storage] Local file read error for ${filePath}:`, err)
      }
    }
  }

  return null
}

/**
 * Retrieve a file from storage directly as a Node.js Buffer and detected content type.
 * Checks local filesystem, R2, and Vercel Blob.
 */
export async function getStorageFileBuffer(
  pathname: string
): Promise<{ buffer: Buffer; contentType?: string } | null> {
  try {
    let cleanPath = pathname
    try {
      if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
        cleanPath = decodeURIComponent(new URL(pathname).pathname.replace(/^\/+/, ""))
      }
    } catch {}

    // 1. Direct local file check
    for (const p of [cleanPath, pathname]) {
      const filePath = getSafeLocalPath(p)
      if (filePath && existsSync(filePath)) {
        const buffer = await fs.readFile(filePath)
        return {
          buffer,
          contentType: getMimeTypeFromExt(filePath),
        }
      }
    }

    // 2. Fetch via getStorageFile
    const result = (await getStorageFile(cleanPath)) || (await getStorageFile(pathname))
    if (!result || !result.stream) {
      return null
    }

    let buffer: Buffer | null = null
    const stream: any = result.stream

    // If Web ReadableStream
    if (typeof stream.getReader === "function") {
      const reader = stream.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
      }
      buffer = Buffer.concat(chunks)
    } else if (typeof stream.transformToByteArray === "function") {
      const bytes = await stream.transformToByteArray()
      buffer = Buffer.from(bytes)
    } else if (stream && typeof stream[Symbol.asyncIterator] === "function") {
      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      buffer = Buffer.concat(chunks)
    }

    if (!buffer) return null

    return {
      buffer,
      contentType: result.contentType || getMimeTypeFromExt(pathname),
    }
  } catch (err) {
    console.error(`[Storage] Error reading buffer for ${pathname}:`, err)
    return null
  }
}

/**
 * Delete a file from storage.
 */
export async function deleteStorageFile(pathname: string): Promise<void> {
  if (isR2Configured) {
    try {
      const client = getR2Client()
      await client.send(
        new DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: getR2Key(pathname),
        })
      )
    } catch (err) {
      console.warn(`[Storage] Error deleting R2 key for ${pathname}:`, err)
    }
  }

  if (BLOB_TOKEN) {
    try {
      await vercelBlobDel(pathname, { token: BLOB_TOKEN })
    } catch (err) {
      console.warn(`[Storage] Error deleting Vercel Blob for ${pathname}:`, err)
    }
  }

  const filePath = getSafeLocalPath(pathname)
  if (filePath && existsSync(filePath)) {
    try {
      await fs.unlink(filePath)
    } catch (err) {
      // ignore
    }
  }
}

function getMimeTypeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case ".pdf":
      return "application/pdf"
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".gif":
      return "image/gif"
    case ".webp":
      return "image/webp"
    case ".svg":
      return "image/svg+xml"
    case ".doc":
      return "application/msword"
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case ".xls":
      return "application/vnd.ms-excel"
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case ".csv":
      return "text/csv"
    case ".txt":
      return "text/plain"
    case ".mp4":
      return "video/mp4"
    case ".mp3":
      return "audio/mpeg"
    default:
      return "application/octet-stream"
  }
}

