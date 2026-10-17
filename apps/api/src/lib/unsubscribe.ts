// Lien de désinscription de la newsletter (lot 33) : identifiant du compte + HMAC, sans colonne ni session. Le secret
// `UNSUBSCRIBE_SECRET` est obligatoire en production ; en développement et en test, il est dérivé de BETTER_AUTH_SECRET.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../env";

const secret = () =>
  env.UNSUBSCRIBE_SECRET ?? createHash("sha256").update(`orasso-unsubscribe:${env.BETTER_AUTH_SECRET}`).digest("hex");

const sign = (userId: string) =>
  createHmac("sha256", secret()).update(`newsletter:${userId}`).digest("base64url").slice(0, 32);

export function unsubscribeToken(userId: string): string {
  return `${Buffer.from(userId).toString("base64url")}.${sign(userId)}`;
}

/** Identifiant du compte si le jeton est authentique, sinon `null` (comparaison à temps constant). */
export function verifyUnsubscribeToken(token: string): string | null {
  const [idPart, sig] = token.split(".");
  if (!idPart || !sig || token.length > 200) return null;
  const userId = Buffer.from(idPart, "base64url").toString();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return null;
  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null;
}

export function unsubscribeUrl(userId: string): string {
  return `${env.PUBLIC_URL}/desinscription/${unsubscribeToken(userId)}`;
}
