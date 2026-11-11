// Résumé quotidien des nouveautés des sorties (vague R8, lot R8n1, ARCHITECTURE-R8 § 2.7, décision T13) : tâche
// `event-news.digest`, 18 h heure de Paris. Une notification `event_news_digest` par personne et par jour au plus, toutes
// sorties confondues, faite des publications du journal des événements où la personne a une place. Une publication
// ordinaire n'envoie jamais de notification elle-même ; l'« Info importante » est déjà partie en Essentiel (exclue ici).
//
// Idempotence : le compte est **réservé d'abord** (`profiles.event_news_digest_at`, y compris quand il n'y a rien à dire),
// sous verrou de ligne (`for update skip locked`) : une tâche rejouée ou deux tâches simultanées n'envoient rien de plus.
// Requêtes ensemblistes : par paquet de 500 comptes, une réservation, une lecture des publications, une insertion.
import { BUSINESS_TIMEZONE, DAY, eventNotifyLabels, fromWallTime, shouldDeliver, wallTime } from "@orasso/shared";
import { sql } from "drizzle-orm";

import { now } from "../../lib/deps";
import { withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";

const BATCH = 500;
/** Sans résumé précédent : les publications des dernières 24 h. */
const FIRST_WINDOW_MS = DAY;
/** Un événement fini depuis plus de 7 jours ne compte plus. */
const FINISHED_WINDOW_MS = 7 * DAY;
/** Copie des statuts de `modules/events/place.ts` (non modifiable ici) : un test garde les deux d'accord. */
const PLACE_STATUSES = sql`('pending', 'accepted', 'waitlisted', 'offered', 'awaiting_member')`;
const DIGEST_TYPE = "event_news_digest" as const;

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
type NewsRow = { user_id: string; event_id: string; title: string; slug: string; n: number };

export const eventNewsDigest = {
  /**
   * Un passage de la tâche. `at` est l'instant du passage (jamais l'heure réelle dans les tests). Rend le nombre de comptes
   * traités (réservés) et de notifications créées. `batch` : taille du paquet (500 ; réduite seulement par les tests).
   */
  async run(at: Date = now(), batch = BATCH): Promise<{ accounts: number; sent: number }> {
    const dayStart = parisDayStart(at);
    let accounts = 0;
    let sent = 0;
    for (;;) {
      const done = await withTx(async (tx, after) => {
        const reserved = await tx.execute<Reserved>(sql`
          with picked as (
            select p.user_id, p.event_news_digest_at as since, p.notification_prefs, p.muted_types
            from profiles p
            where p.deleted_at is null and p.banned_at is null
              and (p.suspended_until is null or p.suspended_until <= ${at.toISOString()}::timestamptz)
              and (p.event_news_digest_at is null or p.event_news_digest_at < ${dayStart.toISOString()}::timestamptz)
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
              const since = r.since ? new Date(r.since) : new Date(at.getTime() - FIRST_WINDOW_MS);
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
              select t.user_id, t.event_id from tickets t join u on u.user_id = t.user_id where t.status = 'valid'
            )
            select h.user_id, e.id as event_id, e.title, e.slug, count(fp.id)::int as n
            from holders h
            join u on u.user_id = h.user_id
            join events e on e.id = h.event_id and e.status = 'published'
              and e.ends_at >= ${new Date(at.getTime() - FINISHED_WINDOW_MS).toISOString()}::timestamptz
            join feed_posts fp on fp.event_id = e.id and fp.event_role = 'organizer' and fp.deleted_at is null
              and fp.important_sent_at is null and fp.author_id <> h.user_id
              and fp.created_at > u.since and fp.created_at <= ${at.toISOString()}::timestamptz
            left join event_notification_prefs np on np.user_id = h.user_id and np.event_id = e.id
            where coalesce(np.news, true)
            group by h.user_id, e.id, e.title, e.slug, e.starts_at
            order by h.user_id, e.starts_at, e.id`);
          for (const row of news.rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
        }
        const items = [...byUser.entries()].map(([userId, events]) => {
          const count = events.reduce((sum, e) => sum + e.n, 0);
          const only = events.length === 1 ? events[0] : undefined;
          return {
            userId,
            title: eventNotifyLabels.digestTitle(count),
            body: eventNotifyLabels.digestBody(events.map((e) => e.title)),
            link: only
              ? { label: "Voir l'événement", path: `/e/${only.slug}` }
              : { label: "Ouvrir Orasso", path: "/app" },
          };
        });
        await notificationsService.notifyEach(tx, DIGEST_TYPE, items);
        if (items.length) after(() => notificationsService.kick());
        return { reserved: reserved.rows.length, sent: items.length };
      });
      accounts += done.reserved;
      sent += done.sent;
      if (done.reserved < batch) break;
    }
    return { accounts, sent };
  },
};
