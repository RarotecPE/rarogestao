export interface UploadResult {
  pathname: string
  filename: string
  size?: number
}

export interface UploadOptions {
  onProgress?: (percent: number) => void
}

// Limite seguro por requisição para a infraestrutura da Vercel (máx 4.5MB)
// Usamos 3.5MB para deixar margem para cabeçalhos e multipart boundaries.
const CHUNK_SIZE = 3.5 * 1024 * 1024

/**
 * Tenta comprimir imagens pesadas no navegador (ex.: fotos de 10-15MB de celulares)
 * antes do upload, preservando excelente resolução (até 2560px) com redução dramática de tamanho.
 */
async function compressImageIfNeeded(file: File): Promise<File> {
  // Apenas no browser, para imagens JPEG/PNG/WebP maiores que 2MB
  if (
    typeof window === "undefined" ||
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" ||
    file.size <= 2 * 1024 * 1024
  ) {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)
    const maxDim = 2560
    let { width, height } = bitmap

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width)
        width = maxDim
      } else {
        width = Math.round((width * maxDim) / height)
        height = maxDim
      }
    } else if (file.size <= 3.5 * 1024 * 1024) {
      // Se não precisa redimensionar e já cabe em 3.5MB, não precisa recomprimir
      return file
    }

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    )

    if (blob && blob.size < file.size) {
      const newName = file.name.replace(/\.[^.]+$/, ".jpg")
      return new File([blob], newName, { type: "image/jpeg" })
    }
  } catch (err) {
    console.warn("[Upload] Falha ao otimizar imagem no cliente, usando original:", err)
  }

  return file
}

/**
 * Extrai a mensagem de erro mais descritiva possível de uma Response HTTP.
 */
async function parseErrorMessage(response: Response, defaultMsg: string): Promise<string> {
  if (response.status === 413) {
    return "Arquivo muito grande para envio direto (limite de 4.5MB da plataforma Vercel)."
  }
  if (response.status === 401) {
    return "Sessão expirada ou não autorizada. Por favor, recarregue a página e faça login."
  }
  try {
    const text = await response.text()
    if (text) {
      try {
        const json = JSON.parse(text)
        if (json?.error) return json.error
        if (json?.message) return json.message
      } catch {
        // Se for HTML/texto da Vercel ou proxy
        if (text.length < 200 && !text.includes("<html")) {
          return text
        }
      }
    }
  } catch {
    // ignore
  }
  return `${defaultMsg} (HTTP ${response.status})`
}

/**
 * Envia um único chunk com até 3 tentativas em caso de instabilidade de rede.
 */
async function uploadChunkWithRetry(
  uploadId: string,
  chunkIndex: number,
  totalChunks: number,
  chunkBlob: Blob,
  maxRetries = 3
): Promise<void> {
  let attempt = 0
  let lastError: Error | null = null

  while (attempt < maxRetries) {
    attempt++
    try {
      const formData = new FormData()
      formData.append("chunk", chunkBlob)
      formData.append("uploadId", uploadId)
      formData.append("chunkIndex", String(chunkIndex))
      formData.append("totalChunks", String(totalChunks))

      const res = await fetch("/api/upload/chunk", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const msg = await parseErrorMessage(res, `Erro ao enviar parte ${chunkIndex + 1}/${totalChunks}`)
        throw new Error(msg)
      }

      return // Sucesso
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 600 * attempt))
      }
    }
  }

  throw lastError || new Error(`Falha após ${maxRetries} tentativas no envio da parte ${chunkIndex + 1}`)
}

/**
 * Realiza upload dividido em partes (chunked upload) para arquivos que ultrapassam
 * o limite de 4.5MB da Vercel, montando-os no servidor sem restrições.
 */
async function uploadFatiado(
  file: File,
  folder: string,
  options?: UploadOptions
): Promise<UploadResult> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  const rand = Math.random().toString(36).slice(2, 10)
  const uploadId = `upl_${Date.now()}_${rand}`

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const chunkBlob = file.slice(start, end)

    await uploadChunkWithRetry(uploadId, i, totalChunks, chunkBlob)

    if (options?.onProgress) {
      const percent = Math.min(95, Math.round(((i + 1) / totalChunks) * 90))
      options.onProgress(percent)
    }
  }

  // Finalização e montagem do arquivo completo no servidor
  const completeRes = await fetch("/api/upload/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadId,
      totalChunks,
      filename: file.name,
      folder,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  })

  if (!completeRes.ok) {
    const msg = await parseErrorMessage(completeRes, "Falha ao finalizar montagem do arquivo")
    throw new Error(msg)
  }

  const data = await completeRes.json()
  if (options?.onProgress) options.onProgress(100)

  return {
    pathname: data.pathname,
    filename: data.filename || file.name,
    size: data.size || file.size,
  }
}

/**
 * Faz upload de um arquivo para o armazenamento unificado (Cloudflare R2 / Vercel Blob / local).
 * - Arquivos até 3.5MB: envia diretamente em uma única requisição.
 * - Arquivos maiores (>3.5MB até 100MB): envia fatiado em partes (chunked), contornando
 *   completamente o limite de 4.5MB da infraestrutura Vercel.
 */
export async function uploadArquivo(
  rawFile: File,
  folder: string = "documentos",
  options?: UploadOptions
): Promise<UploadResult> {
  // 1. Tentar comprimir imagens no cliente se forem grandes
  const file = await compressImageIfNeeded(rawFile)

  // 2. Se for maior que 3.5MB, vai direto pelo fluxo de upload fatiado
  if (file.size > CHUNK_SIZE) {
    return uploadFatiado(file, folder, options)
  }

  // 3. Para arquivos menores (<= 3.5MB), envia na rota unificada padrão
  const formData = new FormData()
  formData.append("file", file)
  formData.append("folder", folder)

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  })

  // Se a rota padrão rejeitar por 413 (Payload Too Large), faz fallback transparente para upload fatiado
  if (response.status === 413) {
    return uploadFatiado(file, folder, options)
  }

  if (!response.ok) {
    const errorMsg = await parseErrorMessage(response, "Falha ao enviar arquivo")
    throw new Error(errorMsg)
  }

  const data = await response.json()
  if (options?.onProgress) options.onProgress(100)

  return {
    pathname: data.pathname,
    filename: data.filename || file.name,
    size: data.size || file.size,
  }
}
