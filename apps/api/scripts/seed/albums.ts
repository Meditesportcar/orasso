// Lot R9e : albums des médias. Les galeries d'avant (celle de Béziers Night, créée par `seed/media.ts` après les migrations) sont
// reprises en albums par la même reprise que la migration (`allow_save` faux). Sud Cars (Léo) est accrédité sur le « Rassemblement de
// la Côte Vermeille » de l'an dernier et y publie un album de 12 photos (deux « floutées », cadres factices), « Enregistrer »
// autorisé ; un brouillon de 3 photos attend sur la Nocturne de Canet. « Objectif 66 » de la maquette est un nom inventé : le seed
// garde Sud Cars (T36). Photos : seulement celles du seed (`assets/photos`, relues « aucune plaque lisible »). Idempotent.
import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { storage } from "../../src/lib/storage";
import { withTx } from "../../src/lib/tx";
import { accessService } from "../../src/modules/access/service";
import { adoptLegacyGalleries } from "../../src/modules/albums/reprise";
import { albumPhotoKey } from "../../src/modules/albums/view";
import { blurPlateRegions } from "../../src/modules/vehicles/photos-blur";
import { DAY, HOUR, now } from "./helpers";
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
}
