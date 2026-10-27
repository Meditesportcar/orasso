// La page du crew en direct (lot R6a, retour de Damien du 27/10). Canal temps réel `crew:<id>` :
// - droit : membre actif, visible (ni supprimé ni suspendu), d'un crew non dissous — les mêmes règles que les routes du
//   fil (`feed/access.ts`). Vérifié à l'abonnement (et revérifié juste après, `ws.ts`), revérifié toutes les 30 s, et
//   retiré à l'instant (`revoked`) au départ d'un membre, à la dissolution, et (tour 2) à la suspension ou à la
//   suppression d'un compte ;
// - contenu : un signal minimal `{ type, crewId, postId?, commentId?, outingId? }`, publié **après la validation** de
//   la transaction (`after` de `withTx` : rien après une annulation). La page relit l'élément par les routes
//   habituelles, qui appliquent les droits de chaque personne : aucune donnée ne passe par le canal ;
// - tour 2 (décision du coordinateur) : l'auteur du geste reçoit aussi son signal, pour que ses autres appareils le
//   voient ; l'écran qui a fait le geste fusionne par identifiant (ni doublon, ni pastille).
import { CREW_CHANNEL_PREFIX, type CrewSignal, type CrewSignalType, crewChannel } from "@orasso/shared";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { crewMembers, crews, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { realtime } from "../../lib/realtime";
import { isUuid, visibleProfile } from "./feed/access";

type After = (cb: () => unknown) => void;
type SignalIds = Pick<CrewSignal, "postId" | "commentId" | "outingId">;

/** Membre actif et visible d'un crew non dissous. */
export async function canSubscribeCrew(userId: string, channel: string): Promise<boolean> {
  const crewId = channel.slice(CREW_CHANNEL_PREFIX.length);
  if (!channel.startsWith(CREW_CHANNEL_PREFIX) || !isUuid(crewId)) return false;
  const [row] = await db
    .select({ userId: crewMembers.userId })
    .from(crewMembers)
    .innerJoin(crews, eq(crews.id, crewMembers.crewId))
    .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
    .where(
      and(
        eq(crewMembers.crewId, crewId),
        eq(crewMembers.userId, userId),
        eq(crewMembers.status, "active"),
        isNull(crews.deletedAt),
        sql`${visibleProfile("profiles", now())}`,
      ),
    );
  return Boolean(row);
}

realtime.registerAuthorizer(CREW_CHANNEL_PREFIX, (userId, channel) => canSubscribeCrew(userId, channel));

/** Le signal tel qu'il part : le type, le crew, et seulement les identifiants donnés. */
export function crewSignal(type: CrewSignalType, crewId: string, ids: SignalIds = {}): CrewSignal {
  const signal: CrewSignal = { type, crewId };
  if (ids.postId) signal.postId = ids.postId;
  if (ids.commentId) signal.commentId = ids.commentId;
  if (ids.outingId) signal.outingId = ids.outingId;
  return signal;
}

/** Après la validation : le signal à toutes les connexions abonnées au crew (auteur compris, tour 2). */
export function signalCrew(after: After, crewId: string, type: CrewSignalType, ids: SignalIds = {}) {
  const payload = crewSignal(type, crewId, ids);
  after(() => realtime.publish(crewChannel(crewId), type, payload));
}

/** Après la validation : un membre parti ou retiré ne reçoit plus rien du crew, tout de suite. */
export function revokeCrewMember(after: After, crewId: string, userId: string) {
  after(() => realtime.revoke(crewChannel(crewId), (socket) => socket.userId === userId));
}

/**
 * Tour 2 : après la validation, un compte supprimé ne reçoit plus rien d'aucun crew, tout de suite (la suspension fait
 * de même dans `moderation/suspension.ts`).
 */
export function revokeCrewChannelsOf(after: After, userId: string) {
  after(() => realtime.revokeUser(CREW_CHANNEL_PREFIX, userId));
}

/** Après la validation : crew dissous, plus personne ne reçoit rien. */
export function revokeCrew(after: After, crewId: string) {
  after(() => realtime.revoke(crewChannel(crewId)));
}
