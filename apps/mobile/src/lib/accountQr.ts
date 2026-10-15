// QR de compte dynamique (ARCHITECTURE.md § 3.3) : le code de 8 chiffres (HOTP, compteur = minutes Unix) se recalcule
// ici, sans réseau, toutes les 60 s, avec le secret reçu à la connexion (stockage : `accountQrStore.ts`).
import { hmac } from "@noble/hashes/hmac.js";
import { sha1 } from "@noble/hashes/legacy.js";
import { ACCOUNT_QR_STEP_SECONDS, type AccountQrSecret, accountQrPayload, type HmacSha1 } from "@orasso/shared";

export const hmacSha1: HmacSha1 = (key, message) => hmac(sha1, key, message);

const fromBase64Url = (value: string): Uint8Array => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

/** Ce que le QR de compte affiche à l'instant `now`. */
export function accountQrAt(secret: AccountQrSecret, now: Date): string {
  return accountQrPayload(fromBase64Url(secret.secret), fromBase64Url(secret.shortId), now, hmacSha1);
}

/** Secondes avant le prochain changement de code. */
export function secondsLeft(now: Date): number {
  return ACCOUNT_QR_STEP_SECONDS - (Math.floor(now.getTime() / 1000) % ACCOUNT_QR_STEP_SECONDS);
}
