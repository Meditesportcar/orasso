// Seed du lot R8n1 : de quoi voir les notifications d'un événement avec Damien_66, sans rien préparer.
// - Damien_66 a coupé les « Nouveautés » d'un de ses événements (un événement où il a une place, ni la Nocturne ni le Lydia,
//   qui servent d'exemples ci-dessous) : sa ligne `event_notification_prefs` ;
// - dans son Activité : un résumé « 3 nouveautés pour tes sorties » (Rassemblement du Lydia, Nocturne de Canet) et un exemple
//   d'Essentiel (changement d'heure de la Nocturne), tels que la maquette R8.11 les montre.
// Idempotent : chaque ligne porte une marque (`data.seed`), posée une seule fois ; la préférence est un `on conflict do nothing`.
// Aucune notification n'est envoyée (insérées déjà livrées, jamais de push).
import { eventNotifyLabels } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { HOUR } from "./helpers";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

/** Insère la notification une seule fois (marque `data.seed`), déjà livrée et non lue. */
async function once(
  userId: string,
  key: string,
  row: {
    type: "event_updated" | "event_news_digest";
    title: string;
    body: string;
    hoursAgo: number;
    eventId?: string | null;
    data?: Record<string, unknown>;
  },
) {
  const exists = await db
    .select({ id: t.notifications.id })
    .from(t.notifications)
    .where(and(eq(t.notifications.userId, userId), sql`${t.notifications.data} ->> 'seed' = ${key}`))
    .limit(1);
  if (exists.length) return false;
  const at = new Date(Date.now() - row.hoursAgo * HOUR);
  await db.insert(t.notifications).values({
    userId,
    type: row.type,
    family: "event",
    title: row.title,
    body: row.body,
    data: { ...row.data, seed: key },
    eventId: row.eventId ?? null,
    deliverAfter: at,
    deliveredAt: at,
    createdAt: at,
  });
  return true;
}

export async function seedEventNotifications() {
  const damien = await byPseudo("Damien_66");
  if (!damien) {
    console.log("Notifications d'un événement : Damien_66 absent, rien ajouté.");
    return;
  }
  const lydia = await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-du-lydia") });
  const nocturne = await db.query.events.findFirst({ where: eq(t.events.slug, "nocturne-de-canet-2026") });

  // L'événement dont Damien a coupé les Nouveautés : une place de sa part, hors les deux exemples.
  const placed = await db.execute<{ id: string }>(sql`select e.id from events e
      where e.status = 'published'
        and (exists (select 1 from applications a where a.event_id = e.id and a.user_id = ${damien.userId}
              and a.status in ('pending', 'accepted', 'waitlisted', 'offered', 'awaiting_member'))
          or exists (select 1 from tickets k where k.event_id = e.id and k.user_id = ${damien.userId} and k.status = 'valid'))
      order by e.starts_at`);
  const examples = new Set([lydia?.id, nocturne?.id]);
  const muted = placed.rows.find((r) => !examples.has(r.id));
  let prefs = 0;
  if (muted) {
    const done = await db
      .insert(t.eventNotificationPrefs)
      .values({ userId: damien.userId, eventId: muted.id, news: false })
      .onConflictDoNothing()
      .returning({ userId: t.eventNotificationPrefs.userId });
    prefs = done.length;
  } else {
    console.log("Notifications d'un événement : Damien_66 n'a pas d'autre place, aucune préférence posée.");
  }

  let added = 0;
  // Un résumé du jour (les trois niveaux de la maquette : Nouveautés).
  if (
    await once(damien.userId, "event-notifications:digest", {
      type: "event_news_digest",
      title: eventNotifyLabels.digestTitle(3),
      body: eventNotifyLabels.digestBody([
        lydia?.title ?? "Rassemblement du Lydia",
        nocturne?.title ?? "Nocturne de Canet",
      ]),
      hoursAgo: 4,
      data: { link: "/app", linkLabel: "Ouvrir Orasso" },
    })
  ) {
    added += 1;
  }
  // Un exemple d'Essentiel (changement d'heure de la Nocturne).
  if (
    await once(damien.userId, "event-notifications:essential", {
      type: "event_updated",
      title: "Nocturne de Canet · ouverture à 18 h au lieu de 19 h",
      body: "Ton arrivée devient 17 h 30 – 18 h 15.",
      hoursAgo: 6,
      eventId: nocturne?.id ?? null,
      data: nocturne ? { link: `/e/${nocturne.slug}`, linkLabel: "Voir l'événement" } : {},
    })
  ) {
    added += 1;
  }
  console.log(
    `Notifications d'un événement : ${prefs} préférence(s), ${added} notification(s) de démonstration ajoutée(s).`,
  );
}
