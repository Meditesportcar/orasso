// Outils d'octets sans dépendance (utilisables dans l'API, le site et l'appli hors ligne).

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const B32_INDEX = new Map([...B32].map((c, i) => [c, i]));

/** Base32 RFC 4648, majuscules, sans remplissage (jeu alphanumérique du QR). */
export function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(buffer << (5 - bits)) & 31];
  return out;
}

/** Décodage strict : `null` au moindre caractère hors alphabet ou bits de remplissage non nuls. */
export function base32Decode(text: string): Uint8Array | null {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const c of text) {
    const v = B32_INDEX.get(c);
    if (v === undefined) return null;
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  }
  // Encodage canonique seulement : les bits restants doivent être nuls et moins de 5.
  if (bits >= 5 || buffer !== 0) return null;
  return Uint8Array.from(out);
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64URL_INDEX = new Map([...B64URL].map((c, i) => [c, i]));

/** Base64url sans remplissage. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 6) {
      out += B64URL[(buffer >>> (bits - 6)) & 63];
      bits -= 6;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += B64URL[(buffer << (6 - bits)) & 63];
  return out;
}

export function base64UrlDecode(text: string): Uint8Array | null {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const c of text) {
    const v = B64URL_INDEX.get(c);
    if (v === undefined) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits >= 6 || buffer !== 0) return null;
  return Uint8Array.from(out);
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** uuid texte → 16 octets ; `null` si le format est invalide. */
export function uuidToBytes(uuid: string): Uint8Array | null {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) return null;
  return hexToBytes(uuid.replaceAll("-", ""));
}

export function bytesToUuid(bytes: Uint8Array): string {
  const h = bytesToHex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Comparaison en temps constant (longueurs publiques). */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
