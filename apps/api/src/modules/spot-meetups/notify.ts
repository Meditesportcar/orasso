// Rendez-vous au spot (lot R7i) : la notification `spot_meetup_new` aux invités (push seul, jamais le lieu dedans), et sa
// vérification à la livraison. Les heures calmes (22 h – 8 h) la retiennent, sauf si le rendez-vous commence dans les
// 2 heures (règle de la table R7 : `quiet: { within: 2 h }`). Si le rendez-vous est annulé ou fini, ou si la personne n'est
// plus invitée, avant la livraison, elle ne part pas.
import { r7DefaultContent } from "@orasso/shared";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { crewMembers, crews, profiles, spotMeetups, userFollows } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";
import { profileOkSql } from "../feed/access";
import { type NotificationRow, notificationsService, registerDeliveryGuard } from "../notifications/service";
import { invitedSql, isOver, type SpotRow } from "./views";

/** Les invités : abonnés acceptés de l'auteur, ou membres actifs du crew ; en règle ; l'auteur lui-même exclu. */
export async function inviteesOf(ex: Executor, row: SpotRow): Promise<string[]> {
  const at = now();
  if (row.audience === "crew" && row.crewId) {
    const rows = await ex
      .select({ id: crewMembers.userId })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
      .where(
        and(
          eq(crewMembers.crewId, row.crewId),
          eq(crewMembers.status, "active"),
          isNull(crews.deletedAt),
          profileOkSql("profiles", at),
        ),
      );
    return rows.map((r) => r.id).filter((id) => id !== row.authorId);
  }
  const rows = await ex
    .select({ id: userFollows.followerId })
    .from(userFollows)
    .innerJoin(profiles, eq(profiles.userId, userFollows.followerId))
    .where(
      and(eq(userFollows.followedId, row.authorId), eq(userFollows.status, "accepted"), profileOkSql("profiles", at)),
    );
  return rows.map((r) => r.id).filter((id) => id !== row.authorId);
}

/** Prévient les invités (dans la transaction du lancement) ; la livraison part après validation. */
export async function notifyInvitees(
  ex: Executor,
  after: (cb: () => unknown) => void,
  author: Viewer,
  row: SpotRow,
): Promise<void> {
  const ids = await inviteesOf(ex, row);
  if (!ids.length) return;
  const text = r7DefaultContent("spot_meetup_new", author.profile.pseudo);
  await notificationsService.notifyMany(ex, ids, "spot_meetup_new", {
    ...text,
    // Push seul : une ligne dans le Journal survivrait au rendez-vous et ne mènerait nulle part.
    inJournal: false,
    // Le début du rendez-vous commande les heures calmes (dans les 2 h : part tout de suite, sinon 8 h).
    eventStartsAt: row.startsAt,
    // Jamais le lieu, ni ses coordonnées : un écran verrouillé n'est pas un invité.
    data: { meetupId: row.id, link: `/app/spot/${row.id}` },
  });
  after(() => notificationsService.kick());
}

/** À la livraison : plus de rendez-vous (annulé, fini, effacé), ou plus invité → la notification est supprimée. */
async function guard(n: NotificationRow): Promise<boolean> {
  const meetupId = (n.data as { meetupId?: string } | null)?.meetupId;
  // Sans rendez-vous nommé (notification posée à la main par un test ou un script), il n’y a rien à vérifier.
  if (!meetupId) return true;
  const [row] = await db
    .select()
    .from(spotMeetups)
    .where(and(eq(spotMeetups.id, meetupId), sql`${spotMeetups.cancelledAt} is null`));
  if (!row || isOver(row, now())) return false;
  const [invited] = await db
    .select({ id: spotMeetups.id })
    .from(spotMeetups)
    .where(and(eq(spotMeetups.id, meetupId), invitedSql(n.userId)));
  return Boolean(invited);
}

registerDeliveryGuard(["spot_meetup_new"], guard);
