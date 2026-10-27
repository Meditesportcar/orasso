// La page du crew en direct (lot R6a, retour de Damien du 27/10). Canal temps réel `crew:<id>` :
// - droit : membre actif, visible (ni supprimé ni suspendu), d'un crew non dissous — les mêmes règles que les routes du
//   fil (`feed/access.ts`). Vérifié à l'abonnement, revérifié toutes les 30 s (`ws.ts`), et retiré à l'instant au
//   départ d'un membre ou à la dissolution (`revoked`) ;
// - contenu : un signal minimal `{ type, crewId, postId?, commentId?, outingId? }`, publié **après la validation** de
//   la transaction (`after` de `withTx` : rien après une annulation). La page relit l'élément par les routes
//   habituelles, qui appliquent les droits de chaque personne : aucune donnée ne passe par le canal ;
// - l'auteur du geste ne reçoit pas son propre signal (son écran l'affiche déjà) : ses autres appareils se mettent à
//   jour à la prochaine relecture (reconnexion, retour sur la page).
import { type CrewSignal, type CrewSignalType, crewChannel } from "@orasso/shared";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { crewMembers, crews, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { realtime } from "../../lib/realtime";
import { isUuid, visibleProfile } from "./feed/access";

type After = (cb: () => unknown) => void;
type SignalIds = Pick<CrewSignal, "postId" | "commentId" | "outingId">;

const PREFIX = "crew:";

/** Membre actif et visible d'un crew non dissous. */
export async function canSubscribeCrew(userId: string, channel: string): Promise<boolean> {
  const crewId = channel.slice(PREFIX.length);
  if (!channel.startsWith(PREFIX) || !isUuid(crewId)) return false;
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

realtime.registerAuthorizer(PREFIX, (userId, channel) => canSubscribeCrew(userId, channel));

/** Le signal tel qu'il part : le type, le crew, et seulement les identifiants donnés. */
export function crewSignal(type: CrewSignalType, crewId: string, ids: SignalIds = {}): CrewSignal {
  const signal: CrewSignal = { type, crewId };
  if (ids.postId) signal.postId = ids.postId;
  if (ids.commentId) signal.commentId = ids.commentId;
  if (ids.outingId) signal.outingId = ids.outingId;
  return signal;
}

/** Après la validation : le signal aux membres abonnés, sauf à l'auteur du geste (`actorId`). */
export function signalCrew(
  after: After,
  crewId: string,
  type: CrewSignalType,
  ids: SignalIds = {},
  actorId: string | null = null,
) {
  const payload = crewSignal(type, crewId, ids);
  after(() =>
    realtime.publishTo(crewChannel(crewId), type, payload, (socket) => !actorId || socket.userId !== actorId),
  );
}

/** Après la validation : un membre parti ou retiré ne reçoit plus rien du crew, tout de suite. */
export function revokeCrewMember(after: After, crewId: string, userId: string) {
  after(() => realtime.revoke(crewChannel(crewId), (socket) => socket.userId === userId));
}

/** Après la validation : crew dissous, plus personne ne reçoit rien. */
export function revokeCrew(after: After, crewId: string) {
  after(() => realtime.revoke(crewChannel(crewId)));
}
