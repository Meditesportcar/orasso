// Résumé quotidien des nouveautés des sorties (vague R8, lot R8n1, ARCHITECTURE-R8 § 2.7, décision T13) : tâche
// `event-news.digest`, 18 h heure de Paris. Une notification `event_news_digest` par personne et par jour au plus, toutes
// sorties confondues, faite des publications du journal des événements où la personne a une place. Une publication
// ordinaire n'envoie jamais de notification elle-même ; l'« Info importante » est déjà partie en Essentiel (exclue ici).
//
// Idempotence : le compte est **réservé d'abord** (`profiles.event_news_digest_at`, y compris quand il n'y a rien à dire),
// sous verrou de ligne (`for update skip locked`) : une tâche rejouée ou deux tâches simultanées n'envoient rien de plus.
// Requêtes ensemblistes : par paquet de 500 comptes, une réservation, une lecture des publications, une insertion.
import {
  BUSINESS_TIMEZONE,
  DAY,
  eventNotifyLabels,
  fromWallTime,
  isQuietHour,
  shouldDeliver,
  wallTime,
} from "@orasso/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { eventNotificationPrefs, notifications, profiles } from "../../db/schema";
import { env } from "../../env";
import { now } from "../../lib/deps";
import { withTx } from "../../lib/tx";
import { postOkSql } from "../feed/lists";
import { notificationsService, registerDeliveryGuard } from "../notifications/service";

const BATCH = 500;
/** Sans résumé précédent : les publications des dernières 24 h. */
const FIRST_WINDOW_MS = DAY;
/**
 * Marge de chevauchement : une publication dont la transaction a commencé avant le passage précédent mais s'est validée après
 * (sa date précède donc le curseur) est reprise ; celles déjà résumées sont écartées par leur identifiant (`data._postIds`
 * des résumés envoyés).
 */
const OVERLAP_MS = 60 * 60_000;
/** Les résumés envoyés qui servent à dédoublonner (la marge est d'une heure : trois jours suffisent largement). */
const DEDUP_LOOKBACK_MS = 3 * DAY;
/** Un événement fini depuis plus de 7 jours ne compte plus. */
const FINISHED_WINDOW_MS = 7 * DAY;
/** Copie des statuts de `modules/events/place.ts` (non modifiable ici) : un test garde les deux d'accord. */
const PLACE_STATUSES = sql`('pending', 'accepted', 'waitlisted', 'offered', 'awaiting_member')`;
const DIGEST_TYPE = "event_news_digest" as const;
/** Une ligne de profil verrouillée par ailleurs est sautée par `skip locked` : on la reprend (au plus 10 fois, 200 ms). */
const LOCK_RETRIES = 10;
const LOCK_WAIT_MS = 200;
const ELIGIBLE = (at: Date, dayStart: Date) => sql`p.deleted_at is null and p.banned_at is null
  and (p.suspended_until is null or p.suspended_until <= ${at.toISOString()}::timestamptz)
  and (p.event_news_digest_at is null or p.event_news_digest_at < ${dayStart.toISOString()}::timestamptz)`;

/** Minuit (Paris) du jour de `at` : début de la journée réservée. */
export function parisDayStart(at: Date): Date {
  const w = wallTime(at, BUSINESS_TIMEZONE);
  return fromWallTime({ year: w.year, month: w.month, day: w.day, hour: 0, minute: 0 }, BUSINESS_TIMEZONE);
}

type Reserved = {
  user_id: string;
  since: Date | string | null;
  prefs: Record<string, boolean> | null;
  muted: string[] | null;
};
type NewsRow = { user_id: string; event_id: string; title: string; slug: string; n: number; post_ids: string[] };
/** Un événement d'un résumé, gardé dans `data.events` pour le recomposer à la livraison. */
export type DigestEvent = { id: string; title: string; slug: string; n: number };

export const eventNewsDigest = {
  /**
   * Un passage de la tâche. `at` est l'instant du passage (jamais l'heure réelle dans les tests). Rend le nombre de comptes
   * traités (réservés) et de notifications créées. `batch` : taille du paquet (500 ; réduite seulement par les tests).
   */
  async run(at: Date = now(), batch = BATCH): Promise<{ accounts: number; sent: number }> {
    // Un résumé qui tomberait dans les heures calmes n'est pas reporté à 8 h : il est abandonné (le suivant le remplace).
    if (env.NOTIFY_QUIET_HOURS && isQuietHour(at)) return { accounts: 0, sent: 0 };
    const dayStart = parisDayStart(at);
    let accounts = 0;
    let sent = 0;
    let waits = 0;
    for (;;) {
      const done = await withTx(async (tx, after) => {
        const reserved = await tx.execute<Reserved>(sql`
          with picked as (
            select p.user_id, p.event_news_digest_at as since, p.notification_prefs, p.muted_types
            from profiles p
            where ${ELIGIBLE(at, dayStart)}
            order by p.user_id
            limit ${batch}
            for update skip locked
          )
          update profiles p set event_news_digest_at = ${at.toISOString()}::timestamptz
          from picked where p.user_id = picked.user_id
          returning p.user_id, picked.since, picked.notification_prefs as prefs, picked.muted_types as muted`);
        // Seuls ceux qui veulent le résumé : `eventNews` n'est pas faux, et la règle ordinaire ne refuse pas le type.
        const wanting = reserved.rows.filter(
          (r) => r.prefs?.eventNews !== false && shouldDeliver(r.prefs, r.muted, DIGEST_TYPE),
        );
        const byUser = new Map<string, NewsRow[]>();
        if (wanting.length) {
          const values = sql.join(
            wanting.map((r) => {
              const since = r.since
                ? new Date(new Date(r.since).getTime() - OVERLAP_MS)
                : new Date(at.getTime() - FIRST_WINDOW_MS);
              return sql`(${r.user_id}::text, ${since.toISOString()}::timestamptz)`;
            }),
            sql`, `,
          );
          const news = await tx.execute<NewsRow>(sql`
            with u(user_id, since) as (values ${values}),
            holders as (
              select a.user_id, a.event_id from applications a join u on u.user_id = a.user_id
                where a.status in ${PLACE_STATUSES}
              union
              select t.user_id, t.event_id from tickets t join u on u.user_id = t.user_id where t.status in ('valid', 'used')
            )
            select h.user_id, e.id as event_id, e.title, e.slug, count(p.id)::int as n,
              array_agg(p.id::text order by p.created_at) as post_ids
            from holders h
            join u on u.user_id = h.user_id
            join events e on e.id = h.event_id and e.status = 'published'
              and e.ends_at >= ${new Date(at.getTime() - FINISHED_WINDOW_MS).toISOString()}::timestamptz
            join feed_posts p on p.event_id = e.id and p.event_role = 'organizer'
              and p.important_sent_at is null and p.author_id <> h.user_id
              and p.created_at > u.since and p.created_at <= ${at.toISOString()}::timestamptz
            join profiles a on a.user_id = p.author_id
            left join event_notification_prefs np on np.user_id = h.user_id and np.event_id = e.id
            where coalesce(np.news, true)
              and ${postOkSql(at)}
              and not exists (select 1 from notifications n where n.user_id = h.user_id and n.type = 'event_news_digest'
                and n.created_at >= ${new Date(at.getTime() - DEDUP_LOOKBACK_MS).toISOString()}::timestamptz
                and n.data -> '_postIds' @> to_jsonb(p.id::text))
            group by h.user_id, e.id, e.title, e.slug, e.starts_at
            order by h.user_id, e.starts_at, e.id`);
          for (const row of news.rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
        }
        const items = [...byUser.entries()].map(([userId, rows]) => {
          const events = rows.map((r) => ({ id: r.event_id, title: r.title, slug: r.slug, n: r.n }));
          return {
            userId,
            ...composeDigest(events),
            data: { events, _postIds: rows.flatMap((r) => r.post_ids) },
          };
        });
        await notificationsService.notifyEachNow(tx, DIGEST_TYPE, items);
        if (items.length) after(() => notificationsService.kick());
        return { reserved: reserved.rows.length, sent: items.length };
      });
      accounts += done.reserved;
      sent += done.sent;
      if (done.reserved > 0) continue;
      // Plus rien à prendre : reste-t-il des comptes sautés parce qu'une autre transaction tient leur ligne ?
      const left = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from profiles p where ${ELIGIBLE(at, dayStart)}`,
      );
      if (!(left.rows[0]?.n ?? 0)) break;
      if (++waits > LOCK_RETRIES) {
        // Pg-boss reprend la tâche (idempotente) : les comptes déjà servis ne le sont pas deux fois.
        throw new Error(`Résumé des nouveautés : ${left.rows[0]?.n} compte(s) verrouillé(s) non servis`);
      }
      await new Promise((r) => setTimeout(r, LOCK_WAIT_MS));
    }
    return { accounts, sent };
  },
};

/** Titre, corps et lien d'un résumé fait de ces événements (au moins un). */
export function composeDigest(events: readonly DigestEvent[]) {
  const count = events.reduce((sum, e) => sum + e.n, 0);
  const only = events.length === 1 ? events[0] : undefined;
  return {
    title: eventNotifyLabels.digestTitle(count),
    body: eventNotifyLabels.digestBody(events.map((e) => e.title)),
    link: only ? { label: "Voir l'événement", path: `/e/${only.slug}` } : { label: "Ouvrir Orasso", path: "/app" },
  };
}

/**
 * Garde de livraison du résumé. Un résumé livré en retard (panne, reprise) qui tombe dans les heures calmes est abandonné,
 * jamais reporté à 8 h. À la livraison, les réglages sont relus : « Nouveautés de mes sorties » coupées depuis, ou tous les
 * événements du résumé coupés : abandonné ; quelques événements coupés : le résumé est recomposé avec les autres.
 */
registerDeliveryGuard([DIGEST_TYPE], async (n) => {
  if (env.NOTIFY_QUIET_HOURS && isQuietHour(now())) return false;
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, n.userId),
    columns: { notificationPrefs: true },
  });
  if (!profile || profile.notificationPrefs?.eventNews === false) return false;
  const data = n.data as { events?: DigestEvent[]; link?: string; linkLabel?: string };
  if (!Array.isArray(data.events) || !data.events.length) return true;
  const muted = await db
    .select({ eventId: eventNotificationPrefs.eventId })
    .from(eventNotificationPrefs)
    .where(
      and(
        eq(eventNotificationPrefs.userId, n.userId),
        eq(eventNotificationPrefs.news, false),
        inArray(
          eventNotificationPrefs.eventId,
          data.events.map((e) => e.id),
        ),
      ),
    );
  const off = new Set(muted.map((m) => m.eventId));
  const remaining = data.events.filter((e) => !off.has(e.id));
  if (!remaining.length) return false;
  if (remaining.length === data.events.length) return true;
  const { title, body, link } = composeDigest(remaining);
  const next = { ...n.data, events: remaining, link: link.path, linkLabel: link.label };
  await db.update(notifications).set({ title, body, data: next }).where(eq(notifications.id, n.id));
  return { ...n, title, body, data: next };
});
