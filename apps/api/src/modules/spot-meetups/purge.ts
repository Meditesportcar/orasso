// Rendez-vous au spot (lot R7i) : effacement du lieu et de la liste. À `ends_at` (tâche `spot.purge`, toutes les 5 minutes,
// et jamais en retard pour les lectures : le lieu n'est plus servi dès `ends_at`) ou à l'annulation, le nom du lieu, les
// coordonnées, le mot et les réponses disparaissent ; il ne reste qu'un nombre (`came_count`). Les lignes effacées restent
// 30 jours (onglet Spots du crew, sans lieu ; modération), puis sont supprimées.
import { SPOT_PAST_MS } from "@orasso/shared";
import { and, inArray, isNotNull, isNull, lt, lte, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { notifications, spotMeetupReplies, spotMeetups } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Executor } from "../../lib/tx";

/** Efface le lieu et les réponses des rendez-vous qui vérifient `where` (et ne sont pas déjà effacés). Rend leurs identifiants. */
export async function purgeWhere(ex: Executor, where: SQL, at: Date): Promise<string[]> {
  const rows = await ex
    .update(spotMeetups)
    .set({
      placeLabel: "",
      lat: 0,
      lng: 0,
      // Le mot peut nommer le lieu (« devant le garage Dupont ») : il disparaît avec lui.
      note: null,
      purgedAt: at,
      cameCount: sql`(select count(*)::int from spot_meetup_replies r where r.meetup_id = ${spotMeetups.id} and r.answer = 'yes')`,
    })
    .where(and(isNull(spotMeetups.purgedAt), where))
    .returning({ id: spotMeetups.id });
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await ex.delete(spotMeetupReplies).where(inArray(spotMeetupReplies.meetupId, ids));
    const ofThese = sql`${notifications.data} ->> 'meetupId' in (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`;
    // Une notification « te donne rendez-vous » pas encore livrée (heures calmes) ne part plus.
    await ex
      .delete(notifications)
      .where(and(sql`${notifications.type} = 'spot_meetup_new'`, isNull(notifications.deliveredAt), ofThese));
    // « Qui vient » dans l'Activité (« X vient ») disparaît avec la liste : la liste n'existe plus nulle part.
    await ex.delete(notifications).where(and(sql`${notifications.type} = 'spot_meetup_reply'`, ofThese));
  }
  return ids;
}

export const spotMeetupsPurge = {
  /** Tâche `spot.purge` (idempotente) : les rendez-vous finis sont effacés, les lignes de plus de 30 jours supprimées. */
  async run(): Promise<{ purged: number; deleted: number }> {
    const at = now();
    const ids = await db.transaction((tx) => purgeWhere(tx, lte(spotMeetups.endsAt, at), at));
    const gone = await db
      .delete(spotMeetups)
      .where(and(isNotNull(spotMeetups.purgedAt), lt(spotMeetups.endsAt, new Date(at.getTime() - SPOT_PAST_MS))))
      .returning({ id: spotMeetups.id });
    return { purged: ids.length, deleted: gone.length };
  },
};
