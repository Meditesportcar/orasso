// Lot R9e : albums des médias. Les galeries d'avant (celle de Béziers Night, créée par `seed/media.ts` après les migrations) sont
// reprises en albums par la même reprise que la migration (`allow_save` faux). Sud Cars (Léo) est accrédité sur le « Rassemblement de
// la Côte Vermeille » de l'an dernier et y publie un album de 12 photos (deux « floutées », cadres factices), « Enregistrer »
// autorisé ; un brouillon de 3 photos attend sur la Nocturne de Canet. « Objectif 66 » de la maquette est un nom inventé : le seed
// garde Sud Cars (T36). Photos : seulement celles du seed (`assets/photos`, relues « aucune plaque lisible »). Idempotent.
//
// Lot R9f : des identifications sur cet album (T37 à T42). La voiture de Damien (pointée à l'événement par `seed/memories.ts`) est identifiée
// par le média sur 5 photos et par lui-même sur une sixième (« 6 photos de ta … ») ; Kenji_66 (place retenue et pointée) l’est par son pseudo ;
// Lea_11 (place retenue et pointée) a retiré une identification (« Ce n'est pas moi », `not_mine`). Damien reçoit la notification `album_tagged`
// (5 photos : jamais celle qu'il a posée lui-même), livrée tout de suite.
import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { storage } from "../../src/lib/storage";
import { withTx } from "../../src/lib/tx";
import { accessService } from "../../src/modules/access/service";
import { adoptLegacyGalleries } from "../../src/modules/albums/reprise";
import { sendTaggedNotifications } from "../../src/modules/albums/tags-notify";
import { albumPhotoKey } from "../../src/modules/albums/view";
import { blurPlateRegions } from "../../src/modules/vehicles/photos-blur";
import { apply, DAY, HOUR, now } from "./helpers";
import { putRealPhoto } from "./photos";

const RASSEMBLEMENT = "rassemblement-cote-vermeille-2025";
const NOCTURNE = "nocturne-de-canet-2026";
const PUBLISHED_TITLE = "Les photos du Rassemblement Côte Vermeille";
/** Cadres factices des deux photos « floutées » : le seed les floute vraiment (l'état de la photo est vrai). */
const FAKE_RECTS = [{ x: 0.62, y: 0.7, w: 0.2, h: 0.08 }];

async function addPhotos(albumId: string, count: number, blurred: number[]) {
  for (let i = 0; i < count; i++) {
    const key = albumPhotoKey(albumId, randomBytes(16).toString("hex"));
    const put = await putRealPhoto(key, "car", i + 2);
    let { width, height } = put;
    const isBlurred = blurred.includes(i);
    if (isBlurred) {
      const source = await storage.get(key);
      if (!source) throw new Error(`Photo du seed absente : ${key}`);
      const out = await blurPlateRegions(source, FAKE_RECTS);
      await storage.put(key, out.data);
      width = out.info.width;
      height = out.info.height;
    }
    await db.insert(t.eventAlbumPhotos).values({
      albumId,
      storageKey: key,
      width,
      height,
      position: i,
      plateState: isBlurred ? "blurred" : "none",
      plateRects: isBlurred ? FAKE_RECTS : null,
    });
  }
  await db.update(t.eventAlbums).set({ photosCount: count }).where(eq(t.eventAlbums.id, albumId));
}

export async function seedAlbums() {
  // Les galeries d'avant deviennent des albums (la galerie de Béziers Night : 4 photos, `allow_save` faux).
  const adopted = await adoptLegacyGalleries(db);
  if (adopted) console.log(`Albums : ${adopted} galerie(s) reprise(s) en album.`);

  const [leo] = await db.select({ id: t.user.id }).from(t.user).where(eq(t.user.email, "leo@orasso.local"));
  const media = leo ? await db.query.mediaProfiles.findFirst({ where: eq(t.mediaProfiles.userId, leo.id) }) : null;
  const rassemblement = await db.query.events.findFirst({ where: eq(t.events.slug, RASSEMBLEMENT) });
  const nocturne = await db.query.events.findFirst({ where: eq(t.events.slug, NOCTURNE) });
  if (!leo || !media || !rassemblement || !nocturne) {
    console.log("Albums : Sud Cars ou ses événements absents, album de démonstration ignoré.");
    return;
  }

  // Sud Cars est accrédité sur le Rassemblement de la Côte Vermeille (candidature ajoutée si absente).
  const [existing] = await db
    .select({ id: t.applications.id })
    .from(t.applications)
    .where(and(eq(t.applications.eventId, rassemblement.id), eq(t.applications.mediaProfileId, media.id)));
  if (!existing) {
    const created = new Date(rassemblement.startsAt.getTime() - 10 * DAY);
    const decided = new Date(created.getTime() + DAY);
    const damien = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'damien_66'` });
    const organizer = damien?.userId;
    const [row] = await db
      .insert(t.applications)
      .values({
        eventId: rassemblement.id,
        userId: leo.id,
        kind: "media",
        mediaProfileId: media.id,
        mediaFormats: ["photo"],
        status: "accepted",
        rulesAcceptedAt: created,
        followStructure: false,
        message: "Reportage photo pour Sud Cars.",
        decidedAt: decided,
        decidedBy: organizer ?? null,
        refusalReasons: [],
        createdAt: created,
      })
      .returning();
    if (!row) throw new Error("accréditation du Rassemblement");
    await db.insert(t.applicationEvents).values([
      { applicationId: row.id, fromStatus: null, toStatus: "pending", actor: "user", actorUserId: leo.id, at: created },
      {
        applicationId: row.id,
        fromStatus: "pending" as const,
        toStatus: "accepted" as const,
        actor: "organizer" as const,
        actorUserId: organizer ?? leo.id,
        at: decided,
      },
    ]);
    await withTx(async (tx) => void (await accessService.issue(tx, row)));
  }

  // L'album publié : 12 photos de démonstration.
  const [published] = await db
    .select({ id: t.eventAlbums.id })
    .from(t.eventAlbums)
    .where(
      and(
        eq(t.eventAlbums.eventId, rassemblement.id),
        eq(t.eventAlbums.mediaProfileId, media.id),
        eq(t.eventAlbums.status, "published"),
        isNull(t.eventAlbums.deletedAt),
      ),
    );
  if (!published) {
    const [album] = await db
      .insert(t.eventAlbums)
      .values({
        eventId: rassemblement.id,
        mediaProfileId: media.id,
        authorId: leo.id,
        title: PUBLISHED_TITLE,
        allowSave: true,
        status: "published",
        publishedAt: new Date(now.getTime() - 3 * HOUR),
      })
      .returning({ id: t.eventAlbums.id });
    if (!album) throw new Error("album du Rassemblement");
    await addPhotos(album.id, 12, [3, 8]);
    console.log("Albums : « Les photos du Rassemblement Côte Vermeille » (12 photos) publié par Sud Cars.");
  }

  // Le brouillon de 3 photos sur la Nocturne de Canet (Léo y est accrédité).
  const [draft] = await db
    .select({ id: t.eventAlbums.id })
    .from(t.eventAlbums)
    .where(
      and(
        eq(t.eventAlbums.eventId, nocturne.id),
        eq(t.eventAlbums.mediaProfileId, media.id),
        eq(t.eventAlbums.status, "draft"),
        isNull(t.eventAlbums.deletedAt),
      ),
    );
  if (!draft) {
    const [album] = await db
      .insert(t.eventAlbums)
      .values({ eventId: nocturne.id, mediaProfileId: media.id, authorId: leo.id, status: "draft" })
      .returning({ id: t.eventAlbums.id });
    if (!album) throw new Error("brouillon de la Nocturne");
    await addPhotos(album.id, 3, []);
    console.log("Albums : un brouillon de 3 photos sur la Nocturne de Canet.");
  }
  // Lot R9f : les identifications de l'album publié.
  await seedAlbumTags();
}

/** Une identification (idempotente : les deux index uniques sont sans filtre). */
async function tag(
  photoId: string,
  who: { kind: "vehicle"; vehicleId: string; userId: string } | { kind: "user"; userId: string },
  by: { userId: string; as: "media" | "owner" },
  over: Partial<typeof t.albumPhotoTags.$inferInsert> = {},
) {
  await db
    .insert(t.albumPhotoTags)
    .values({
      photoId,
      targetKind: who.kind,
      vehicleId: who.kind === "vehicle" ? who.vehicleId : null,
      userId: who.userId,
      taggedBy: by.userId,
      taggedAs: by.as,
      ...over,
    })
    .onConflictDoNothing();
}

/**
 * Une place à l'événement (« une place ou une présence » : la personne peut être identifiée par son pseudo) : sa candidature **retenue**
 * avec sa première voiture active, entrée (pointée) après celle de Damien (qui garde le n° 1 du plateau). Aucune présence GPS ; une candidature
 * retenue et pointée alimente aussi le souvenir, le passeport, le récap, les points et les votes de cet événement d'il y a un an. Rend `false` si la personne n'a pas de voiture active (pas d'identification alors).
 */
async function seatAt(event: typeof t.events.$inferSelect, userId: string, decidedBy: string, enteredAt: Date) {
  const existing = await db.query.applications.findFirst({
    where: and(eq(t.applications.eventId, event.id), eq(t.applications.userId, userId)),
  });
  // Seule une candidature **retenue** est pointée : en attente, refusée ou retirée, elle reste telle quelle (pas de place, pas d'identification).
  if (existing && existing.status !== "accepted") return false;
  let applicationId = existing?.id;
  if (!applicationId) {
    const [car] = await db
      .select({ id: t.vehicles.id })
      .from(t.vehicles)
      .where(and(eq(t.vehicles.ownerId, userId), eq(t.vehicles.status, "active")))
      .orderBy(t.vehicles.createdAt)
      .limit(1);
    if (!car) return false;
    const row = await apply(event, { id: car.id, ownerId: userId }, "accepted", {
      decidedBy,
      createdAt: new Date(event.startsAt.getTime() - 10 * DAY),
    });
    applicationId = row.id;
  }
  await db
    .insert(t.checkins)
    .values({ applicationId, eventId: event.id, method: "scan", checkedInAt: enteredAt })
    .onConflictDoNothing();
  return true;
}

export async function seedAlbumTags() {
  const rassemblement = await db.query.events.findFirst({ where: eq(t.events.slug, RASSEMBLEMENT) });
  const byPseudo = (pseudo: string) =>
    db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });
  const [leo] = await db.select({ id: t.user.id }).from(t.user).where(eq(t.user.email, "leo@orasso.local"));
  const media = leo ? await db.query.mediaProfiles.findFirst({ where: eq(t.mediaProfiles.userId, leo.id) }) : null;
  const [damien, kenji, lea] = await Promise.all([byPseudo("Damien_66"), byPseudo("Kenji_66"), byPseudo("Lea_11")]);
  if (!rassemblement || !leo || !media || !damien || !kenji || !lea) return;
  const [album] = await db
    .select({ id: t.eventAlbums.id })
    .from(t.eventAlbums)
    .where(
      and(
        eq(t.eventAlbums.eventId, rassemblement.id),
        eq(t.eventAlbums.mediaProfileId, media.id),
        eq(t.eventAlbums.status, "published"),
        isNull(t.eventAlbums.deletedAt),
      ),
    );
  if (!album) return;
  const photos = await db
    .select({ id: t.eventAlbumPhotos.id })
    .from(t.eventAlbumPhotos)
    .where(and(eq(t.eventAlbumPhotos.albumId, album.id), isNull(t.eventAlbumPhotos.deletedAt)))
    .orderBy(t.eventAlbumPhotos.position);
  if (photos.length < 9) return;
  const at = new Date(rassemblement.startsAt.getTime() + 2 * HOUR);
  // La voiture de Damien : sa candidature retenue et pointée à l'événement (seed des souvenirs).
  const [entry] = await db
    .select({ vehicleId: t.applications.vehicleId })
    .from(t.applications)
    .innerJoin(t.checkins, eq(t.checkins.applicationId, t.applications.id))
    .where(and(eq(t.applications.eventId, rassemblement.id), eq(t.applications.userId, damien.userId)));
  const car = entry?.vehicleId;
  const kenjiSeat = await seatAt(rassemblement, kenji.userId, damien.userId, at);
  const leaSeat = await seatAt(rassemblement, lea.userId, damien.userId, at);
  const ids = photos.map((p) => p.id);
  if (car) {
    for (const i of [0, 1, 2, 3, 4]) {
      await tag(
        ids[i] as string,
        { kind: "vehicle", vehicleId: car, userId: damien.userId },
        { userId: leo.id, as: "media" },
      );
    }
    // Une photo où Damien a dit lui-même « c'est ma voiture » : jamais de notification pour lui, jamais comptée dans l'annonce.
    await tag(
      ids[5] as string,
      { kind: "vehicle", vehicleId: car, userId: damien.userId },
      { userId: damien.userId, as: "owner" },
      { notifiedAt: at },
    );
  }
  // Kenji par son pseudo (annoncé : on n'ajoute pas de ligne à son Activité).
  if (kenjiSeat) {
    await tag(
      ids[6] as string,
      { kind: "user", userId: kenji.userId },
      { userId: leo.id, as: "media" },
      { notifiedAt: at },
    );
  }
  // Léa a retiré une identification : « Ce n'est pas moi » (`not_mine`), la ligne reste, personne ne la repose.
  if (leaSeat) {
    await tag(
      ids[7] as string,
      { kind: "user", userId: lea.userId },
      { userId: leo.id, as: "media" },
      { notifiedAt: at, removedAt: at, removedBy: lea.userId, removedReason: "not_mine" },
    );
  }
  // La notification de Damien : une pour l'album (5 photos), livrée tout de suite.
  await withTx(async (tx) => void (await sendTaggedNotifications(tx, album.id, { userIds: [damien.userId] })));
  await db
    .update(t.notifications)
    .set({ deliveredAt: now, deliverAfter: now })
    .where(
      and(
        eq(t.notifications.userId, damien.userId),
        eq(t.notifications.type, "album_tagged"),
        isNull(t.notifications.deliveredAt),
      ),
    );
  console.log(
    "Albums : voiture de Damien identifiée (5 par Sud Cars, 1 par lui), Kenji_66 par pseudo, un retrait de Lea_11.",
  );
}
