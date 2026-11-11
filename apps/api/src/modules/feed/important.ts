// « Info importante » (vague R8, lot R8a1, ARCHITECTURE-R8 § 2.3) : une publication de la casquette organisateur, rattachée
// à un événement de sa structure, qui prévient ceux qui ont une place (`event_important`, niveau Essentiel côté R8n1).
// - motif obligatoire ; une par jour et trois par semaine **par événement** (jour et semaine civils de Paris, T9) ;
// - comptées dans la transaction de création, sous `pg_advisory_xact_lock` (clé `important:<événement>`), **publications
//   supprimées comprises** : supprimer ne rend pas de droit ;
// - destinataires : `eventPlaceHolderIds` moins l'auteur ; titre « <événement> · <motif> », corps = 140 premiers
//   caractères de la légende ; puis `important_sent_at`, puis `kick()` après la validation.
import {
  type ImportantReason,
  importantLeft,
  importantReasonLabels,
  importantWindow,
  publicationErrors,
} from "@orasso/shared";
import { and, eq, inArray, sql } from "drizzle-orm";

import { feedPosts } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { Executor, Tx } from "../../lib/tx";
import { eventPlaceHolderIds } from "../events/place";
import { notificationsService } from "../notifications/service";

const BODY_MAX = 140;

/**
 * Combien d'« Info importante » ont déjà été publiées par événement, aujourd'hui et cette semaine (supprimées comprises).
 * Le comptage lit `important_sent_at`, posé avec l'horloge de l'application dans la transaction de création (jamais
 * `created_at`, qui est l'heure de la base) : le plafond suit donc l'horloge simulée de la recette.
 */
export async function importantUsage(
  ex: Executor,
  eventIds: string[],
  now: Date,
): Promise<Map<string, { today: number; week: number }>> {
  const out = new Map<string, { today: number; week: number }>();
  if (!eventIds.length) return out;
  const w = importantWindow(now);
  const rows = await ex
    .select({
      eventId: feedPosts.eventId,
      today: sql<number>`count(*) filter (where ${feedPosts.importantSentAt} >= ${w.dayStart.toISOString()}::timestamptz and ${feedPosts.importantSentAt} < ${w.dayEnd.toISOString()}::timestamptz)::int`,
      week: sql<number>`count(*)::int`,
    })
    .from(feedPosts)
    .where(
      and(
        inArray(feedPosts.eventId, eventIds),
        sql`${feedPosts.importantReason} is not null`,
        sql`${feedPosts.importantSentAt} >= ${w.weekStart.toISOString()}::timestamptz`,
        sql`${feedPosts.importantSentAt} < ${w.weekEnd.toISOString()}::timestamptz`,
      ),
    )
    .groupBy(feedPosts.eventId);
  for (const r of rows) if (r.eventId) out.set(r.eventId, { today: Number(r.today), week: Number(r.week) });
  return out;
}

/**
 * Réserve la place d'une « Info importante » pour cet événement : verrou de l'événement (jusqu'à la fin de la
 * transaction), puis comptage. 409 `important_quota` avec `{ leftToday, leftWeek }` si le plafond est atteint.
 * À appeler dans la transaction qui écrit la publication.
 */
export async function reserveImportant(tx: Tx, eventId: string, now: Date): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`important:${eventId}`}, 0))`);
  const used = (await importantUsage(tx, [eventId], now)).get(eventId) ?? { today: 0, week: 0 };
  const left = importantLeft(used.today, used.week);
  if (left.leftToday < 1 || left.leftWeek < 1) {
    throw new AppError(409, "important_quota", publicationErrors.important_quota, left);
  }
}

/**
 * Envoie l'info aux inscrits et retenus (`eventPlaceHolderIds`) hors l'auteur, puis date l'envoi. Les notifications sont
 * écrites dans la transaction de la publication ; `kick()` part après la validation.
 */
export async function sendImportant(
  tx: Tx,
  after: (cb: () => unknown) => void,
  input: {
    postId: string;
    authorUserId: string;
    reason: ImportantReason;
    caption: string | null;
    now: Date;
    event: { id: string; slug: string; title: string; startsAt: Date };
  },
): Promise<number> {
  const recipients = (await eventPlaceHolderIds(tx, input.event.id)).filter((id) => id !== input.authorUserId);
  const reasonLabel = importantReasonLabels[input.reason];
  const text = (input.caption ?? "").trim();
  await notificationsService.notifyMany(tx, recipients, "event_important", {
    title: `${input.event.title} · ${reasonLabel}`,
    body: text ? [...text].slice(0, BODY_MAX).join("") : reasonLabel,
    eventId: input.event.id,
    eventStartsAt: input.event.startsAt,
    data: { eventId: input.event.id, postId: input.postId, link: `/e/${input.event.slug}` },
  });
  await tx.update(feedPosts).set({ importantSentAt: input.now }).where(eq(feedPosts.id, input.postId));
  after(() => notificationsService.kick());
  return recipients.length;
}
