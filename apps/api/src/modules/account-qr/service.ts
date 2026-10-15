// QR de compte dynamique (ARCHITECTURE.md § 3.3, choix C21) : secret par compte transmis à l'appli au login,
// code HOTP de 60 s calculé hors ligne, vérifié ici par le pro (remise au lot 14).
import { createHmac, randomBytes } from "node:crypto";
import {
  ACCOUNT_QR_DIGITS,
  ACCOUNT_QR_STEP_SECONDS,
  type AccountQrSecret,
  type AccountQrVerify,
  decodeAccountQrPayload,
  type HmacSha1,
  matchAccountQrCounter,
} from "@orasso/shared";
import { eq, lt } from "drizzle-orm";

import { db } from "../../db/client";
import { accountQrUses, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";

/** Anti-rejeu : un code présenté une fois est refusé ensuite ; les traces sont purgées après 3 minutes. */
const USE_RETENTION_MS = 3 * 60_000;

export const hmacSha1: HmacSha1 = (key, message) => new Uint8Array(createHmac("sha1", key).update(message).digest());

function secretView(p: { accountQrSecret: Buffer; accountQrShortId: Buffer }): AccountQrSecret {
  return {
    secret: p.accountQrSecret.toString("base64url"),
    shortId: p.accountQrShortId.toString("base64url"),
    stepSeconds: ACCOUNT_QR_STEP_SECONDS,
    digits: ACCOUNT_QR_DIGITS,
  };
}

export const accountQrService = {
  /** `GET /me/account-qr-secret` : stocké par l'appli dans le trousseau sécurisé (expo-secure-store). */
  secret(v: Viewer): AccountQrSecret {
    return secretView(v.profile);
  },

  /** `POST /me/account-qr-secret/rotate` (« Sécurité et appareils ») : les anciens codes ne passent plus. */
  async rotate(v: Viewer): Promise<AccountQrSecret> {
    const [row] = await db
      .update(profiles)
      .set({ accountQrSecret: randomBytes(32) })
      .where(eq(profiles.userId, v.user.id))
      .returning();
    if (!row) throw new Error("Profil introuvable");
    return secretView(row);
  },

  /**
   * `POST /account-qr/verify` : pseudo et grade du porteur si le code est valide (fenêtres c−1, c, c+1) et jamais
   * présenté ; la remise du pro arrive au lot 14.
   */
  async verify(_v: Viewer, payload: string): Promise<AccountQrVerify> {
    const decoded = decodeAccountQrPayload(payload);
    if (!decoded) return { valid: false, reason: "malformed" };
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.accountQrShortId, Buffer.from(decoded.shortId)),
    });
    if (!profile) return { valid: false, reason: "unknown" };
    const t = now();
    const counter = matchAccountQrCounter(profile.accountQrSecret, decoded.code, t, hmacSha1);
    if (counter === null) return { valid: false, reason: "expired" };
    await db.delete(accountQrUses).where(lt(accountQrUses.usedAt, new Date(t.getTime() - USE_RETENTION_MS)));
    const [use] = await db
      .insert(accountQrUses)
      .values({ userId: profile.userId, counter, usedAt: t })
      .onConflictDoNothing()
      .returning();
    if (!use) return { valid: false, reason: "replayed" };
    return { valid: true, pseudo: profile.pseudo, grade: profile.grade, discount: null };
  },
};
