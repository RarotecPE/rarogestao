import { AuditEnvelope } from './types';

export const AUDIT_STREAM_KEY = 'audit_events_stream';
export const AUDIT_DLQ_KEY = 'audit_events_dlq';
export const MAX_STREAM_LEN = 100000;

/**
 * Publica um envelope de auditoria no stream do Upstash Redis (Airbag buffer)
 * utilizando o endpoint REST nativo de alta performance do Upstash.
 * Aplica retenção aproximada MAXLEN ~ 100.000 para proteção de cota.
 */
export async function pushAuditEventToQueue(envelope: AuditEnvelope): Promise<string> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL ou UPSTASH_REDIS_REST_TOKEN não configurados.');
  }

  const payload = JSON.stringify(envelope);

  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      [
        'XADD',
        AUDIT_STREAM_KEY,
        'MAXLEN',
        '~',
        MAX_STREAM_LEN,
        '*',
        '_id',
        envelope._id,
        'system',
        envelope.system,
        'severity',
        envelope.severity,
        'payload',
        payload,
      ],
    ]),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Falha ao enviar evento para fila Upstash: ${response.status} ${errorText}`);
  }

  const results = await response.json();
  const xaddResult = results?.[0]?.result;
  return typeof xaddResult === 'string' ? xaddResult : envelope._id;
}
