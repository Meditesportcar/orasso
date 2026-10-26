// Fil d'un crew (lot R5c1) : qui y a accès. Seuls les membres actifs d'un crew non dissous ; un non-membre, un ancien
// membre, un compte suspendu ou supprimé, et tout le monde pour un crew dissous (tour 2), reçoivent un 404, comme pour
// un crew inconnu (on ne révèle rien du fil). Exception (tour 2) : un ancien membre retire encore **ses** contenus.
// Verrous : la ligne du crew en `FOR SHARE` dans les écritures du fil, ce qui les ordonne avec les départs (`FOR UPDATE`
// dans `crewsService`) : un membre retiré ne publie plus une fois son départ validé.
import { crewErrors } from "@orasso/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";

import { crewMembers, crews } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { AppError, notFound } from "../../../lib/errors";
import type { Viewer } from "../../../lib/session";
import type { Executor } from "../../../lib/tx";

export type CrewRow = typeof crews.$inferSelect;
export type FeedAccess = { crew: CrewRow; leader: boolean; viewerId: string; viewer: Viewer };

export const isUuid = (s: string | undefined): s is string =>
  Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s));

/** Profil visible dans le fil : ni supprimé, ni suspendu (`alias` : alias SQL de la table `profiles`). */
export function visibleProfile(alias: string, at: Date): SQL {
  const a = sql.raw(alias);
  return sql`${a}.deleted_at is null and (${a}.suspended_until is null or ${a}.suspended_until <= ${at})`;
}

function viewerHidden(v: Viewer): boolean {
  return Boolean(v.profile.deletedAt || (v.profile.suspendedUntil && v.profile.suspendedUntil > now()));
}

/** Le crew (non dissous) et la ligne d'appartenance de la personne ; 404 sinon. */
async function crewAndMembership(ex: Executor, v: Viewer, crewId: string, lock: boolean) {
  if (!isUuid(crewId) || viewerHidden(v)) throw notFound(crewErrors.notFound);
  const base = () => ex.select().from(crews).where(eq(crews.id, crewId));
  const [crew] = lock ? await base().for("share") : await base();
  // Tour 2 : un crew dissous (par son chef ou par la modération) n'a plus de fil, pour personne.
  if (!crew || crew.deletedAt) throw notFound(crewErrors.notFound);
  const [me] = await ex
    .select({ role: crewMembers.role, status: crewMembers.status })
    .from(crewMembers)
    .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, v.user.id)));
  return { crew, me };
}

/**
 * Membre actif du crew. `lock = "write"` : la ligne du crew est prise en partage (écritures du fil). Sinon 404, comme un
 * crew inconnu.
 */
export async function requireCrewMember(
  ex: Executor,
  v: Viewer,
  crewId: string,
  lock: "none" | "write" = "none",
): Promise<FeedAccess> {
  const { crew, me } = await crewAndMembership(ex, v, crewId, lock === "write");
  if (me?.status !== "active") throw notFound(crewErrors.notFound);
  return { crew, leader: me.role === "leader", viewerId: v.user.id, viewer: v };
}

/**
 * Tour 2 : retrait de ses propres contenus. Un membre actif comme d'habitude ; un ancien membre aussi, mais seulement
 * pour ce dont il est l'auteur (vérifié par l'appelant avec `member = false`). Crew dissous ou inconnu : 404.
 */
export async function requireOwnContentAccess(
  ex: Executor,
  v: Viewer,
  crewId: string,
): Promise<FeedAccess & { member: boolean }> {
  const { crew, me } = await crewAndMembership(ex, v, crewId, true);
  const member = me?.status === "active";
  return { crew, leader: member && me?.role === "leader", viewerId: v.user.id, viewer: v, member };
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
