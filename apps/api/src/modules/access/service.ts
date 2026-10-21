// QR d'inscription (ARCHITECTURE.md § 3.1) : émis quand une candidature est retenue, révoqué (jamais supprimé) quand
// elle ne l'est plus. Pas de nouveau QR après un scan : un pass n'est remplacé que si la candidature, révoquée, est
// retenue de nouveau (correction de l'organisateur) ; l'ancien garde son motif. `replaced` : pass valide remplacé (clé révoquée).
// Lot 48 : chaque pass porte un secret (32 octets) pour le code tournant OR2 ; il part dans le kit du titulaire et dans
// la synchro du staff (vérification hors ligne), jamais ailleurs.
import { randomBytes, randomUUID } from "node:crypto";
import {
  type AccessPass,
  encodePassMessage,
  encodePassPayload,
  encodeTicketMessage,
  type PassRevokedReason,
  ROTATING_SECRET_LENGTH,
} from "@orasso/shared";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { accessPasses, applications, events, mediaProfiles, signingKeys, tickets } from "../../db/schema";
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

const newOtpSecret = () => randomBytes(ROTATING_SECRET_LENGTH);

/**
 * Secrets OR2 des pass valides qui n'en ont pas (pass émis avant le lot 48) : générés à la première demande du kit ou de
 * la synchro, sans écraser un secret posé entre-temps (`where otp_secret is null`). Rend le secret de chaque pass.
 */
export async function ensureOtpSecrets(
  ex: Executor,
  passes: readonly Pick<PassRow, "id" | "otpSecret" | "revokedAt">[],
): Promise<Map<string, Buffer>> {
  const secrets = new Map<string, Buffer>();
  const missing: string[] = [];
  for (const p of passes) {
    if (p.otpSecret) secrets.set(p.id, p.otpSecret);
    else if (!p.revokedAt) missing.push(p.id);
  }
  if (missing.length) {
    // Une seule requête, un secret distinct par ligne ; jamais d'écrasement d'un secret posé entre-temps.
    const values = sql.join(
      missing.map((id) => sql`(${id}::uuid, ${newOtpSecret()}::bytea)`),
      sql`, `,
    );
    await ex.execute(sql`
      update access_passes p set otp_secret = v.secret, updated_at = now()
      from (values ${values}) as v(id, secret)
      where p.id = v.id and p.otp_secret is null`);
    const rows = await ex
      .select({ id: accessPasses.id, otpSecret: accessPasses.otpSecret })
      .from(accessPasses)
      .where(inArray(accessPasses.id, missing));
    for (const r of rows) if (r.otpSecret) secrets.set(r.id, r.otpSecret);
  }
  return secrets;
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
      .values({
        id,
        applicationId: app.id,
        eventId: app.eventId,
        userId: app.userId,
        kid,
        signature,
        otpSecret: newOtpSecret(),
        issuedAt: now(),
      })
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
      // Billets de visiteurs signés avec la clé compromise : re-signés avec la clé active (lot 14).
      const exposedTickets = await tx.query.tickets.findMany({
        where: and(eq(tickets.kid, kid), eq(tickets.status, "valid")),
      });
      for (const t of exposedTickets) {
        const ev = await tx.query.events.findFirst({ where: eq(events.id, t.eventId), columns: { eventNo: true } });
        if (!ev) continue;
        const next = signing.sign(encodeTicketMessage({ kid: signing.activeKid, eventNo: ev.eventNo, passId: t.id }));
        await tx.update(tickets).set({ kid: next.kid, signature: next.signature }).where(eq(tickets.id, t.id));
      }
      const eventIds = [...new Set(exposed.map((p) => p.eventId))];
      after(() => {
        for (const eventId of eventIds) {
          const applicationIds = exposed.filter((p) => p.eventId === eventId).map((p) => p.applicationId);
          realtime.publish(`event:${eventId}:access`, "access.changed", { applicationIds });
        }
      });
      return { reissued: exposed.length + exposedTickets.length };
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
   * QR d'une candidature pour son titulaire (`GET /applications/:id/pass`), affiché dans l'appli et sur `/app/sorties`.
   * Une candidature retenue sans pass (données antérieures au lot 06) en reçoit un à la lecture.
   */
  async mine(v: Viewer, applicationId: string): Promise<AccessPass> {
    const app = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
    if (!app || app.userId !== v.user.id) throw notFound("Candidature introuvable");
    const event = await db.query.events.findFirst({ where: eq(events.id, app.eventId) });
    if (!event) throw notFound("Événement introuvable");
    let pass =
      app.status === "accepted" ? await withTx((tx) => this.issue(tx, app)) : await latestPass(db, applicationId);
    if (!pass) throw notFound("Pas de QR pour cette candidature");
    if (pass.revokedAt && app.status === "accepted") pass = await withTx((tx) => this.issue(tx, app));
    const valid = !pass.revokedAt;
    const secret = valid ? (await ensureOtpSecrets(db, [pass])).get(pass.id) : undefined;
    const media = app.mediaProfileId
      ? await db.query.mediaProfiles.findFirst({
          where: eq(mediaProfiles.id, app.mediaProfileId),
          columns: { name: true },
        })
      : undefined;
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
      otpSecret: secret ? secret.toString("base64url") : null,
      kind: app.kind,
      spotLabel: app.spotLabel ?? null,
      mediaName: media?.name ?? null,
    };
  },
};

function latestPass(ex: Executor, applicationId: string) {
  return ex.query.accessPasses.findFirst({
    where: eq(accessPasses.applicationId, applicationId),
    orderBy: [desc(accessPasses.issuedAt)],
  });
}
