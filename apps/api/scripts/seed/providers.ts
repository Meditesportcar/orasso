// Lot 21 : prestataires. Léa (Lea_11) a un food truck, Paul_Photo est photographe amateur, Garage_Port a un stand
// lié à sa fiche pro. « Nocturne de Canet » attend food truck, photographe, barbier et stands de professionnels ;
// « Expo Rivesaltes » seulement des barbiers. Candidatures sur la Nocturne : Paul retenu et accrédité « média
// officiel », Léa en attente. Idempotent.
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { withTx } from "../../src/lib/tx";
import { accessService } from "../../src/modules/access/service";
import { staffAccount } from "./day-j";
import { fakePhoto, now } from "./helpers";

export async function seedProviders(hash: string) {
  if (await db.query.providerProfiles.findFirst({ where: eq(t.providerProfiles.name, "La Caravane de Léa") })) {
    console.log("Prestataires déjà présents.");
    return;
  }
  const lea = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'lea_11'` });
  const damien = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'damien_66'` });
  const nocturne = await db.query.events.findFirst({ where: eq(t.events.slug, "nocturne-de-canet-2026") });
  const expo = await db.query.events.findFirst({ where: eq(t.events.slug, "expo-rivesaltes-2026") });
  const garage = await db.query.proProfiles.findFirst({ where: eq(t.proProfiles.slug, "garage-du-port") });
  if (!lea || !damien || !nocturne || !expo || !garage)
    throw new Error("Base de départ incomplète pour les prestataires");

  await db
    .update(t.events)
    .set({ vendorTypes: ["Food truck", "Photographe", "Barbier", "Stand de professionnel"] })
    .where(eq(t.events.id, nocturne.id));
  await db
    .update(t.events)
    .set({ vendorTypes: ["Barbier"] })
    .where(eq(t.events.id, expo.id));

  const paul = await staffAccount(hash, "Paul_Photo", "paul.photo@orasso.local", "Paul", "Roca");
  const garageOwner = await db.query.user.findFirst({ where: eq(t.user.id, garage.ownerUserId) });
  if (!garageOwner) throw new Error("Propriétaire du Garage du Port absent");

  const makeProfile = async (
    userId: string,
    slug: string,
    color: string,
    values: Omit<typeof t.providerProfiles.$inferInsert, "userId">,
    photos: number,
  ) => {
    const [row] = await db
      .insert(t.providerProfiles)
      .values({ ...values, userId })
      .returning();
    if (!row) throw new Error("profil prestataire");
    for (let i = 0; i < photos; i++) {
      const key = `seed/providers/${slug}-${i}.webp`;
      await fakePhoto(key, color);
      await db.insert(t.providerPhotos).values({ providerId: row.id, storageKey: key, position: i });
    }
    return row;
  };

  const caravane = await makeProfile(
    lea.userId,
    "caravane",
    "#d4a017",
    {
      type: "food_truck",
      name: "La Caravane de Léa",
      description:
        "Burgers maison, frites fraîches et boissons fraîches. Je viens avec ma remorque aux rassemblements.",
      phone: "06 12 34 56 78",
      email: "lea@orasso.local",
      instagram: "@lacaravane.66",
      departments: ["66", "11"],
    },
    2,
  );
  const paulProfile = await makeProfile(
    paul.id,
    "paul-photo",
    "#1f4e79",
    {
      type: "photographer",
      name: "Paul Roca Photo",
      description: "Photographe amateur : reportages de rassemblements, sans structure.",
      instagram: "@paul.roca.photo",
      portfolioUrl: "https://paul-roca-photo.example",
      departments: ["66"],
    },
    0,
  );
  await makeProfile(
    garageOwner.id,
    "garage-du-port-stand",
    "#8a1c1c",
    {
      type: "stand",
      name: garage.name,
      description: garage.description,
      phone: garage.phone,
      email: garage.email,
      website: garage.website,
      departments: ["66"],
      proProfileId: garage.id,
    },
    1,
  );

  const rows = [
    {
      app: { userId: paul.id, providerProfileId: paulProfile.id, status: "accepted", accreditedMedia: true },
      name: "Paul",
    },
    {
      app: { userId: lea.userId, providerProfileId: caravane.id, status: "pending", accreditedMedia: false },
      name: "Léa",
    },
  ] as const;
  for (const { app } of rows) {
    const created = new Date(now.getTime() - 5 * 86_400_000);
    const [row] = await db
      .insert(t.applications)
      .values({
        eventId: nocturne.id,
        userId: app.userId,
        kind: "provider",
        providerProfileId: app.providerProfileId,
        status: app.status,
        rulesAcceptedAt: created,
        followStructure: false,
        accreditedMedia: app.accreditedMedia,
        decidedAt: app.status === "accepted" ? now : null,
        decidedBy: app.status === "accepted" ? damien.userId : null,
        createdAt: created,
      })
      .returning();
    if (!row) throw new Error("candidature prestataire");
    await db.insert(t.applicationEvents).values([
      {
        applicationId: row.id,
        fromStatus: null,
        toStatus: "pending",
        actor: "user",
        actorUserId: app.userId,
        at: created,
      },
      ...(app.status === "accepted"
        ? [
            {
              applicationId: row.id,
              fromStatus: "pending" as const,
              toStatus: "accepted" as const,
              actor: "organizer" as const,
              actorUserId: damien.userId,
              at: now,
            },
          ]
        : []),
    ]);
    if (app.status === "accepted") await withTx(async (tx) => void (await accessService.issue(tx, row)));
  }
  const total = await db
    .select({ id: t.providerProfiles.id })
    .from(t.providerProfiles)
    .where(inArray(t.providerProfiles.userId, [lea.userId, paul.id, garageOwner.id]));
  console.log(
    `Prestataires : ${total.length} profils (Léa food truck, Paul photographe accrédité, stand du Garage du Port) ; candidatures sur la Nocturne de Canet.`,
  );
}
