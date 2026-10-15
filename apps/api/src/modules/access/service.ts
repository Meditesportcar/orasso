// QR d'inscription (ARCHITECTURE.md § 3.1) : émis quand une candidature est retenue, révoqué (jamais supprimé) quand
// elle ne l'est plus. Pas de nouveau QR après un scan : un pass n'est remplacé que si la candidature, révoquée, est
// retenue de nouveau (correction de l'organisateur) ; l'ancien garde son motif. `replaced` : pass valide remplacé (clé révoquée).
import { randomUUID } from "node:crypto";
import { encodePassMessage, encodePassPayload, type PassRevokedReason } from "@orasso/shared";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import { accessPasses, applications, events, signingKeys } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { signing } from "../../lib/signing";
import { type Executor, type Tx, withTx } from "../../lib/tx";

export type PassRow = typeof accessPasses.$inferSelect;

/** Charge utile du QR (recalculée : le message est déterminé par kid, event_no et id). */
export function passPayload(pass: Pick<PassRow, "id" | "kid" | "signature">, eventNo: number): string {
  return encodePassPayload(encodePassMessage({ kid: pass.kid, eventNo, passId: pass.id }), pass.signature);
}

async function validPass(ex: Executor, applicationId: string) {
  return ex.query.accessPasses.findFirst({
    where: and(eq(accessPasses.applicationId, applicationId), isNull(accessPasses.revokedAt)),
  });
}

export const accessService = {
  /** Émet le pass d'une candidature retenue (idempotent : renvoie le pass valide s'il existe). */
  async issue(tx: Tx, app: { id: string; eventId: string; userId: string }): Promise<PassRow> {
    const existing = await validPass(tx, app.id);
    if (existing) return existing;
    await signing.ensureSynced();
    const event = await tx.query.events.findFirst({ where: eq(events.id, app.eventId), columns: { eventNo: true } });
    if (!event) throw notFound("Événement introuvable");
    const id = randomUUID();
    const { kid, signature } = signing.sign(
      encodePassMessage({ kid: signing.activeKid, eventNo: event.eventNo, passId: id }),
    );
    // Les pass déjà révoqués gardent leur motif (historique) ; `replaced` ne sert qu'à un pass valide remplacé
    // (réémission après la révocation d'une clé).
    const [row] = await tx
      .insert(accessPasses)
      .values({ id, applicationId: app.id, eventId: app.eventId, userId: app.userId, kid, signature, issuedAt: now() })
      .onConflictDoNothing()
      .returning();
    // Émission concurrente (deux lectures simultanées) : on garde celle qui est passée.
    const pass = row ?? (await validPass(tx, app.id));
    if (!pass) throw new Error("Pass non enregistré");
    return pass;
  },

  /**
   * Clé compromise (`pnpm --filter @orasso/api keys:revoke <kid>`) : la clé sort de `/keys`, de la synchro et de la
   * vérification serveur ; chaque pass valide signé avec elle est remplacé (`replaced`) par un pass signé avec la
   * clé active (le titulaire voit son nouveau QR ; le staff le reçoit à la synchro suivante). Refusé pour la clé active.
   */
  async revokeSigningKey(kid: number): Promise<{ reissued: number }> {
    if (kid === signing.activeKid) throw new Error(`La clé ${kid} est active : changer QR_SIGNING_ACTIVE_KID d'abord`);
    await signing.ensureSynced();
    return withTx(async (tx, after) => {
      const [key] = await tx.update(signingKeys).set({ revokedAt: now() }).where(eq(signingKeys.kid, kid)).returning();
      if (!key) throw notFound(`Clé ${kid} inconnue`);
      const exposed = await tx.query.accessPasses.findMany({
        where: and(eq(accessPasses.kid, kid), isNull(accessPasses.revokedAt)),
      });
      for (const pass of exposed) {
        await tx
          .update(accessPasses)
          .set({ revokedAt: now(), revokedReason: "replaced" })
          .where(and(eq(accessPasses.id, pass.id), isNull(accessPasses.revokedAt)));
        await this.issue(tx, { id: pass.applicationId, eventId: pass.eventId, userId: pass.userId });
      }
      const eventIds = [...new Set(exposed.map((p) => p.eventId))];
      after(() => {
        for (const eventId of eventIds) {
          const applicationIds = exposed.filter((p) => p.eventId === eventId).map((p) => p.applicationId);
          realtime.publish(`event:${eventId}:access`, "access.changed", { applicationIds });
        }
      });
      return { reissued: exposed.length };
    });
  },

  /** Révoque le pass valide d'une candidature (désistement, refus, annulation). */
  async revoke(tx: Tx, applicationId: string, reason: PassRevokedReason): Promise<PassRow | null> {
    const [row] = await tx
      .update(accessPasses)
      .set({ revokedAt: now(), revokedReason: reason })
      .where(and(eq(accessPasses.applicationId, applicationId), isNull(accessPasses.revokedAt)))
      .returning();
    return row ?? null;
  },

  /**
   * QR d'une candidature pour son titulaire (`GET /applications/:id/pass`), affiché dans l'appli et sur `/app/acces`.
   * Une candidature retenue sans pass (données antérieures au lot 06) en reçoit un à la lecture.
   */
  async mine(v: Viewer, applicationId: string) {
    const app = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
    if (!app || app.userId !== v.user.id) throw notFound("Candidature introuvable");
    const event = await db.query.events.findFirst({ where: eq(events.id, app.eventId) });
    if (!event) throw notFound("Événement introuvable");
    let pass =
      app.status === "accepted" ? await withTx((tx) => this.issue(tx, app)) : await latestPass(db, applicationId);
    if (!pass) throw notFound("Pas de QR pour cette candidature");
    if (pass.revokedAt && app.status === "accepted") pass = await withTx((tx) => this.issue(tx, app));
    const valid = !pass.revokedAt;
    return {
      applicationId: app.id,
      eventId: event.id,
      eventNo: event.eventNo,
      passId: pass.id,
      /** Texte du QR (version 6-M, mode alphanumérique) ; `null` si le pass est révoqué. */
      payload: valid ? passPayload(pass, event.eventNo) : null,
      issuedAt: pass.issuedAt.toISOString(),
      revokedAt: pass.revokedAt?.toISOString() ?? null,
      revokedReason: pass.revokedReason,
    };
  },
};

function latestPass(ex: Executor, applicationId: string) {
  return ex.query.accessPasses.findFirst({
    where: eq(accessPasses.applicationId, applicationId),
    orderBy: [desc(accessPasses.issuedAt)],
  });
}
