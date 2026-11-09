// Seed du lot R7m1 : de quoi voir les partenariats sans rien préparer.
// - « Ses partenaires » sur la fiche de Garage du Port : Kenji_66 (avec sa voiture), Lea_11 et Marc_66 (compte privé : sa
//   voiture ne sort pas pour qui ne le suit pas) ;
// - « Partenaires » sur le profil de Kenji_66 et « Partenaire : Garage du Port » sur sa voiture ;
// - une proposition d'Atelier Covering 66 à Damien_66, dans ses Demandes (avec sa voiture).
// Idempotent : un couple (pro, passionné) déjà lié n'est pas retouché. Aucune notification n'est envoyée, aucune somme.
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { HOUR } from "./helpers";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

/** La voiture principale de la personne (la première active) ; `null` sans véhicule. */
async function firstCar(userId: string): Promise<string | null> {
  const [v] = await db
    .select({ id: t.vehicles.id })
    .from(t.vehicles)
    .where(sql`${t.vehicles.ownerId} = ${userId} and ${t.vehicles.status} = 'active'`)
    .orderBy(t.vehicles.createdAt)
    .limit(1);
  return v?.id ?? null;
}

export async function seedPartnerships() {
  const garage = await db.query.proProfiles.findFirst({ where: eq(t.proProfiles.slug, "garage-du-port") });
  const covering = await db.query.proProfiles.findFirst({ where: eq(t.proProfiles.slug, "atelier-covering-66") });
  if (!garage || !covering) {
    console.log("Partenariats : fiches pro absentes, rien ajouté.");
    return;
  }
  const at = Date.now();
  const plan = [
    {
      pro: garage,
      pseudo: "Kenji_66",
      status: "active",
      message: "Révision offerte, on te suit sur la saison",
      car: true,
      ago: 72,
    },
    {
      pro: garage,
      pseudo: "Lea_11",
      status: "active",
      message: "Préparation moteur à prix d'ami : on te suit",
      car: false,
      ago: 48,
    },
    {
      pro: garage,
      pseudo: "Marc_66",
      status: "active",
      message: "Réglage châssis offert pour la saison",
      car: false,
      ago: 24,
    },
    {
      pro: covering,
      pseudo: "Damien_66",
      status: "pending",
      message: "Covering offert, on te suit sur la saison",
      car: true,
      ago: 1,
    },
  ] as const;
  let added = 0;
  for (const p of plan) {
    const person = await byPseudo(p.pseudo);
    if (!person) continue;
    const open = await db.query.partnerships.findFirst({
      where: sql`${t.partnerships.proId} = ${p.pro.id} and ${t.partnerships.userId} = ${person.userId}`,
    });
    if (open) continue;
    const when = new Date(at - p.ago * HOUR);
    await db.insert(t.partnerships).values({
      proId: p.pro.id,
      userId: person.userId,
      vehicleId: p.car ? await firstCar(person.userId) : null,
      message: p.message,
      status: p.status,
      proposedAt: when,
      respondedAt: p.status === "active" ? new Date(when.getTime() + HOUR) : null,
    });
    added++;
  }
  console.log(
    `Partenariats : ${added} ajouté(s) (Garage du Port : Kenji_66, Lea_11, Marc_66 ; proposition d'Atelier Covering 66 à Damien_66).`,
  );
}
