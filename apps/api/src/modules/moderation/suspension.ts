// État de suspension d'un compte (lot 32) : `profiles.suspended_until` reste le seul champ lu par le reste de l'API
// (lots 17 à 29 : comptes suspendus filtrés partout) ; la modération le tient à jour à partir des sanctions actives.
// Sans dépendance vers les autres services (importé par `GET /me` et la session).
import { BAN_UNTIL, canContestSanction, isSanctionActive, type SuspensionInfo } from "@orasso/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { profiles, sanctions } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Executor, Tx } from "../../lib/tx";

export type SanctionRow = typeof sanctions.$inferSelect;

/** Sanctions qui empêchent d'écrire en ce moment, le bannissement d'abord puis la fin la plus lointaine. */
export async function activeSanctions(ex: Executor, userId: string, at: Date = now()): Promise<SanctionRow[]> {
  const rows = await ex
    .select()
    .from(sanctions)
    .where(and(eq(sanctions.userId, userId), isNull(sanctions.liftedAt)))
    .orderBy(desc(sanctions.startsAt));
  return rows
    .filter((s) => isSanctionActive(s, at))
    .sort(
      (a, b) => (b.endsAt?.getTime() ?? Number.POSITIVE_INFINITY) - (a.endsAt?.getTime() ?? Number.POSITIVE_INFINITY),
    );
}

/**
 * Recalcule `suspended_until` (fin de la sanction active la plus longue, `BAN_UNTIL` pour un bannissement, `null` sinon)
 * et `banned_at`. À appeler dans la transaction de la décision, sous le verrou du compte.
 */
export async function recomputeSuspension(tx: Tx, userId: string): Promise<{ until: Date | null; banned: boolean }> {
  const at = now();
  const active = await activeSanctions(tx, userId, at);
  const top = active[0];
  const banned = active.some((s) => s.kind === "ban");
  const until = top ? (top.endsAt ?? BAN_UNTIL) : null;
  const [current] = await tx.select({ bannedAt: profiles.bannedAt }).from(profiles).where(eq(profiles.userId, userId));
  await tx
    .update(profiles)
    .set({ suspendedUntil: until, bannedAt: banned ? (current?.bannedAt ?? at) : null })
    .where(eq(profiles.userId, userId));
  return { until, banned };
}

/** `GET /me` → `suspension` (null si le compte peut écrire). */
export async function suspensionInfo(userId: string, suspendedUntil: Date | null): Promise<SuspensionInfo | null> {
  const at = now();
  if (!suspendedUntil || suspendedUntil <= at) return null;
  const top = (await activeSanctions(db, userId, at))[0];
  if (!top) {
    // Suspension posée sans sanction (données antérieures au lot 32) : affichée sans contestation possible.
    return {
      until: suspendedUntil.toISOString(),
      kind: "suspension_7d",
      reason: "other",
      sanctionId: "",
      canContest: false,
    };
  }
  return {
    until: (top.endsAt ?? BAN_UNTIL).toISOString(),
    kind: top.kind,
    reason: top.reason,
    sanctionId: top.id,
    canContest: canContestSanction(top, at),
  };
}

/** Verrou consultatif d'un compte (décisions de modération, suspension automatique), jusqu'à la fin de la transaction. */
export async function lockAccount(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`moderation:${userId}`}, 0))`);
}
