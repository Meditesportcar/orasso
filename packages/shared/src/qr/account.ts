// QR de compte dynamique (ARCHITECTURE.md § 3.3, choix C21) : « OA1 » + base64url(identifiant court, 8 octets)
// + « . » + code HOTP à 8 chiffres (RFC 4226, HMAC-SHA1, compteur = minutes Unix). Se redessine toutes les 60 s,
// hors ligne ; une capture prêtée expire en 1 à 2 minutes.
import { base64UrlDecode, base64UrlEncode } from "./bytes";

export const ACCOUNT_QR_PREFIX = "OA1";
export const ACCOUNT_QR_STEP_SECONDS = 60;
export const ACCOUNT_QR_DIGITS = 8;
/** Fenêtres acceptées autour de la fenêtre courante (±60 s de dérive d'horloge). */
export const ACCOUNT_QR_DRIFT_STEPS = 1;
export const ACCOUNT_QR_SHORT_ID_LENGTH = 8;

/** HMAC-SHA1 fourni par la plateforme (API : node:crypto ; appli : @noble/hashes). */
export type HmacSha1 = (key: Uint8Array, message: Uint8Array) => Uint8Array;

export function accountQrCounter(now: Date): number {
  return Math.floor(now.getTime() / 1000 / ACCOUNT_QR_STEP_SECONDS);
}

/** Compteur sur 8 octets grand-boutiste (RFC 4226). */
export function counterBytes(counter: number): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32), false);
  view.setUint32(4, counter >>> 0, false);
  return out;
}

/** HOTP (RFC 4226) tronqué à 8 chiffres. */
export function hotp(secret: Uint8Array, counter: number, hmac: HmacSha1): string {
  return hotpFromDigest(hmac(secret, counterBytes(counter)));
}

/**
 * Code à partir du condensé HMAC-SHA1 déjà calculé : le navigateur n'a que WebCrypto, asynchrone ; il calcule le
 * condensé de `counterBytes(c)` puis appelle ceci (même troncature que `hotp`, lot 30).
 */
export function hotpFromDigest(h: Uint8Array): string {
  const offset = (h[h.length - 1] ?? 0) & 0x0f;
  const bin =
    (((h[offset] ?? 0) & 0x7f) << 24) |
    (((h[offset + 1] ?? 0) & 0xff) << 16) |
    (((h[offset + 2] ?? 0) & 0xff) << 8) |
    ((h[offset + 3] ?? 0) & 0xff);
  return String(bin % 10 ** ACCOUNT_QR_DIGITS).padStart(ACCOUNT_QR_DIGITS, "0");
}

export function encodeAccountQrPayload(shortId: Uint8Array, code: string): string {
  return `${ACCOUNT_QR_PREFIX}${base64UrlEncode(shortId)}.${code}`;
}

/** Charge utile affichée à l'instant `now` (appli, hors ligne). */
export function accountQrPayload(secret: Uint8Array, shortId: Uint8Array, now: Date, hmac: HmacSha1): string {
  return encodeAccountQrPayload(shortId, hotp(secret, accountQrCounter(now), hmac));
}

export function decodeAccountQrPayload(payload: string): { shortId: Uint8Array; code: string } | null {
  const text = payload.trim();
  if (!text.startsWith(ACCOUNT_QR_PREFIX)) return null;
  const [id, code] = text.slice(ACCOUNT_QR_PREFIX.length).split(".");
  if (!id || !code || !/^\d{8}$/.test(code)) return null;
  const shortId = base64UrlDecode(id);
  if (shortId?.length !== ACCOUNT_QR_SHORT_ID_LENGTH) return null;
  return { shortId, code };
}

/** Compteur dont le code correspond, parmi c−1, c, c+1 ; `null` sinon (code expiré ou faux). */
export function matchAccountQrCounter(secret: Uint8Array, code: string, now: Date, hmac: HmacSha1): number | null {
  const c = accountQrCounter(now);
  for (let d = -ACCOUNT_QR_DRIFT_STEPS; d <= ACCOUNT_QR_DRIFT_STEPS; d++) {
    if (hotp(secret, c + d, hmac) === code) return c + d;
  }
  return null;
}
