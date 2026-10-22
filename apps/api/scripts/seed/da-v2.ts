// Lot C5 (vague de conformité DA v2, audit `ECARTS.md` § 7, cas (c)) : les données dont les écrans de l'artefact ont
// besoin pour ressembler à l'artefact. Tout est idempotent (rien n'est refait si c'est là).
//  - `seedMscLogo` : le logo de MéditeSportCar (artefact) à la place du carré « M » ; avant les affiches (elles le portent).
//  - `seedDaV2Events` : les éditions passées de la structure, pour que l'équipe ait des historiques variés (2 à 27), avant
//    les affiches (chaque événement reçoit sa photo de voiture). Le prochain accès de Kenji est la Nocturne de Canet à J-6
//    (seed de base, comme l'artefact) ; le « ce soir » est le Salon Argelès (seed du lot 06).
//  - `seedVisitorStamps` : des tampons « visite » pour Paul (visiteur), l'état vide du passeport restant l'état de repli.
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { storage } from "../../src/lib/storage";
import { createEvent, parisAt } from "./helpers";
import { stamp } from "./passport";
import { mscLogo } from "./photos";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

/** Éditions passées de MéditeSportCar en tout, pour que le plus assidu de l'équipe en ait 27 (échelle des bulles 30-95 px). */
export const TEAM_HISTORY_EVENTS = 27;

/** Engagement de l'équipe : événements passés tenus, de 2 à 27 (bulles de tailles variées). */
export const TEAM_ENGAGEMENT: [string, number][] = [
  ["Damien_66", 27],
  ["Julie_66", 23],
  ["Sarah_66", 16],
  ["Theo_66", 9],
  ["Marc_66", 5],
  ["Nina_34", 2],
];

export async function seedMscLogo() {
  const msc = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  if (!msc || msc.logoKey) return;
  const key = "seed/logos/meditesportcar.webp";
  await storage.put(key, await mscLogo());
  await db.update(t.structures).set({ logoKey: key }).where(eq(t.structures.id, msc.id));
  console.log("Logo de MéditeSportCar posé.");
}

const EDITIONS = [
  { title: "Rassemblement du port", format: "gathering", hour: 10 },
  { title: "Soirée du port", format: "night", hour: 19 },
  { title: "Cars & Coffee de la plage", format: "cars_and_coffee", hour: 9 },
  { title: "Exposition du dimanche", format: "exhibition", hour: 10 },
] as const;

export async function seedDaV2Events() {
  const msc = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  const damien = await byPseudo("Damien_66");
  const kenji = await byPseudo("Kenji_66");
  if (!msc || !damien || !kenji) return;
  let notes = "";
  // --- Éditions passées de la structure --------------------------------------------------------------------------
  const counted = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.events)
    .where(
      sql`${t.events.structureId} = ${msc.id} and ${t.events.status} = 'published' and ${t.events.endsAt} < now()`,
    );
  const have = counted[0]?.n ?? 0;
  let created = 0;
  for (let k = have; k < TEAM_HISTORY_EVENTS; k++) {
    const ed = EDITIONS[k % EDITIONS.length] as (typeof EDITIONS)[number];
    const slug = `msc-edition-${String(k + 1).padStart(2, "0")}`;
    if (await db.query.events.findFirst({ where: eq(t.events.slug, slug) })) continue;
    const days = 220 + (k - have) * 17;
    await createEvent(msc.id, damien.userId, {
      title: `${ed.title} n° ${k + 1}`,
      slug,
      format: ed.format,
      startsAt: parisAt(-days, ed.hour),
      endsAt: parisAt(-days, ed.hour + 4),
      addressLine: "Parking du port",
      postalCode: "66140",
      city: "Canet-en-Roussillon",
      department: "66",
      lat: 42.7046,
      lng: 3.0352,
      capacity: 60,
      publishedAt: parisAt(-days - 40, 12),
      registrationsOpenAt: parisAt(-days - 35, 12),
      settledAt: parisAt(-days + 2, ed.hour + 4),
    });
    created++;
  }
  if (created) notes += `${notes ? ", " : ""}${created} édition(s) passée(s) de la structure`;
  if (notes) console.log(`Conformité DA v2 : ${notes}.`);
}

/** Tampons « visite » de Paul (visiteur) sur les sorties passées de la saison ; sans billet scanné, donc `ticketId` nul. */
export async function seedVisitorStamps() {
  const paul = await byPseudo("Paul_Photo");
  if (!paul) return;
  const slugs = ["c-et-c-ceret-2026", "expo-du-boulou-2026", "salon-de-perpignan-2026", "beziers-night-2026"];
  let done = 0;
  for (const slug of slugs) {
    const event = await db.query.events.findFirst({ where: eq(t.events.slug, slug) });
    if (!event) continue;
    await stamp(paul.userId, event, "visit", new Date(event.startsAt.getTime() + 40 * 60_000));
    done++;
  }
  if (done) console.log(`Conformité DA v2 : ${done} tampon(s) de visite pour Paul_Photo.`);
}
