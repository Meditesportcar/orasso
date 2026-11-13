// Lot R9d : l'Activité de la structure (la cloche de l'organisateur). Des lignes réelles, une par responsable, par le vrai
// `notifyStructure` : pour MéditeSportCar (Damien_66, propriétaire, et Sarah_66, co-organisatrice) deux candidatures à trier sur
// la Nocturne, une mention de Kenji_66, un commentaire de Lea_11 sous une publication, la demande de collaboration de Kenji_66
// déjà dans le seed, les demandes de staff en attente ; pour Roues Libres 66 (Sarah_66) une mention et un commentaire.
// Rejouable : rien si une ligne de ce seed (`data.seed = "r9d"`) existe déjà.
import { structureNotificationTexts as T } from "@orasso/shared";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { notifyStructure } from "../../src/modules/notifications/structure";
import { HOUR } from "./helpers";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

export async function seedStructureActivity() {
  // Le marqueur est celui de ce seed (`data.seed`) : d'autres seeds posent déjà des lignes de structure (demandes de staff…).
  const [already] = await db
    .select({ id: t.notifications.id })
    .from(t.notifications)
    .where(sql`${t.notifications.structureId} is not null and ${t.notifications.data} ->> 'seed' = 'r9d'`)
    .limit(1);
  if (already) {
    console.log("Activité de structure : lignes déjà présentes.");
    return;
  }
  const msc = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  const roues = await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") });
  const nocturne = await db.query.events.findFirst({ where: eq(t.events.slug, "nocturne-de-canet-2026") });
  const kenji = await byPseudo("Kenji_66");
  const lea = await byPseudo("Lea_11");
  if (!msc || !roues || !nocturne || !kenji || !lea) {
    console.log("Activité de structure : structure, événement ou comptes absents, rien ajouté.");
    return;
  }
  const mention = (who: string) => ({
    title: `${who} te cite dans une publication`,
    body: `${who} t'a cité dans une publication.`,
    data: { actor: { pseudo: who, avatarUrl: null }, link: "/app/fil" },
  });
  let lines = 0;
  const emit = async (...[ex, structureId, type, input, opts]: Parameters<typeof notifyStructure>) => {
    const marked = { ...input, data: { ...input.data, seed: "r9d" } };
    lines += (await notifyStructure(ex, structureId, type, marked, opts)).length;
  };

  // Deux candidatures à trier sur la Nocturne (une ligne regroupée, compteur à 2).
  for (let i = 0; i < 2; i++) {
    await emit(db, msc.id, "application_received", {
      title: T.applicationVehicle(1, nocturne.title),
      body: "",
      eventId: nocturne.id,
      data: { eventId: nocturne.id, kind: "vehicle", eventName: nocturne.title, screen: "triage" },
      groupKey: `applications:${nocturne.id}:vehicle`,
    });
  }
  await emit(db, msc.id, "feed_post_mention", mention(kenji.pseudo));
  await emit(db, msc.id, "feed_comment", {
    title: T.commentedPost(msc.name).replace("{name}", lea.pseudo),
    body: "« Quelle soirée, merci à toute l'équipe ! »",
    data: { actor: { pseudo: lea.pseudo, avatarUrl: null }, link: "/app/fil" },
  });
  // La demande de collaboration de Kenji_66 (publication en attente, adressée à MéditeSportCar).
  const [invite] = await db
    .select({ postId: t.feedPostCoauthors.postId })
    .from(t.feedPostCoauthors)
    .where(
      and(
        eq(t.feedPostCoauthors.coauthorKind, "structure"),
        eq(t.feedPostCoauthors.coauthorId, msc.id),
        eq(t.feedPostCoauthors.status, "pending"),
      ),
    );
  if (invite) {
    await emit(db, msc.id, "coauthor_invited", {
      title: `${kenji.pseudo} t'invite à publier ensemble`,
      body: `${kenji.pseudo} t'invite à co-signer une publication.`,
      data: {
        actor: { pseudo: kenji.pseudo, avatarUrl: null },
        postId: invite.postId,
        screen: "structure-requests",
      },
      link: { label: "Répondre", path: `/orga/${msc.slug}/activite?vue=demandes` },
    });
  }
  // Une demande de staff en attente.
  for (const m of await db
    .select({ userId: t.structureMembers.userId })
    .from(t.structureMembers)
    .where(and(eq(t.structureMembers.structureId, msc.id), eq(t.structureMembers.status, "requested")))) {
    const p = await db.query.profiles.findFirst({ where: eq(t.profiles.userId, m.userId) });
    await emit(db, msc.id, "staff_request", {
      title: "Demande pour rejoindre le staff",
      body: `${p?.pseudo ?? "Quelqu'un"} voudrait rejoindre le staff de « ${msc.name} ».`,
      data: { screen: "staff-requests" },
    });
  }
  // Roues Libres 66 (Sarah_66) : une mention et un commentaire.
  await emit(db, roues.id, "feed_post_mention", mention(kenji.pseudo));
  await emit(db, roues.id, "feed_comment", {
    title: T.commentedPost(roues.name).replace("{name}", lea.pseudo),
    body: "« Rendez-vous au Lydia ! »",
    data: { actor: { pseudo: lea.pseudo, avatarUrl: null }, link: "/app/fil" },
  });
  // Livrées tout de suite (et non lues), étalées sur la matinée.
  await db
    .update(t.notifications)
    .set({ deliveredAt: new Date(Date.now() - 2 * HOUR) })
    .where(and(isNotNull(t.notifications.structureId), sql`${t.notifications.deliveredAt} is null`));
  console.log(`Activité de structure : ${lines} ligne(s) (MéditeSportCar et Roues Libres 66).`);
}
