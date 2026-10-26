// Fil d'un crew (lot R5c1) : qui y a accès. Seuls les membres actifs ; un non-membre, un ancien membre, un compte
// suspendu ou supprimé reçoit un 404, comme pour un crew inconnu (on ne révèle rien du fil).
// Verrous : la ligne du crew en `FOR SHARE` dans les écritures du fil, ce qui les ordonne avec les départs (`FOR UPDATE`
// dans `crewsService`) : un membre retiré ne publie plus une fois son départ validé.
import { crewErrors } from "@orasso/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";

import { crewMembers, crews } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { AppError, conflict, notFound } from "../../../lib/errors";
import type { Viewer } from "../../../lib/session";
import type { Executor } from "../../../lib/tx";

export type CrewRow = typeof crews.$inferSelect;
export type FeedAccess = { crew: CrewRow; leader: boolean; viewerId: string };

export const isUuid = (s: string | undefined): s is string =>
  Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s));

/** Profil visible dans le fil : ni supprimé, ni suspendu (`alias` : alias SQL de la table `profiles`). */
export function visibleProfile(alias: string, at: Date): SQL {
  const a = sql.raw(alias);
  return sql`${a}.deleted_at is null and (${a}.suspended_until is null or ${a}.suspended_until <= ${at})`;
}

function viewerSuspended(v: Viewer): boolean {
  return Boolean(v.profile.deletedAt || (v.profile.suspendedUntil && v.profile.suspendedUntil > now()));
}

/**
 * Membre actif du crew (lecture). Crew dissous : ses membres lisent encore leur fil, comme la discussion. Sinon 404.
 * `lock` : la ligne du crew est prise en partage (écritures), et un crew dissous refuse toute écriture (409).
 */
export async function requireCrewMember(
  ex: Executor,
  v: Viewer,
  crewId: string,
  lock: "none" | "write" = "none",
): Promise<FeedAccess> {
  if (!isUuid(crewId) || viewerSuspended(v)) throw notFound(crewErrors.notFound);
  const base = () => ex.select().from(crews).where(eq(crews.id, crewId));
  const [crew] = lock === "write" ? await base().for("share") : await base();
  if (!crew) throw notFound(crewErrors.notFound);
  const [me] = await ex
    .select({ role: crewMembers.role, status: crewMembers.status })
    .from(crewMembers)
    .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, v.user.id)));
  if (me?.status !== "active") throw notFound(crewErrors.notFound);
  if (lock === "write" && crew.deletedAt) throw conflict("conflict", crewErrors.archived);
  return { crew, leader: me.role === "leader", viewerId: v.user.id };
}

/** Course entre deux écritures (unicité 23505, interblocage 40P01) : 409, jamais 500. */
export function raceToConflict(error: unknown): never {
  const e = error as { code?: string; cause?: { code?: string } };
  const code = (e.cause ?? e).code;
  if (code === "23505" || code === "40P01") {
    throw new AppError(409, "conflict", "Quelqu'un vient de faire la même chose : recharge le fil.");
  }
  throw error;
}
