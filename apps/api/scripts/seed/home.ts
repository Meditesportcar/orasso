// Lot 30 : de quoi essayer l'Accueil complet. Deux emplacements sponsorisés (l'un ciblé département 66 + JDM, l'autre
// ouvert à tous), un garage favori pour Kenji, et un cache factice des sources externes (lavage, carburant) pour que le
// widget s'affiche sans réseau : une vraie réponse (cache expiré) les remplace. Idempotent.
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { now } from "./helpers";

const DAY = 86_400_000;

const day = (offset: number) => new Date(now.getTime() + offset * DAY).toISOString().slice(0, 10);

export async function seedHome() {
  // --- Garage favori de Kenji ---------------------------------------------------------------------------------
  const kenji = await db.query.user.findFirst({ where: eq(t.user.email, "kenji@orasso.local") });
  const garage = await db.query.proProfiles.findFirst({ where: eq(t.proProfiles.slug, "garage-du-port") });
  if (kenji && garage) {
    await db
      .insert(t.proFollows)
      .values({ proId: garage.id, userId: kenji.id, favorite: true })
      .onConflictDoUpdate({ target: [t.proFollows.proId, t.proFollows.userId], set: { favorite: true } });
  }

  // --- Emplacements sponsorisés ---------------------------------------------------------------------------------
  const detailing = await db.query.proProfiles.findFirst({ where: eq(t.proProfiles.slug, "detailing-pyrenees") });
  const covering = await db.query.proProfiles.findFirst({ where: eq(t.proProfiles.slug, "atelier-covering-66") });
  const jdm = await db.query.categories.findFirst({ where: eq(t.categories.slug, "jdm") });
  if (
    detailing &&
    !(await db.query.sponsoredPlacements.findFirst({ where: eq(t.sponsoredPlacements.title, "Polish avant saison") }))
  ) {
    await db.insert(t.sponsoredPlacements).values({
      proProfileId: detailing.id,
      title: "Polish avant saison",
      body: "-15 % sur le polish complet pour les passionnés JDM des Pyrénées-Orientales.",
      linkUrl: "https://orasso.fr",
      departments: ["66"],
      categoryIds: jdm ? [jdm.id] : [],
      startsOn: day(-30),
      endsOn: day(60),
      dailyCap: 500,
      priceCents: 4900,
      status: "active",
    });
  }
  if (
    covering &&
    !(await db.query.sponsoredPlacements.findFirst({ where: eq(t.sponsoredPlacements.title, "Covering sur mesure") }))
  ) {
    await db.insert(t.sponsoredPlacements).values({
      proProfileId: covering.id,
      title: "Covering sur mesure",
      body: "Change la couleur de ta voiture sans la repeindre. Devis gratuit.",
      linkUrl: "https://orasso.fr",
      departments: [],
      categoryIds: [],
      startsOn: day(-30),
      endsOn: day(60),
      dailyCap: null,
      priceCents: 4900,
      status: "active",
    });
  }

  // --- Cache factice des sources externes (Perpignan et Aude), valable pour la démonstration -----------------------
  const fetchedAt = now;
  const caches: Record<string, unknown> = {
    "wash:66": [
      {
        name: "Lavage Les Pins (démonstration)",
        address: "12 avenue du Roussillon, 66000 Perpignan",
        lat: 42.7035,
        lng: 2.8958,
      },
      {
        name: "Station de lavage haute pression (démonstration)",
        address: "Route de Canet, 66000 Perpignan",
        lat: 42.7202,
        lng: 2.9317,
      },
      {
        name: "Lavage automatique du Port (démonstration)",
        address: "Port, 66140 Canet-en-Roussillon",
        lat: 42.6892,
        lng: 3.0344,
      },
    ],
    "fuel:66": [
      {
        name: "Station-service",
        address: "Avenue de Prades, 66000 Perpignan (démonstration)",
        lat: 42.6996,
        lng: 2.9001,
        prices: { sp95: 1.859, sp98: 1.949, gazole: 1.789, e85: 0.799 },
        updatedAt: fetchedAt.toISOString(),
      },
      {
        name: "Station-service",
        address: "Zone de Saint-Charles, 66000 Perpignan (démonstration)",
        lat: 42.6867,
        lng: 2.8741,
        prices: { sp95: 1.839, sp98: null, gazole: 1.769, e85: null },
        updatedAt: fetchedAt.toISOString(),
      },
      {
        name: "Station-service",
        address: "Route de Thuir, 66000 Perpignan (démonstration)",
        lat: 42.7108,
        lng: 2.9252,
        prices: { sp95: 1.879, sp98: 1.969, gazole: 1.809, e85: 0.819 },
        updatedAt: fetchedAt.toISOString(),
      },
    ],
  };
  for (const [key, data] of Object.entries(caches)) {
    const exists = await db.query.externalCache.findFirst({
      where: and(eq(t.externalCache.key, key)),
    });
    if (!exists) await db.insert(t.externalCache).values({ key, fetchedAt, data });
  }
  console.log("Accueil : garage favori, emplacements sponsorisés et cache factice des sources externes.");
}
