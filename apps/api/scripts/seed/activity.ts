// Seed du lot R7c1 : de quoi voir la cloche (Activité) et les Demandes de Damien_66 sans rien préparer.
// - 12 notifications sur trois jours, livrées et non lues : un horaire modifié du Rassemblement du Lydia, 5 flammes
//   regroupées (fictives : aucune story n'existe encore, seulement `data`), des identifications, un vote, un podium…
// - 3 demandes de genres différents : une demande de message (Nina_34), une invitation entre passionnés (Kenji_66, à
//   Narbonne) et une invitation à rejoindre le staff d'une structure (Sarah_66).
// Idempotent : chaque ligne porte une marque (`data.seed`), posée une seule fois. Aucune notification n'est envoyée (insérées
// déjà livrées, jamais de push). Le Lydia peut être recréé par son seed : l'horaire modifié est reposé s'il a disparu.
import { type NotificationType, notificationTypes, r7DefaultContent, r7NotificationTable } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { storage } from "../../src/lib/storage";
import { HOUR } from "./helpers";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

type Row = {
  key: string;
  type: NotificationType;
  /** Il y a combien d'heures. */
  hoursAgo: number;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  eventId?: string | null;
  groupKey?: string;
  read?: boolean;
};

export async function seedActivity() {
  const damien = await byPseudo("Damien_66");
  if (!damien) {
    console.log("Activité : Damien_66 absent, rien ajouté.");
    return;
  }
  const people = Object.fromEntries(
    await Promise.all(
      ["Kenji_66", "Lea_11", "Julie_66", "Theo_66", "Nina_34", "Marc_66", "Sarah_66"].map(
        async (p) => [p.split("_")[0] as string, await byPseudo(p)] as const,
      ),
    ),
  );
  const who = (name: string) => people[name]?.pseudo ?? name;
  const actor = (name: string) => {
    const p = people[name];
    return { userId: p?.userId ?? "", pseudo: who(name), avatarUrl: storage.url(p?.avatarKey ?? null) };
  };
  const lydia = await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-du-lydia") });
  const narbonne = await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-narbonne") });

  const likers = ["Kenji", "Lea", "Julie", "Theo", "Nina"].map(actor).filter((a) => a.userId);
  const content = (type: keyof typeof r7NotificationTable, name: string) => r7DefaultContent(type, name);

  const rows: Row[] = [
    // Aujourd'hui
    {
      key: "schedule_change",
      type: "schedule_change",
      hoursAgo: 0.7,
      ...content("schedule_change", lydia?.title ?? "Rassemblement du Lydia"),
      body: "L'horaire du Rassemblement du Lydia a changé : l'ouverture passe à 9 h 30.",
      eventId: lydia?.id ?? null,
      data: lydia ? { link: `/e/${lydia.slug}`, linkLabel: "Voir l'événement" } : {},
    },
    {
      key: "story_like",
      type: "story_like",
      hoursAgo: 1.5,
      ...content("story_like", who("Kenji")),
      groupKey: "story_like:seed-demo",
      data: {
        count: likers.length,
        _actorIds: likers.map((a) => a.userId),
        actors: likers.slice(0, 3).map((a) => ({ pseudo: a.pseudo, avatarUrl: a.avatarUrl })),
      },
    },
    { key: "story_mention", type: "story_mention", hoursAgo: 3, ...content("story_mention", who("Julie")), data: { actor: actor("Julie") } },
    {
      key: "vote_opened",
      type: "vote_opened",
      hoursAgo: 5,
      ...content("vote_opened", "Toutes catégories"),
      eventId: lydia?.id ?? null,
    },
    // Hier
    {
      key: "user_followed",
      type: "user_followed",
      hoursAgo: 20,
      title: "Nouvel abonné",
      body: `${who("Nina")} te suit.`,
      data: { actor: actor("Nina"), actorIds: [actor("Nina").userId], pseudos: [who("Nina")] },
    },
    { key: "vote_podium", type: "vote_podium", hoursAgo: 22, ...content("vote_podium", "Plus belle japonaise"), eventId: lydia?.id ?? null },
    { key: "presence_validated", type: "presence_validated", hoursAgo: 26, ...content("presence_validated", lydia?.title ?? "Rassemblement du Lydia"), eventId: lydia?.id ?? null },
    {
      key: "event_updated",
      type: "event_updated",
      hoursAgo: 28,
      title: "Événement modifié",
      body: "Le lieu de rendez-vous du Rassemblement de Narbonne a changé.",
      eventId: narbonne?.id ?? null,
      read: true,
    },
    // Il y a deux jours
    { key: "memory", type: "memory", hoursAgo: 44, ...content("memory", "la Nocturne de Canet"), data: { actor: actor("Kenji") } },
    {
      key: "follow_accepted",
      type: "follow_accepted",
      hoursAgo: 46,
      title: "Demande acceptée",
      body: `${who("Marc")} a accepté ta demande.`,
      data: { actor: actor("Marc") },
      read: true,
    },
    { key: "spot_meetup_reply", type: "spot_meetup_reply", hoursAgo: 50, ...content("spot_meetup_reply", who("Theo")), data: { actor: actor("Theo") } },
    { key: "partnership_accepted", type: "partnership_accepted", hoursAgo: 52, ...content("partnership_accepted", "Wrap 66"), read: true },
  ];

  let added = 0;
  for (const r of rows) {
    const exists = await db
      .select({ id: t.notifications.id })
      .from(t.notifications)
      .where(
        and(
          eq(t.notifications.userId, damien.userId),
          sql`${t.notifications.data} ->> 'seed' = ${`activity:${r.key}`}`,
        ),
      )
      .limit(1);
    if (exists.length) continue;
    const at = new Date(Date.now() - r.hoursAgo * HOUR);
    await db.insert(t.notifications).values({
      userId: damien.userId,
      type: r.type,
      family: notificationTypes[r.type],
      title: r.title,
      body: r.body,
      data: { ...r.data, seed: `activity:${r.key}` },
      eventId: r.eventId ?? null,
      groupKey: r.groupKey ?? null,
      deliverAfter: at,
      deliveredAt: at,
      readAt: r.read ? at : null,
      createdAt: at,
    });
    added += 1;
  }

  // Trois demandes de genres différents.
  const nina = people.Nina;
  const kenji = people.Kenji;
  const sarah = people.Sarah;
  let requests = 0;
  if (nina) {
    const done = await db
      .insert(t.contactRequests)
      .values({
        fromUserId: nina.userId,
        toUserId: damien.userId,
        message: "Salut Damien, ta Nissan était au Lydia ? Elle est superbe, je peux te poser une question sur la préparation ?",
      })
      .onConflictDoNothing()
      .returning({ id: t.contactRequests.id });
    requests += done.length;
  }
  if (kenji && narbonne) {
    const done = await db
      .insert(t.eventPeerInvitations)
      .values({
        eventId: narbonne.id,
        inviterId: kenji.userId,
        inviteeId: damien.userId,
        note: "Viens avec la Nissan, on se met côte à côte !",
      })
      .onConflictDoNothing()
      .returning({ id: t.eventPeerInvitations.id });
    requests += done.length;
  }
  if (sarah) {
    const structure = await db.query.structures.findFirst({
      where: sql`${t.structures.id} in (select structure_id from structure_members where user_id = ${sarah.userId} and role = 'owner' and status = 'active')`,
    });
    if (structure) {
      const done = await db
        .insert(t.structureMembers)
        .values({ structureId: structure.id, userId: damien.userId, role: "staff", status: "invited", invitedBy: sarah.userId })
        .onConflictDoNothing()
        .returning({ id: t.structureMembers.id });
      requests += done.length;
    }
  }
  console.log(`Activité : ${added} notification(s) et ${requests} demande(s) ajoutée(s) pour Damien_66.`);
}
