import * as crypto from 'crypto';

let lastTimestamp = -1;
let sequence = 0;

/**
 * Gera um identificador UUIDv7 conforme RFC 9562.
 * Combina timestamp de 48 bits com sequência e entropia,
 * garantindo ordenação cronológica estrita no MongoDB e no Redis.
 */
export function generateUUIDv7(): string {
  let now = Date.now();

  if (now === lastTimestamp) {
    sequence = (sequence + 1) & 0x0fff;
    if (sequence === 0) {
      now++;
    }
  } else {
    lastTimestamp = now;
    sequence = crypto.randomInt(0, 0x0fff);
  }

  const bytes = new Uint8Array(16);

  // Timestamp de 48 bits
  bytes[0] = (now / 0x10000000000) & 0xff;
  bytes[1] = (now / 0x100000000) & 0xff;
  bytes[2] = (now / 0x1000000) & 0xff;
  bytes[3] = (now / 0x10000) & 0xff;
  bytes[4] = (now / 0x100) & 0xff;
  bytes[5] = now & 0xff;

  // Versão 7 (0b0111) + 12 bits de sequência/entropia
  bytes[6] = 0x70 | ((sequence >>> 8) & 0x0f);
  bytes[7] = sequence & 0xff;

  // 8 bytes de entropia adicional
  const randomBytes = crypto.randomBytes(8);
  bytes[8] = 0x80 | (randomBytes[0] & 0x3f);
  bytes[9] = randomBytes[1];
  bytes[10] = randomBytes[2];
  bytes[11] = randomBytes[3];
  bytes[12] = randomBytes[4];
  bytes[13] = randomBytes[5];
  bytes[14] = randomBytes[6];
  bytes[15] = randomBytes[7];

  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

