// Lot R9e : la façade des routes `media-contents` d'avant, pour l'APK en ligne. Une galerie reprise en album se sert **au champ près**
// comme avant (même identifiant, mêmes photos, mêmes vues, `featured` = album officiel) ; une galerie créée par l'ancien chemin devient
// un album publié ; modifier, supprimer, mettre en avant et compter les vues passent par l'album ; les liens ne changent pas.
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { eventAlbumPhotos, eventAlbums, events, mediaContents, mediaProfiles, notifications } from "../../db/schema";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import {
  accredit,
  mediaUser,
  organizerEvent,
  paris,
  photoRows,
  publishedAlbum,
  sendUpload,
} from "../albums/albums-test-helpers";
import { adoptLegacyGalleries } from "../albums/reprise";
import { anonymizeMediaForDeletedAccount } from "./anonymize";
import { contentView } from "./serializers";
import { resetMediaViews } from "./service";

afterAll(async () => {
  await pool.end();
});

let orga: TestUser;
let leo: TestUser;
let leoMedia: string;
let kenji: TestUser;
let eventId: string;
let eventSlug: string;

beforeEach(async () => {
  await resetDb();
  resetMediaViews();
  useClock(paris(11, 12, 12));
  const scenario = await organizerEvent();
  orga = scenario.orga;
  eventId = scenario.event.id;
  eventSlug = scenario.event.slug;
  const media = await mediaUser("Leo_Media");
  leo = media.user;
  leoMedia = media.mediaId;
  await accredit(leo, leoMedia, eventId);
  kenji = await signUp("Kenji_66");
});

/** Une galerie telle que l'ancien code l'écrivait : une ligne de `media_contents` et des fichiers publics. */
async function legacyGallery(over: Partial<typeof mediaContents.$inferInsert> = {}, photos = 3) {
  const keys: string[] = [];
  for (let i = 0; i < photos; i++) {
    const key = `media-contents/${crypto.randomUUID()}.webp`;
    await storage.put(key, Buffer.from(`photo-${i}`));
    keys.push(key);
  }
  const [row] = await db
    .insert(mediaContents)
    .values({
      mediaProfileId: leoMedia,
      eventId,
      kind: "gallery",
      title: "Béziers Night en images",
      photoKeys: keys,
      views: 280,
      publishedAt: paris(11, 10, 9),
      ...over,
    })
    .returning();
  return row as typeof mediaContents.$inferSelect;
}

async function linkContent(title: string, publishedAt: Date, over: Partial<typeof mediaContents.$inferInsert> = {}) {
  const [row] = await db
    .insert(mediaContents)
    .values({
      mediaProfileId: leoMedia,
      eventId,
      kind: "link",
      title,
      url: "https://sudcars.example/article",
      platform: "website",
      views: 10,
      publishedAt,
      ...over,
    })
    .returning();
  return row as typeof mediaContents.$inferSelect;
}

async function before(row: typeof mediaContents.$inferSelect) {
  const [event] = await db.select().from(events).where(eq(events.id, row.eventId));
  const [media] = await db.select().from(mediaProfiles).where(eq(mediaProfiles.id, row.mediaProfileId));
  return contentView(row, event as typeof events.$inferSelect, media as typeof mediaProfiles.$inferSelect);
}

describe("la forme d'avant, au champ près", () => {
  it("une galerie reprise se sert comme avant sur les trois routes (événement, page du média, mes contenus)", async () => {
    const gallery = await legacyGallery({ featuredAt: paris(11, 11, 9) }, 4);
    const expected = await before(gallery);
    expect(expected.featured).toBe(true);
    expect(await adoptLegacyGalleries(db)).toBe(1);

    const event = await call(null, "GET", `/events/by-slug/${eventSlug}/media-contents`);
    expect(event.status).toBe(200);
    expect(event.json).toEqual([expected]);
    const page = await call(kenji, "GET", `/media/${leoMedia}/contents`);
    expect(page.json.items).toEqual([expected]);
    expect(page.json.nextCursor).toBeNull();
    const mine = await call(leo, "GET", "/me/media-contents");
    expect(mine.json).toEqual([expected]);
  });

  it("une galerie non mise en avant, des liens à côté : le même contenu, le même ordre (mis en avant d'abord, puis les plus récents)", async () => {
    const gallery = await legacyGallery({ title: "Galerie" }, 2);
    const older = await linkContent("Article ancien", paris(11, 9, 9));
    const newer = await linkContent("Article récent", paris(11, 11, 9));
    const featured = await linkContent("Vidéo", paris(11, 8, 9), { featuredAt: paris(11, 9, 9) });
    const expected = await Promise.all([featured, newer, gallery, older].map(before));
    await adoptLegacyGalleries(db);
    const res = await call(null, "GET", `/events/by-slug/${eventSlug}/media-contents`);
    expect(res.json).toEqual(expected);
    // Un lien reste un lien : adresse et plateforme d'avant.
    expect(res.json[0]).toMatchObject({ kind: "link", url: "https://sudcars.example/article", featured: true });
  });

  it("la page du média : pagination par identifiant décroissant sur liens et albums mêlés", async () => {
    const gallery = await legacyGallery({}, 1);
    const link = await linkContent("Lien", paris(11, 9, 9));
    await adoptLegacyGalleries(db);
    const all = [gallery.id, link.id].sort().reverse();
    const first = await call(kenji, "GET", `/media/${leoMedia}/contents?limit=1`);
    expect(first.json.items.map((c: { id: string }) => c.id)).toEqual([all[0]]);
    expect(first.json.nextCursor).toBe(all[0]);
    const second = await call(kenji, "GET", `/media/${leoMedia}/contents?limit=1&cursor=${first.json.nextCursor}`);
    expect(second.json.items.map((c: { id: string }) => c.id)).toEqual([all[1]]);
    expect(second.json.nextCursor).toBeNull();
  });
});

describe("POST /me/media-contents (kind gallery) : le chemin d'avant crée un album publié", () => {
  it("avec des clés `media_content` : un album publié, 30 photos au plus, la même réponse qu'avant", async () => {
    const a = await sendUpload(leo, "media_content");
    const b = await sendUpload(leo, "media_content");
    const res = await call(leo, "POST", "/me/media-contents", {
      eventId,
      kind: "gallery",
      title: "Galerie du soir",
      photoKeys: [a.key, b.key],
    });
    expect(res.status).toBe(201);
    expect(Object.keys(res.json).sort()).toEqual(
      [
        "event",
        "eventId",
        "featured",
        "id",
        "kind",
        "media",
        "photos",
        "platform",
        "publishedAt",
        "title",
        "url",
        "views",
      ].sort(),
    );
    expect(res.json).toMatchObject({
      eventId,
      kind: "gallery",
      title: "Galerie du soir",
      url: null,
      platform: "other",
      featured: false,
      views: 0,
      media: { id: leoMedia, name: "Sud Cars" },
    });
    expect(res.json.photos.map((p: { key: string }) => p.key)).toEqual([a.key, b.key]);
    expect(res.json.photos[0].url).toBe(`/api/files/${a.key}`);
    const [album] = await db.select().from(eventAlbums);
    expect(album).toMatchObject({ id: res.json.id, status: "published", photosCount: 2, allowSave: false });
    const photos = await photoRows(res.json.id);
    expect(photos.map((p) => p.plateState)).toEqual(["unknown", "unknown"]);
    expect(photos.map((p) => p.position)).toEqual([0, 1]);
    // Elle est dans la façade, avec ses deux photos.
    const facade = await call(null, "GET", `/events/by-slug/${eventSlug}/media-contents`);
    expect(facade.json).toHaveLength(1);
    expect(facade.json[0].photos).toHaveLength(2);
  });

  it("rejouée avec les mêmes clés, elle rend le même album (rien de plus, pas de limite de débit consommée)", async () => {
    const a = await sendUpload(leo, "media_content");
    const body = { eventId, kind: "gallery", title: "Galerie", photoKeys: [a.key] };
    const first = await call(leo, "POST", "/me/media-contents", body);
    const again = await call(leo, "POST", "/me/media-contents", body);
    expect(again.status).toBe(201);
    expect(again.json.id).toBe(first.json.id);
    expect(await db.select().from(eventAlbums)).toHaveLength(1);
  });

  it("refus comme avant : non accrédité (403), événement annulé (409), plus de 30 clés ou aucune (400), clé inconnue (400)", async () => {
    const a = await sendUpload(leo, "media_content");
    const stranger = await mediaUser("Marc_Photo", "Marc Photo");
    const b = await sendUpload(stranger.user, "media_content");
    const refused = await call(stranger.user, "POST", "/me/media-contents", {
      eventId,
      kind: "gallery",
      title: "Galerie",
      photoKeys: [b.key],
    });
    expect(refused.status).toBe(403);
    expect(refused.json.error.message).toMatch(/accrédité/);
    expect(
      (await call(leo, "POST", "/me/media-contents", { eventId, kind: "gallery", title: "Galerie", photoKeys: [] }))
        .status,
    ).toBe(400);
    const tooMany = Array.from({ length: 31 }, () => `media-contents/${crypto.randomUUID()}.webp`);
    expect(
      (
        await call(leo, "POST", "/me/media-contents", {
          eventId,
          kind: "gallery",
          title: "Galerie",
          photoKeys: tooMany,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(leo, "POST", "/me/media-contents", {
          eventId,
          kind: "gallery",
          title: "Galerie",
          photoKeys: [`media-contents/${crypto.randomUUID()}.webp`],
        })
      ).status,
    ).toBe(400);
    expect(await db.select().from(eventAlbums)).toHaveLength(0);
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, eventId));
    const cancelled = await call(leo, "POST", "/me/media-contents", {
      eventId,
      kind: "gallery",
      title: "Galerie",
      photoKeys: [a.key],
    });
    expect(cancelled.status).toBe(409);
  });

  it("un lien suit toujours le chemin d'avant (media_contents)", async () => {
    const res = await call(leo, "POST", "/me/media-contents", {
      eventId,
      kind: "link",
      title: "Mon article",
      url: "https://sudcars.example/a",
      platform: "website",
    });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ kind: "link", url: "https://sudcars.example/a" });
    expect(await db.select().from(mediaContents)).toHaveLength(1);
    expect(await db.select().from(eventAlbums)).toHaveLength(0);
  });
});

describe("modifier, supprimer, mettre en avant, compter les vues d'une galerie (= un album)", () => {
  it("PATCH /me/media-contents/:id change le titre de l'album ; DELETE retire l'album et efface ses fichiers", async () => {
    const gallery = await legacyGallery({}, 2);
    await adoptLegacyGalleries(db);
    const patched = await call(leo, "PATCH", `/me/media-contents/${gallery.id}`, { title: "Nouveau titre" });
    expect(patched.status).toBe(200);
    expect(patched.json).toMatchObject({ id: gallery.id, title: "Nouveau titre", kind: "gallery" });
    expect((await db.select().from(eventAlbums).where(eq(eventAlbums.id, gallery.id)))[0]?.title).toBe("Nouveau titre");
    // Un autre compte ne le touche pas.
    expect((await call(kenji, "PATCH", `/me/media-contents/${gallery.id}`, { title: "Piraté" })).status).toBe(404);
    expect((await call(kenji, "DELETE", `/me/media-contents/${gallery.id}`)).status).toBe(404);
    const keys = gallery.photoKeys;
    expect((await call(leo, "DELETE", `/me/media-contents/${gallery.id}`)).status).toBe(204);
    for (const key of keys) expect(await storage.get(key)).toBeNull();
    expect((await call(leo, "GET", "/me/media-contents")).json).toHaveLength(0);
    expect((await call(null, "GET", `/events/by-slug/${eventSlug}/media-contents`)).json).toHaveLength(0);
    expect((await db.select().from(eventAlbums).where(eq(eventAlbums.id, gallery.id)))[0]?.deletedAt).not.toBeNull();
  });

  it("l'organisateur met en avant une galerie (= album officiel) ; une autre mise en avant remplace la précédente ; le média est prévenu", async () => {
    const first = await publishedAlbum(leo, eventId, 1);
    const second = await publishedAlbum(leo, eventId, 1);
    const set = await call(orga, "PATCH", `/events/${eventId}/media-contents/${first.id}/feature`, { featured: true });
    expect(set.status).toBe(200);
    expect(set.json).toMatchObject({ id: first.id, featured: true });
    expect((await db.select().from(eventAlbums).where(eq(eventAlbums.id, first.id)))[0]?.officialAt).not.toBeNull();
    const swap = await call(orga, "PATCH", `/events/${eventId}/media-contents/${second.id}/feature`, {
      featured: true,
    });
    expect(swap.status).toBe(200);
    const officials = (await db.select().from(eventAlbums)).filter((a) => a.officialAt !== null);
    expect(officials.map((a) => a.id)).toEqual([second.id]);
    // L'officiel passe en tête de la façade.
    const facade = await call(null, "GET", `/events/by-slug/${eventSlug}/media-contents`);
    expect(facade.json.map((c: { id: string }) => c.id)).toEqual([second.id, first.id]);
    const un = await call(orga, "PATCH", `/events/${eventId}/media-contents/${second.id}/feature`, { featured: false });
    expect(un.json.featured).toBe(false);
    const notified = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "media_content_featured"))
      .orderBy(desc(notifications.createdAt));
    expect(notified.length).toBeGreaterThanOrEqual(2);
    // Un passionné ou un autre média ne met rien en avant.
    expect(
      (await call(kenji, "PATCH", `/events/${eventId}/media-contents/${first.id}/feature`, { featured: true })).status,
    ).toBe(403);
    expect(
      (await call(leo, "PATCH", `/events/${eventId}/media-contents/${first.id}/feature`, { featured: true })).status,
    ).toBe(403);
  });

  it("POST /media-contents/:id/view compte la vue d'un album (une par session et par heure, jamais le média lui-même)", async () => {
    const gallery = await legacyGallery({ views: 5 }, 1);
    await adoptLegacyGalleries(db);
    const viewed = await call(kenji, "POST", `/media-contents/${gallery.id}/view`);
    expect(viewed.json.views).toBe(6);
    expect((await call(kenji, "POST", `/media-contents/${gallery.id}/view`)).json.views).toBe(6);
    expect((await call(leo, "POST", `/media-contents/${gallery.id}/view`)).json.views).toBe(6);
    expect((await call(null, "POST", `/media-contents/${crypto.randomUUID()}/view`)).status).toBe(404);
    expect((await db.select().from(eventAlbums).where(eq(eventAlbums.id, gallery.id)))[0]?.views).toBe(6);
  });
});

describe("compte supprimé", () => {
  it("les albums du média (brouillons compris) et leurs photos partent avec le compte : lignes retirées, clés rendues pour effacement", async () => {
    const album = await publishedAlbum(leo, eventId, 2);
    const draft = await call(leo, "POST", "/me/albums", { eventId });
    const keys = (await photoRows(album.id)).map((p) => p.storageKey);
    const removed = await withTx((tx) => anonymizeMediaForDeletedAccount(tx, leo.id, new Date()));
    for (const key of keys) expect(removed).toContain(key);
    const rows = await db.select().from(eventAlbums);
    expect(rows.map((r) => r.id).sort()).toEqual([album.id, draft.json.id].sort());
    expect(rows.every((r) => r.deletedAt !== null && r.photosCount === 0)).toBe(true);
    expect((await db.select().from(eventAlbumPhotos)).every((p) => p.deletedAt !== null)).toBe(true);
    // Le média supprimé n'est plus servi nulle part.
    expect((await call(kenji, "GET", `/albums/${album.id}`)).status).toBe(404);
  });
});
