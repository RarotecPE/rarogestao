export type SendNexusEmailInput = {
  to: string | string[]
  subject?: string
  body: string
  attachments?: Array<{
    filename: string
    content_type: "application/pdf"
    content_base64: string
  }>
  metadata?: Record<string, unknown>
}

export type SendNexusEmailResult = {
  success: boolean
  messageId?: string | null
}

/**
 * Envia um e-mail através da Central de E-mails do RaroNexus.
 * Utiliza o endpoint dinâmico configurado (padrão: "relatorio-visita" ou "send").
 */
export async function sendEmailViaNexus(
  input: SendNexusEmailInput,
  endpoint: string = "relatorio-visita"
): Promise<SendNexusEmailResult> {
  const nexusBaseUrl = process.env.RARONEXUS_BASE_URL || "http://localhost:3001"
  const clientId = process.env.RARONEXUS_CLIENT_ID || "sisgar"
  const clientSecret = process.env.RARONEXUS_CLIENT_SECRET

  if (!clientSecret) {
    throw new Error("RARONEXUS_CLIENT_SECRET não configurada.")
  }

  const recipients = Array.isArray(input.to) ? input.to : [input.to]
  if (recipients.length === 0) {
    throw new Error("Nenhum destinatário informado.")
  }

  const url = new URL(`/api/email/${endpoint}`, nexusBaseUrl)

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-RaroNexus-Client-Id": clientId,
      "X-RaroNexus-Client-Secret": clientSecret,
    },
    body: JSON.stringify({
      to: recipients,
      subject: input.subject,
      body: input.body,
      attachments: input.attachments,
      metadata: input.metadata,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.success) {
    const errorMsg =
      payload?.message ||
      payload?.error?.message ||
      `Erro ${response.status} ao enviar e-mail pelo RaroNexus.`
    throw new Error(errorMsg)
  }

  return {
    success: true,
    messageId: payload.data?.message_id ?? null,
  }
}
