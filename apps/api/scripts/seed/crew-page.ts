// Lot R5c2 : la page de « Roussillon Drift » devient vivante (maquette R5.7) : bannière (photo du seed, aucune plaque
// visible : photos regardées une à une au lot R4b), Instagram, une sortie du crew proposée par Kenji avec ses réponses.
// Par les vrais services (droits, notifications calmes). Idempotent : rien si le crew a déjà une sortie.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { crewOutingsService } from "../../src/modules/crews/outings";
import { crewsService } from "../../src/modules/crews/service";
import { parisAt } from "./helpers";
import { ASSETS_DIR } from "./photos";

async function viewer(pseudo: string): Promise<Viewer | null> {
  const profile = await db.query.profiles.findFirst({
    where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}`,
  });
  if (!profile) return null;
  const [u] = await db.select().from(t.user).where(eq(t.user.id, profile.userId));
  return u ? { user: u as AuthUser, profile, session: { secondFactor: null } } : null;
}

export async function seedCrewPage() {
  const crew = await db.query.crews.findFirst({ where: eq(t.crews.slug, "roussillon-drift") });
  if (!crew || crew.deletedAt) {
    console.log("Page du crew : « Roussillon Drift » absent, rien ajouté.");
    return;
  }
  if (await db.query.crewOutings.findFirst({ where: eq(t.crewOutings.crewId, crew.id) })) {
    console.log("Page du crew : sortie de « Roussillon Drift » déjà présente.");
    return;
  }
  const [kenji, lea, nina, theo] = await Promise.all(["Kenji_66", "Lea_11", "Nina_34", "Theo_66"].map(viewer));
  if (!kenji) return;
  await crewsService.update(kenji, crew.id, { instagram: "roussillondrift" });
  const photo = await readFile(join(ASSETS_DIR, "photos", "car-gtr.jpg"));
  await crewsService.setBanner(
    kenji,
    crew.id,
    new File([new Uint8Array(photo)], "banniere.jpg", { type: "image/jpeg" }),
    undefined,
    true,
  );
  const outing = await crewOutingsService.create(kenji, crew.id, {
    title: "Balade des Aspres",
    startsAt: parisAt(6, 9),
    place: "Parking de la cave coopérative, Thuir",
    lat: 42.632,
    lng: 2.756,
    program: "Café à Thuir, puis la route de Castelnou et Prades. Retour vers 13 h.",
  });
  await crewOutingsService.rsvp(kenji, crew.id, outing.id, "yes");
  for (const p of [lea, nina]) if (p) await crewOutingsService.rsvp(p, crew.id, outing.id, "yes");
  if (theo) await crewOutingsService.rsvp(theo, crew.id, outing.id, "maybe");
  console.log("Page du crew : « Roussillon Drift » avec bannière, Instagram et la « Balade des Aspres » (3 viennent).");
}
