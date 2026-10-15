import { AuditEnvelope } from './types';

/**
 * Normaliza um texto removendo acentos e convertendo para minúsculas.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Divide um texto em tokens de busca (palavras com 2 ou mais caracteres).
 */
export function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  const words = normalized.split(/[^a-z0-9_-]+/);
  return words.filter(w => w.length >= 2);
}

/**
 * Extrai todos os tokens de busca relevantes do envelope de auditoria.
 * Permite busca instantânea no MongoDB consolidado no RaroNexus.
 */
export function extractSearchTokens(
  envelope: Pick<AuditEnvelope, 'targets' | 'actor' | 'action' | 'category' | 'system'>
): string[] {
  const tokenSet = new Set<string>();

  // Tokens da Ação e Categoria
  tokenize(envelope.action).forEach(t => tokenSet.add(t));
  tokenize(envelope.category).forEach(t => tokenSet.add(t));
  tokenSet.add(normalizeText(envelope.system));

  // Tokens do Ator (quem executou)
  if (envelope.actor) {
    if (envelope.actor.name) tokenize(envelope.actor.name).forEach(t => tokenSet.add(t));
    if (envelope.actor.email) tokenize(envelope.actor.email).forEach(t => tokenSet.add(t));
    if (envelope.actor.role) tokenize(envelope.actor.role).forEach(t => tokenSet.add(t));
    if (envelope.actor.userId) tokenSet.add(normalizeText(String(envelope.actor.userId)));
  }

  // Tokens dos Alvos (Recursos impactados: Cliente, Contrato, Laudo, etc.)
  if (Array.isArray(envelope.targets)) {
    for (const target of envelope.targets) {
      if (target.id) tokenSet.add(normalizeText(String(target.id)));
      if (target.type) tokenSet.add(normalizeText(target.type));
      if (target.label) tokenize(target.label).forEach(t => tokenSet.add(t));
    }
  }

  return Array.from(tokenSet);
}

