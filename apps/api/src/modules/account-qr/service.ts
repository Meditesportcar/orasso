// QR de compte dynamique (ARCHITECTURE.md § 3.3, choix C21) : secret par compte transmis à l'appli au login,
// code HOTP de 60 s calculé hors ligne, vérifié ici par un pro, avec sa remise par grade (lot 14).
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
import { accountQrUses, proDiscountUses, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { forbidden } from "../../lib/errors";
import { rateAssertBelow, rateLimit, rateRecord } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { discountPercent, proOfUser } from "../pros/service";

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
   * `POST /account-qr/verify` : réservé aux comptes pro (fiche publiée). Pseudo, grade et remise du pro pour ce grade
   * si le code est valide (fenêtres c−1, c, c+1) et jamais présenté. Garde-fous (M5, lot 14) : limite par minute
   * (route), limite quotidienne, et les échecs (code inconnu, expiré, rejoué) sont comptés par vérificateur — au-delà
   * de 10 en 10 minutes, le vérificateur est bloqué même pour un code juste.
   */
  async verify(v: Viewer, payload: string): Promise<AccountQrVerify> {
    const pro = await proOfUser(v.user.id);
    if (!pro?.publishedAt) throw forbidden("Le lecteur de QR de compte est réservé aux professionnels (fiche publiée)");
    rateAssertBelow("accountQrFailure", v.user.id);
    rateLimit("accountQrDaily", v.user.id);
    const result = await this.check(payload, v.user.id, pro.id);
    if (!result.valid) rateRecord("accountQrFailure", v.user.id);
    return result;
  },

  async check(payload: string, verifierId: string, proId: string): Promise<AccountQrVerify> {
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
    // Remise du pro pour ce grade, comptée dans ses statistiques (jamais pour un scan de son propre compte).
    const percent = await discountPercent(proId, profile.grade);
    if (percent > 0 && profile.userId !== verifierId) {
      await db.insert(proDiscountUses).values({ proId, grade: profile.grade, percent, usedAt: t });
    }
    return {
      valid: true,
      pseudo: profile.pseudo,
      grade: profile.grade,
      discount: percent > 0 ? { percent } : null,
    };
  },
};
