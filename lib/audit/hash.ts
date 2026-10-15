import * as crypto from 'crypto';
import { AuditEnvelope } from './types';

/**
 * Ordena deterministicamente chaves de um objeto para serialização canônica.
 */
function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (obj instanceof Date) {
    return JSON.stringify(obj.toISOString());
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => (item === undefined ? 'null' : canonicalStringify(item))).join(',') + ']';
  }
  const rec = obj as Record<string, unknown>;
  const keys = Object.keys(rec)
    .filter(k => rec[k] !== undefined)
    .sort();
  const pairs = keys.map(
    k => JSON.stringify(k) + ':' + canonicalStringify(rec[k])
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Calcula o hash criptográfico SHA-256 de um evento de auditoria,
 * integrando a cadeia de integridade (Hash Chaining) com o hash anterior.
 */
export function calculateEventHash(
  envelope: Omit<AuditEnvelope, 'hash'> & { prevHash?: string }
): string {
  const content = [
    envelope.prevHash || 'ROOT_GENESIS_HASH',
    envelope.timestamp,
    envelope.system,
    envelope.action,
    envelope.severity,
    envelope.status,
    canonicalStringify(envelope.actor),
    canonicalStringify(envelope.targets),
    canonicalStringify(envelope.changes || []),
    canonicalStringify(envelope.details || {}),
  ].join('|');

  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Valida matematicamente se o hash gravado corresponde exatamente ao conteúdo do evento.
 */
export function verifyEventHash(envelope: AuditEnvelope): boolean {
  if (!envelope.hash) {
    return false;
  }
  const expected = calculateEventHash(envelope);
  return expected === envelope.hash;
}

