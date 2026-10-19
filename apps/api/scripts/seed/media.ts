// Lot 45 : média et accréditation presse (prototype DA v2 `s-agenda`, `s-accred`, `s-contenus`). Léo
// (leo@orasso.local) tient le média « Sud Cars » (photo et vidéo, toute la France). Réglages presse ouverts sur la
// Nocturne de Canet (quota 5, « zone piste 19 h – 21 h · paddock libre ») : Léo accrédité (badge presse émis) ; en
// attente sur le C&C Perpignan ; refusé sur l'Expo Rivesaltes (« Quota presse atteint… ») ; « Béziers Night », passée,
// couverte avec deux contenus (article et vidéo YouTube), la vidéo mise en avant. Idempotent.
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { withTx } from "../../src/lib/tx";
import { accessService } from "../../src/modules/access/service";
import { createAccount, createEvent, DAY, now, parisAt } from "./helpers";

const QUOTA_NOTE = "Quota presse atteint : l'organisation te propose la prochaine édition.";

export async function seedMedia(hash: string) {
  if (await db.query.user.findFirst({ where: eq(t.user.email, "leo@orasso.local") })) {
    console.log("Média déjà présent (Sud Cars).");
    return;
  }
  const damien = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'damien_66'` });
  const bySlug = (slug: string) => db.query.events.findFirst({ where: eq(t.events.slug, slug) });
  const nocturne = await bySlug("nocturne-de-canet-2026");
  const candc = await bySlug("c-et-c-perpignan-2026");
  const expo = await bySlug("expo-rivesaltes-2026");
  if (!damien || !nocturne || !candc || !expo) throw new Error("Base de départ incomplète pour le média");
  const herault =
    (await db.query.structures.findFirst({ where: eq(t.structures.slug, "herault-mecaniques") })) ??
    (await db.query.structures.findFirst({ where: eq(t.structures.id, nocturne.structureId) }));
  if (!herault) throw new Error("Structure absente pour Béziers Night");

  const leo = await createAccount(hash, {
    pseudo: "Leo_SudCars",
    email: "leo@orasso.local",
    firstName: "Léo",
    lastName: "Ferrer",
    departments: ["66"],
  });
  const [media] = await db
    .insert(t.mediaProfiles)
    .values({
      userId: leo.id,
      name: "Sud Cars",
      formats: ["photo", "video"],
      description: "Média auto du Sud : reportages photo et vidéo des rassemblements, de Perpignan à Lyon.",
      website: "https://sudcars.example",
      instagram: "@sudcars",
      youtube: "https://www.youtube.com/@sudcars",
      pressCardNumber: "CP-2026-0412",
      departments: [],
    })
    .returning();
  if (!media) throw new Error("profil média");

  // Béziers Night : passée (fin août), couverte par Sud Cars.
  const beziers = await createEvent(herault.id, damien.userId, {
    title: "Béziers Night",
    slug: "beziers-night-2026",
    format: "night",
    description: "La nuit des japonaises sur les allées Paul-Riquet.",
    startsAt: parisAt(-51, 20),
    endsAt: parisAt(-51, 23, 30),
    addressLine: "Allées Paul-Riquet",
    postalCode: "34500",
    city: "Béziers",
    department: "34",
    lat: 43.344,
    lng: 3.2158,
    capacity: 120,
    publishedAt: new Date(now.getTime() - 80 * DAY),
    registrationsOpenAt: new Date(now.getTime() - 75 * DAY),
  });

  await db.insert(t.eventPressSettings).values([
    {
      eventId: nocturne.id,
      accreditationOpen: true,
      quota: 5,
      zones: "zone piste 19 h – 21 h · paddock libre",
      instructions: "Gilet presse obligatoire, pas de drone. Rendez-vous à l'accueil nord à 18 h 30.",
      contact: "Damien, à l'accueil nord",
    },
    { eventId: candc.id, accreditationOpen: true, zones: "parking libre", instructions: null },
    { eventId: expo.id, accreditationOpen: false, quota: 2 },
    { eventId: beziers.id, accreditationOpen: false, quota: 3, zones: "allées et podium" },
  ]);

  const accreditation = async (
    event: { id: string; startsAt: Date },
    status: "pending" | "accepted" | "refused",
    daysBefore: number,
  ) => {
    const created = new Date(Math.min(now.getTime(), event.startsAt.getTime()) - daysBefore * DAY);
    const decided = status === "pending" ? null : new Date(created.getTime() + DAY);
    const [row] = await db
      .insert(t.applications)
      .values({
        eventId: event.id,
        userId: leo.id,
        kind: "media",
        mediaProfileId: media.id,
        mediaFormats: ["photo", "video"],
        status,
        rulesAcceptedAt: created,
        followStructure: false,
        message: "Reportage photo et vidéo pour Sud Cars.",
        decidedAt: decided,
        decidedBy: decided ? damien.userId : null,
        refusalReasons: status === "refused" ? ["other"] : [],
        refusalNote: status === "refused" ? QUOTA_NOTE : null,
        createdAt: created,
      })
      .returning();
    if (!row) throw new Error("accréditation");
    await db.insert(t.applicationEvents).values([
      { applicationId: row.id, fromStatus: null, toStatus: "pending", actor: "user", actorUserId: leo.id, at: created },
      ...(decided
        ? [
            {
              applicationId: row.id,
              fromStatus: "pending" as const,
              toStatus: status,
              actor: "organizer" as const,
              actorUserId: damien.userId,
              at: decided,
            },
          ]
        : []),
    ]);
    if (status === "accepted") await withTx(async (tx) => void (await accessService.issue(tx, row)));
    return row;
  };
  await accreditation(nocturne, "accepted", 4);
  await accreditation(candc, "pending", 1);
  await accreditation(expo, "refused", 3);
  await accreditation(beziers, "accepted", 12);

  await db.insert(t.mediaContents).values([
    {
      mediaProfileId: media.id,
      eventId: beziers.id,
      kind: "link",
      title: "La nuit des japonaises",
      url: "https://sudcars.example/beziers-night-2026",
      platform: "website",
      views: 610,
      publishedAt: new Date(beziers.endsAt.getTime() + 2 * DAY),
    },
    {
      mediaProfileId: media.id,
      eventId: beziers.id,
      kind: "link",
      title: "Le roll de minuit",
      url: "https://www.youtube.com/watch?v=sudcars-beziers",
      platform: "youtube",
      views: 460,
      featuredAt: new Date(beziers.endsAt.getTime() + 4 * DAY),
      publishedAt: new Date(beziers.endsAt.getTime() + 3 * DAY),
    },
  ]);
  console.log(
    "Média : Sud Cars (Léo) accrédité sur la Nocturne, en attente sur le C&C Perpignan, refusé sur l'Expo Rivesaltes ; deux contenus sur Béziers Night.",
  );
}
