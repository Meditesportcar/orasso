// Lot R9e : la façade des routes `media-contents` d'avant, pour l'APK en ligne. Une galerie reprise en album se sert **au champ près**
// comme avant (même identifiant, mêmes photos, mêmes vues, `featured` = album officiel) ; une galerie créée par l'ancien chemin devient
// un album publié ; modifier, supprimer, mettre en avant et compter les vues passent par l'album ; les liens ne changent pas.
import { desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { call, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  eventAlbumPhotos,
  eventAlbums,
  events,
  legacyFileBlocks,
  mediaContents,
  mediaProfiles,
  notifications,
  uploads,
} from "../../db/schema";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { accountService } from "../account/service";
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
import { retryRemove } from "../vehicles/photos-blur";
import { anonymizeMediaForDeletedAccount } from "./anonymize";
import { contentView } from "./serializers";
import { resetMediaViews } from "./service";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let leo: TestUser;
let leoMedia: string;
let kenji: TestUser;
let eventId: string;
let eventSlug: string;

beforeEach(async () => {
  await resetDb();
  resetMediaViews();
  clock = useClock(paris(11, 12, 12));
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
    // Les photos sont copiées sous des clés **privées** d'album : la façade donne l'identifiant de la photo et l'adresse publique de l'album.
    const stored = await photoRows(res.json.id);
    expect(res.json.photos.map((p: { key: string }) => p.key)).toEqual(stored.map((p) => p.id));
    expect(res.json.photos[0].url).toMatch(
      new RegExp(`^/api/public/albums/${res.json.id}/photos/[0-9a-f]{32}\\.webp$`),
    );
    expect(stored.every((p) => p.storageKey.startsWith("private/albums/"))).toBe(true);
    // L'envoi d'origine (public) est effacé ; la photo d'un album neuf n'est pas lisible par `/api/files`.
    expect(await storage.get(a.key)).toBeNull();
    for (const p of stored) {
      expect((await app.request(`/api/files/${p.storageKey}`)).status).not.toBe(200);
    }
    const shown = await app.request(res.json.photos[0].url);
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-type")).toBe("image/webp");
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

  it("annulation : une première clé valide et une seconde invalide : ni album, ni blocage résiduel ; l'original reste disponible et la publication peut être retentée", async () => {
    const good = await sendUpload(leo, "media_content");
    const bad = `media-contents/${crypto.randomUUID()}.webp`;
    const res = await call(leo, "POST", "/me/media-contents", {
      eventId,
      kind: "gallery",
      title: "Galerie",
      photoKeys: [good.key, bad],
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(eventAlbums)).toHaveLength(0);
    expect(await db.select().from(eventAlbumPhotos)).toHaveLength(0);
    expect(await db.select().from(legacyFileBlocks)).toHaveLength(0);
    // L'original est intact, son envoi n'est pas consommé (la transaction est annulée) et il se sert encore comme avant.
    expect(await storage.get(good.key)).not.toBeNull();
    const [up] = await db.select().from(uploads).where(eq(uploads.key, good.key));
    expect(up?.consumedAt).toBeNull();
    expect((await app.request(`/api/files/${good.key}`)).status).toBe(200);
    // La copie écrite avant l'échec est effacée : aucun fichier d'album ne reste.
    const left = await db.execute(sql`select count(*)::int as n from event_album_photos`);
    expect((left.rows[0] as { n: number }).n).toBe(0);
    // La publication peut être retentée avec la clé valide seule.
    const retry = await call(leo, "POST", "/me/media-contents", {
      eventId,
      kind: "gallery",
      title: "Galerie",
      photoKeys: [good.key],
    });
    expect(retry.status).toBe(201);
    expect(await db.select().from(legacyFileBlocks)).toHaveLength(1);
    expect((await app.request(`/api/files/${good.key}`)).status).toBe(404);
  });

  it("un envoi dont le fichier manque est refusé (400), comme un envoi inconnu ; rien n'est créé", async () => {
    await db.insert(uploads).values({
      key: "media-contents/sans-fichier.webp",
      userId: leo.id,
      purpose: "media_content",
      width: 10,
      height: 10,
      bytes: 10,
    });
    const res = await call(leo, "POST", "/me/media-contents", {
      eventId,
      kind: "gallery",
      title: "Galerie",
      photoKeys: ["media-contents/sans-fichier.webp"],
    });
    expect(res.status).toBe(400);
    expect(await db.select().from(eventAlbums)).toHaveLength(0);
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

describe("tour 3 : finition", () => {
  it("un envoi consommé puis copié n'est plus servi par /api/files, même si l'effacement de l'original a échoué", async () => {
    const a = await sendUpload(leo, "media_content");
    expect((await app.request(`/api/files/${a.key}`)).status).toBe(200); // envoyé, pas encore publié : comme avant
    vi.spyOn(storage, "remove").mockRejectedValueOnce(new Error("disque occupé"));
    const res = await call(leo, "POST", "/me/media-contents", {
      eventId,
      kind: "gallery",
      title: "Galerie",
      photoKeys: [a.key],
    });
    vi.restoreAllMocks();
    expect(res.status).toBe(201);
    // L'original est encore sur le disque (effacement en échec, replanifié), mais plus servi.
    expect(await storage.get(a.key)).not.toBeNull();
    expect((await app.request(`/api/files/${a.key}`)).status).toBe(404);
    expect((await app.request(`/api/files/${a.key.replace("media-contents/", "MEDIA-CONTENTS/")}`)).status).toBe(404);
  });

  it("de bout en bout : effacement de l'original en échec, suppression du compte puis suppression physique de l'événement : l'ancienne URL reste 404 jusqu'à la reprise de l'effacement", async () => {
    const sent = await sendUpload(leo, "media_content");
    const upper = `/api/files/${sent.key.replace("media-contents/", "MEDIA-CONTENTS/")}`;
    // 1. La galerie est publiée par l'ancien chemin ; l'effacement de l'original échoue (disque occupé).
    vi.spyOn(storage, "remove").mockRejectedValueOnce(new Error("disque occupé"));
    const res = await call(leo, "POST", "/me/media-contents", {
      eventId,
      kind: "gallery",
      title: "Galerie",
      photoKeys: [sent.key],
    });
    vi.restoreAllMocks();
    expect(res.status).toBe(201);
    expect(await storage.get(sent.key)).not.toBeNull();
    expect((await app.request(`/api/files/${sent.key}`)).status).toBe(404);
    // Le blocage est posé dans la transaction de la copie, en table à part (aucune clé étrangère).
    expect(await db.select().from(legacyFileBlocks).where(eq(legacyFileBlocks.key, sent.key))).toHaveLength(1);
    // 2. Le compte est supprimé (anonymisation complète) ; l'effacement échoue encore.
    vi.spyOn(storage, "remove").mockRejectedValue(new Error("disque toujours occupé"));
    await accountService.anonymize(leo.id, null);
    vi.restoreAllMocks();
    expect(await db.select().from(uploads).where(eq(uploads.userId, leo.id))).toHaveLength(0);
    expect((await app.request(`/api/files/${sent.key}`)).status).toBe(404);
    // 3. L'événement est **physiquement** supprimé : la cascade emporte l'album et ses photos, pas le blocage.
    await db.delete(events).where(eq(events.id, eventId));
    expect(await db.select().from(eventAlbums)).toHaveLength(0);
    expect(await db.select().from(eventAlbumPhotos)).toHaveLength(0);
    expect(await storage.get(sent.key)).not.toBeNull();
    expect((await app.request(`/api/files/${sent.key}`)).status).toBe(404);
    expect((await app.request(upper)).status).toBe(404);
    expect(await db.select().from(legacyFileBlocks).where(eq(legacyFileBlocks.key, sent.key))).toHaveLength(1);
    // L'effacement de l'original est programmé (tâche persistante, rejouable) ; la reprise l'efface.
    expect(clock.jobs.jobs.some((j) => j.name === "storage.remove" && j.data.key === sent.key)).toBe(true);
    await retryRemove(sent.key);
    expect(await storage.get(sent.key)).toBeNull();
    expect((await app.request(`/api/files/${sent.key}`)).status).toBe(404);
    // La ligne de blocage n'est jamais retirée, même une fois le fichier effacé.
    expect(await db.select().from(legacyFileBlocks).where(eq(legacyFileBlocks.key, sent.key))).toHaveLength(1);
    // Une clé inventée : lecture de clé primaire, rien de bloqué, rien à servir (404 par absence de fichier).
    expect((await app.request(`/api/files/media-contents/${crypto.randomUUID()}.webp`)).status).toBe(404);
  });

  it("une clé d'ancienne galerie non bloquée reste servie ; legacy_source_key ne sert plus qu'au rejeu (unique), le blocage est la table", async () => {
    const key = `media-contents/${crypto.randomUUID()}.webp`;
    await storage.put(key, Buffer.from("fichier d'un lien ou d'une galerie non reprise"));
    expect((await app.request(`/api/files/${key}`)).status).toBe(200);
    const album = await call(leo, "POST", "/me/albums", { eventId });
    const mk = (name: string) =>
      db.insert(eventAlbumPhotos).values({
        albumId: album.json.id,
        storageKey: `private/albums/${album.json.id}/${name}.webp`,
        position: name === "a".repeat(32) ? 0 : 1,
        plateState: "none",
        legacySourceKey: key,
      });
    await mk("a".repeat(32));
    await expect(mk("b".repeat(32))).rejects.toThrow();
    // La colonne seule ne bloque rien : seule la table de blocage le fait.
    expect((await app.request(`/api/files/${key}`)).status).toBe(200);
    await db.insert(legacyFileBlocks).values({ key });
    expect((await app.request(`/api/files/${key}`)).status).toBe(404);
    // Le blocage ne dépend pas de la casse du préfixe demandé.
    expect((await app.request(`/api/files/${key.replace("media-contents/", "Media-Contents/")}`)).status).toBe(404);
  });

  it("le rejeu exact du POST d'une galerie publiée avant le correctif (album repris, photos sans client_id) rend le contenu existant", async () => {
    const gallery = await legacyGallery({}, 2);
    await adoptLegacyGalleries(db);
    const body = { eventId, kind: "gallery", title: gallery.title, photoKeys: gallery.photoKeys };
    const again = await call(leo, "POST", "/me/media-contents", body);
    expect(again.status).toBe(201);
    expect(again.json.id).toBe(gallery.id);
    expect(await db.select().from(eventAlbums)).toHaveLength(1);
  });

  it("la page presse ne montre que les albums visibles ; « Mes contenus » garde l'album du titulaire avec des adresses qu'il peut lire", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const orgaList = () =>
      call(orga, "GET", `/events/${eventId}/accreditations`).then((r) => r.json[0].contents as { id: string }[]);
    expect((await orgaList()).map((c) => c.id)).toEqual([album.id]);
    await db.execute(sql`update applications set status = 'withdrawn' where media_profile_id = ${leoMedia}`);
    expect(await orgaList()).toHaveLength(0);
    // L'album du titulaire reste listé (titre, vues) mais sans photos : l'APK en ligne charge les images sans jeton (401 ou 404 sinon).
    const mine = await call(leo, "GET", "/me/media-contents");
    expect(mine.json).toHaveLength(1);
    expect(mine.json[0]).toMatchObject({ id: album.id, kind: "gallery", photos: [] });
    // Un album repris, invisible : même règle (la clé publique d'une ancienne galerie n'est plus servie non plus).
    const gallery = await legacyGallery({}, 1);
    await adoptLegacyGalleries(db);
    const again = await call(leo, "GET", "/me/media-contents");
    expect(again.json.find((c: { id: string }) => c.id === gallery.id)).toMatchObject({ photos: [] });
    expect((await app.request(`/api/files/${gallery.photoKeys[0]}`)).status).toBe(404);
    // Visible de nouveau : les photos reviennent.
    await db.execute(sql`update applications set status = 'accepted' where media_profile_id = ${leoMedia}`);
    const back = await call(leo, "GET", "/me/media-contents");
    expect(back.json.find((c: { id: string }) => c.id === gallery.id).photos).toHaveLength(1);
  });
});

describe("les autres lectures des galeries (relecture Opus, tour 1)", () => {
  it("page presse de l'organisateur : la galerie reprise et l'album neuf y sont, « Mettre en avant » les retrouve", async () => {
    const gallery = await legacyGallery({ featuredAt: paris(11, 11, 9) }, 2);
    await adoptLegacyGalleries(db);
    const fresh = await publishedAlbum(leo, eventId, 1);
    const list = await call(orga, "GET", `/events/${eventId}/accreditations`);
    expect(list.status).toBe(200);
    const mine = list.json.find((a: { media: { id: string } }) => a.media.id === leoMedia);
    const ids = mine.contents.map((c: { id: string }) => c.id).sort();
    expect(ids).toEqual([gallery.id, fresh.id].sort());
    expect(mine.contents.find((c: { id: string }) => c.id === gallery.id)).toMatchObject({
      kind: "gallery",
      featured: true,
    });
    expect(mine.contents.find((c: { id: string }) => c.id === fresh.id)).toMatchObject({
      kind: "gallery",
      featured: false,
    });
    // Mettre en avant l'album neuf depuis cette liste : il devient l'officiel.
    expect(
      (await call(orga, "PATCH", `/events/${eventId}/media-contents/${fresh.id}/feature`, { featured: true })).status,
    ).toBe(200);
    const again = await call(orga, "GET", `/events/${eventId}/accreditations`);
    const contents = again.json.find((a: { media: { id: string } }) => a.media.id === leoMedia).contents;
    expect(contents.filter((c: { featured: boolean }) => c.featured).map((c: { id: string }) => c.id)).toEqual([
      fresh.id,
    ]);
    // Un lien y reste aussi.
    await linkContent("Article", paris(11, 11, 10));
    const withLink = await call(orga, "GET", `/events/${eventId}/accreditations`);
    expect(withLink.json.find((a: { media: { id: string } }) => a.media.id === leoMedia).contents).toHaveLength(3);
  });

  it("« Mes accréditations » : un événement couvert par un album n'est plus « pas encore couvert » (contenus et vues)", async () => {
    await legacyGallery({ views: 40 }, 1);
    await adoptLegacyGalleries(db);
    await publishedAlbum(leo, eventId, 1);
    await linkContent("Article", paris(11, 11, 10), { views: 5 });
    const res = await call(leo, "GET", "/me/accreditations?scope=all");
    expect(res.status).toBe(200);
    expect(res.json[0].coverage).toEqual({ contents: 3, views: 45 });
    // Sans rien d'autre que des albums : couvert quand même.
    await db.delete(mediaContents);
    expect((await call(leo, "GET", "/me/accreditations?scope=all")).json[0].coverage).toEqual({
      contents: 2,
      views: 40,
    });
  });

  it("accueil du média : les trois derniers contenus comptent les albums et leurs vues", async () => {
    const old = await linkContent("Vieux lien", paris(11, 1, 9), { views: 3 });
    const gallery = await legacyGallery({ views: 280, publishedAt: paris(11, 10, 9) }, 1);
    await adoptLegacyGalleries(db);
    const fresh = await publishedAlbum(leo, eventId, 1);
    await db
      .update(eventAlbums)
      .set({ views: 9, publishedAt: paris(11, 11, 9) })
      .where(eq(eventAlbums.id, fresh.id));
    const res = await call(leo, "GET", "/me/home?persona=media");
    expect(res.status).toBe(200);
    const contents = res.json.media.contents as { id: string; title: string; views: number }[];
    expect(contents.map((c) => c.id)).toEqual([fresh.id, gallery.id, old.id]);
    expect(contents.map((c) => c.views)).toEqual([9, 280, 3]);
    expect(contents[0]?.title).toBe("Les photos du Rassemblement du Lydia");
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
