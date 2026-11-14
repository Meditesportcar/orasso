// Lot R9e : qui voit quoi. Droits par regard (titulaire, autre média accrédité, organisateur, passionné, sans session), brouillon
// jamais servi à un autre, accréditation retirée après la publication (V6 gardée), média ou compte hors règle, liste blanche des
// vues (ni `plate_state`, ni `plate_rects`, ni `author_id`, ni le pseudo du titulaire), routes des photos (protégée et publique).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { eventAlbums, mediaContents } from "../../db/schema";
import { storage } from "../../lib/storage";
import {
  accredit,
  addPhoto,
  albumRow,
  draftOf,
  keysOf,
  mediaUser,
  organizerEvent,
  paris,
  photoRows,
  publishedAlbum,
  setAccreditation,
  softDeleteMedia,
} from "./albums-test-helpers";
import { adoptLegacyGalleries } from "./reprise";

afterAll(async () => {
  await pool.end();
});

let orga: TestUser;
let leo: TestUser;
let leoMedia: string;
let marc: TestUser;
let kenji: TestUser;
let eventId: string;
let eventSlug: string;
let leoAccreditation: string;

beforeEach(async () => {
  await resetDb();
  useClock(paris(11, 5, 12));
  const scenario = await organizerEvent();
  orga = scenario.orga;
  eventId = scenario.event.id;
  eventSlug = scenario.event.slug;
  const media = await mediaUser("Leo_Media");
  leo = media.user;
  leoMedia = media.mediaId;
  leoAccreditation = (await accredit(leo, leoMedia, eventId)).id;
  const other = await mediaUser("Marc_Photo", "Marc Photo");
  marc = other.user;
  await accredit(marc, other.mediaId, eventId);
  kenji = await signUp("Kenji_66");
});

const regards = () =>
  [
    ["l'organisateur", orga],
    ["un autre média accrédité", marc],
    ["un passionné", kenji],
  ] as const;

describe("un brouillon n'est vu que de son titulaire", () => {
  it("lecture, listes et photos : 404 pour tous les autres, 401 sans session", async () => {
    const draft = await draftOf(leo, eventId);
    const photo = await addPhoto(leo, draft.id);
    const name = (photo.json.url as string).split("/").pop();
    expect((await call(leo, "GET", `/albums/${draft.id}`)).status).toBe(200);
    expect((await call(leo, "GET", `/albums/${draft.id}/photos/${name}`)).status).toBe(200);
    expect((await call(leo, "GET", "/me/albums?status=draft")).json.items).toHaveLength(1);
    for (const [, who] of regards()) {
      expect((await call(who, "GET", `/albums/${draft.id}`)).status).toBe(404);
      expect((await call(who, "GET", `/albums/${draft.id}/photos/${name}`)).status).toBe(404);
      expect((await call(who, "GET", `/events/${eventId}/albums`)).json.items).toHaveLength(0);
      expect((await call(who, "GET", `/media/${leoMedia}/albums`)).json.items).toHaveLength(0);
      expect((await call(who, "GET", "/me/albums")).json.items).toHaveLength(0);
    }
    expect((await call(null, "GET", `/albums/${draft.id}`)).status).toBe(401);
    expect((await call(null, "GET", `/albums/${draft.id}/photos/${name}`)).status).toBe(401);
    // Même le titulaire n'obtient pas un brouillon par la route sans session.
    expect((await call(null, "GET", `/public/albums/${draft.id}/photos/${name}`)).status).toBe(404);
    expect((await call(leo, "GET", `/public/albums/${draft.id}/photos/${name}`)).status).toBe(404);
    // Le brouillon n'est pas dans la façade d'avant.
    expect((await call(null, "GET", `/events/by-slug/${eventSlug}/media-contents`)).json).toHaveLength(0);
    expect((await call(leo, "GET", "/me/media-contents")).json).toHaveLength(0);
  });
});

describe("un album publié est vu de tout membre connecté", () => {
  it("lecture, listes de l'événement et du média, pour chaque regard ; sans session : 401", async () => {
    const album = await publishedAlbum(leo, eventId, 2);
    for (const [, who] of [["le titulaire", leo], ...regards()] as const) {
      const got = await call(who, "GET", `/albums/${album.id}`);
      expect(got.status).toBe(200);
      expect(got.json.photos).toHaveLength(2);
      expect(got.json.status).toBe("published");
      const mine = who.id === leo.id;
      expect(got.json.mine).toBe(mine);
      const byId = await call(who, "GET", `/events/${eventId}/albums`);
      expect(byId.json.items.map((a: { id: string }) => a.id)).toEqual([album.id]);
      const bySlug = await call(who, "GET", `/events/by-slug/${eventSlug}/albums`);
      expect(bySlug.json.items.map((a: { id: string }) => a.id)).toEqual([album.id]);
      const byMedia = await call(who, "GET", `/media/${leoMedia}/albums`);
      expect(byMedia.json.items).toHaveLength(1);
      expect(byMedia.json.items[0].cover).toHaveLength(2);
    }
    expect((await call(null, "GET", `/albums/${album.id}`)).status).toBe(401);
    expect((await call(null, "GET", `/events/${eventId}/albums`)).status).toBe(401);
    expect((await call(null, "GET", `/media/${leoMedia}/albums`)).status).toBe(401);
  });

  it("la façade d'avant montre l'album sans session (fiche de l'événement, T34)", async () => {
    const album = await publishedAlbum(leo, eventId, 2);
    const res = await call(null, "GET", `/events/by-slug/${eventSlug}/media-contents`);
    expect(res.status).toBe(200);
    expect(res.json).toHaveLength(1);
    expect(res.json[0]).toMatchObject({ id: album.id, kind: "gallery", featured: false });
    // Photos servies par la route publique (clé privée), jamais par `/api/files`.
    for (const p of res.json[0].photos)
      expect(p.url).toMatch(/^\/api\/public\/albums\/.+\/photos\/[0-9a-f]{32}\.webp$/);
  });
});

describe("accréditation retirée après la publication (V6 gardée)", () => {
  it("l'album n'est plus servi à personne d'autre : lecture, listes, photos, façade, carte", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const [photo] = await photoRows(album.id);
    const name = photo?.storageKey.split("/").pop();
    for (const status of ["refused", "withdrawn", "pending"] as const) {
      await setAccreditation(leoAccreditation, status);
      for (const [, who] of regards()) {
        expect((await call(who, "GET", `/albums/${album.id}`)).status).toBe(404);
        expect((await call(who, "GET", `/albums/${album.id}/photos/${name}`)).status).toBe(404);
        expect((await call(who, "GET", `/events/${eventId}/albums`)).json.items).toHaveLength(0);
        expect((await call(who, "GET", `/media/${leoMedia}/albums`)).json.items).toHaveLength(0);
        expect((await call(who, "GET", `/media/${leoMedia}`)).json).toMatchObject({ albumsCount: 0, photosCount: 0 });
        expect((await call(who, "GET", `/media/${leoMedia}/contents`)).json.items).toHaveLength(0);
      }
      expect((await call(null, "GET", `/public/albums/${album.id}/photos/${name}`)).status).toBe(404);
      expect((await call(null, "GET", `/events/by-slug/${eventSlug}/media-contents`)).json).toHaveLength(0);
      // Le média garde la main sur son album (le retirer), il ne le publie plus ni ne le complète.
      expect((await call(leo, "GET", `/albums/${album.id}`)).status).toBe(200);
      expect((await addPhoto(leo, album.id)).status).toBe(403);
    }
    await setAccreditation(leoAccreditation, "accepted");
    expect((await call(kenji, "GET", `/albums/${album.id}`)).status).toBe(200);
  });

  it("un média supprimé ou un compte suspendu, banni ou supprimé : l'album n'est plus servi", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    await db.execute(sql`update profiles set suspended_until = now() + interval '3 days' where user_id = ${leo.id}`);
    expect((await call(kenji, "GET", `/albums/${album.id}`)).status).toBe(404);
    await db.execute(sql`update profiles set suspended_until = null, banned_at = now() where user_id = ${leo.id}`);
    expect((await call(kenji, "GET", `/albums/${album.id}`)).status).toBe(404);
    await db.execute(sql`update profiles set banned_at = null where user_id = ${leo.id}`);
    expect((await call(kenji, "GET", `/albums/${album.id}`)).status).toBe(200);
    await softDeleteMedia(leoMedia);
    expect((await call(kenji, "GET", `/albums/${album.id}`)).status).toBe(404);
    expect((await call(kenji, "GET", `/media/${leoMedia}/albums`)).status).toBe(404);
  });

  it("un événement brouillon ou sur invitation : ni album ni liste", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    await db.execute(sql`update events set admission = 'invite_only' where id = ${eventId}`);
    expect((await call(kenji, "GET", `/albums/${album.id}`)).status).toBe(404);
    expect((await call(kenji, "GET", `/events/${eventId}/albums`)).status).toBe(404);
    expect((await call(null, "GET", `/events/by-slug/${eventSlug}/media-contents`)).status).toBe(404);
  });
});

describe("photos reprises d'une ancienne galerie (nom de clé libre)", () => {
  it("chaque photo d'un album repris se sert par les deux routes, même au nom non hexadécimal", async () => {
    const keys = [0, 1, 2].map((i) => `seed/media/beziers-night-${i}.webp`);
    for (const key of keys) await storage.put(key, Buffer.from(`photo ${key}`));
    const [row] = await db
      .insert(mediaContents)
      .values({
        mediaProfileId: leoMedia,
        eventId,
        kind: "gallery",
        title: "Béziers Night en images",
        photoKeys: keys,
        publishedAt: paris(11, 4, 9),
      })
      .returning();
    await adoptLegacyGalleries(db);
    const album = await call(kenji, "GET", `/albums/${row?.id}`);
    expect(album.status).toBe(200);
    expect(album.json.photos).toHaveLength(3);
    expect(album.json.photos[0]).toMatchObject({ width: null, height: null });
    for (const p of album.json.photos as { url: string }[]) {
      const protectedRes = await app.request(p.url, { headers: { cookie: kenji.cookie } });
      expect(protectedRes.status).toBe(200);
      expect(await protectedRes.text()).toMatch(/^photo seed\/media\/beziers-night-\d\.webp$/);
      const publicRes = await app.request(p.url.replace("/api/albums/", "/api/public/albums/"));
      expect(publicRes.status).toBe(200);
    }
    // Un nom qui n'est pas la fin d'une clé de cet album, ou qui sort du dossier : 404.
    const unknown = await app.request(`/api/albums/${row?.id}/photos/inconnu-photo.webp`, {
      headers: { cookie: kenji.cookie },
    });
    expect(unknown.status).toBe(404);
    const traversal = await app.request(`/api/albums/${row?.id}/photos/..%2Fbeziers-night-0.webp`, {
      headers: { cookie: kenji.cookie },
    });
    expect(traversal.status).toBe(404);
  });
});

describe("/api/files : les clés d'anciennes galeries suivent la visibilité de leur album (Codex 1)", () => {
  async function adopted() {
    const keys = [0, 1].map((i) => `media-contents/7d3f5b0e-6a0f-4a39-9e3a-1c4d8f2a9b0${i}.webp`);
    for (const key of keys) await storage.put(key, Buffer.from(`photo ${key}`));
    const [row] = await db
      .insert(mediaContents)
      .values({
        mediaProfileId: leoMedia,
        eventId,
        kind: "gallery",
        title: "Galerie",
        photoKeys: keys,
        publishedAt: paris(11, 4, 9),
      })
      .returning();
    await adoptLegacyGalleries(db);
    return { keys, id: row?.id as string };
  }
  const get = (key: string, headers: Record<string, string> = {}) => app.request(`/api/files/${key}`, { headers });

  it("album visible : servi sans session avec `public, no-cache` et un ETag (304 à la revalidation) ; les autres clés ne changent pas", async () => {
    const { keys } = await adopted();
    const res = await get(keys[0] as string);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, no-cache");
    const etag = res.headers.get("etag") as string;
    expect(etag).toMatch(/^"[0-9a-f-]{36}"$/);
    expect((await get(keys[0] as string, { "if-none-match": etag })).status).toBe(304);
    // Une clé hors des dossiers de galeries garde son cache d'un an.
    await storage.put("vehicles/abc/photo.webp", Buffer.from("x"));
    const other = await get("vehicles/abc/photo.webp");
    expect(other.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    // Une clé de galerie sans album (lien, galerie non reprise) : servie, mais revalidée.
    await storage.put("media-contents/00000000-0000-4000-8000-000000000001.webp", Buffer.from("y"));
    const orphan = await get("media-contents/00000000-0000-4000-8000-000000000001.webp");
    expect(orphan.status).toBe(200);
    expect(orphan.headers.get("cache-control")).toBe("public, no-cache");
  });

  it("404 dès que l'album n'est plus visible : accréditation retombée, compte suspendu, média supprimé, événement annulé, album supprimé", async () => {
    const { keys, id } = await adopted();
    const key = keys[0] as string;
    for (const status of ["refused", "withdrawn", "pending"] as const) {
      await setAccreditation(leoAccreditation, status);
      expect((await get(key)).status).toBe(404);
    }
    await setAccreditation(leoAccreditation, "accepted");
    expect((await get(key)).status).toBe(200);
    await db.execute(sql`update profiles set suspended_until = now() + interval '3 days' where user_id = ${leo.id}`);
    expect((await get(key)).status).toBe(404);
    await db.execute(sql`update profiles set suspended_until = null where user_id = ${leo.id}`);
    expect((await get(key)).status).toBe(200);
    await db.execute(sql`update events set status = 'cancelled' where id = ${eventId}`);
    expect((await get(key)).status).toBe(404);
    await db.execute(sql`update events set status = 'published' where id = ${eventId}`);
    expect((await get(key)).status).toBe(200);
    await softDeleteMedia(leoMedia);
    expect((await get(key)).status).toBe(404);
    await db.execute(sql`update media_profiles set deleted_at = null where id = ${leoMedia}`);
    // Une photo retirée de l'album, puis l'album supprimé.
    const [photo] = await photoRows(id);
    expect((await call(leo, "DELETE", `/me/albums/${id}/photos/${photo?.id}`)).status).toBe(204);
    expect((await get(key)).status).toBe(404);
    expect((await get(keys[1] as string)).status).toBe(200);
    expect((await call(leo, "DELETE", `/me/albums/${id}`)).status).toBe(204);
    expect((await get(keys[1] as string)).status).toBe(404);
  });
});

describe("pagination effective (Codex 7)", () => {
  async function many(n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const [row] = await db
        .insert(eventAlbums)
        .values({
          eventId,
          mediaProfileId: leoMedia,
          authorId: leo.id,
          title: `Album ${String(i).padStart(2, "0")}`,
          status: "published",
          publishedAt: new Date(paris(11, 5, 0).getTime() + i * 60_000),
          photosCount: 1,
        })
        .returning({ id: eventAlbums.id });
      ids.push(row?.id as string);
    }
    return ids;
  }

  it("GET /me/albums : pages de `limit` albums, sans doublon ni trou, au-delà de 100", async () => {
    const ids = await many(23);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await call(leo, "GET", `/me/albums?limit=10${cursor ? `&cursor=${cursor}` : ""}`);
      expect(res.status).toBe(200);
      seen.push(...res.json.items.map((a: { id: string }) => a.id));
      cursor = res.json.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual([...ids].reverse());
    // Par défaut : une page de 50, avec la suite promise quand il y en a plus.
    const more = await many(40);
    const first = await call(leo, "GET", "/me/albums");
    expect(first.json.items).toHaveLength(50);
    expect(first.json.nextCursor).toBe(first.json.items[49].id);
    const second = await call(leo, "GET", `/me/albums?cursor=${first.json.nextCursor}`);
    expect(second.json.items).toHaveLength(13);
    expect(second.json.nextCursor).toBeNull();
    expect(more).toHaveLength(40);
  });

  it("GET /events/:id/albums : l'officiel d'abord, puis du plus récent, par pages ; curseur inconnu ignoré", async () => {
    const ids = await many(7);
    await db.execute(sql`update event_albums set official_at = now() where id = ${ids[0]}`);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await call(kenji, "GET", `/events/${eventId}/albums?limit=3${cursor ? `&cursor=${cursor}` : ""}`);
      expect(res.status).toBe(200);
      seen.push(...res.json.items.map((a: { id: string }) => a.id));
      cursor = res.json.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual([ids[0], ...ids.slice(1).reverse()]);
    expect((await call(kenji, "GET", `/events/${eventId}/albums?limit=3&cursor=${crypto.randomUUID()}`)).status).toBe(
      200,
    );
    // Défaut : 20 par page.
    await many(18);
    const first = await call(kenji, "GET", `/events/by-slug/${eventSlug}/albums`);
    expect(first.json.items).toHaveLength(20);
    expect(first.json.nextCursor).not.toBeNull();
  });

  it("51 albums : la première page (50) dit le total et garde un curseur ; la suivante rend le 51e, sans doublon ; la liste publique pareil", async () => {
    const ids = await many(51);
    for (const path of [`/events/by-slug/${eventSlug}/albums`, `/public/events/by-slug/${eventSlug}/albums`]) {
      const first = await call(path.startsWith("/public") ? null : kenji, "GET", `${path}?limit=50`);
      expect(first.status).toBe(200);
      expect(first.json.items).toHaveLength(50);
      expect(first.json.total).toBe(51);
      expect(first.json.nextCursor).toBe(first.json.items[49].id);
      const second = await call(
        path.startsWith("/public") ? null : kenji,
        "GET",
        `${path}?limit=50&cursor=${first.json.nextCursor}`,
      );
      expect(second.json.items).toHaveLength(1);
      expect(second.json.nextCursor).toBeNull();
      expect(second.json.total).toBe(51);
      const seen = [...first.json.items, ...second.json.items].map((a: { id: string }) => a.id);
      expect(new Set(seen).size).toBe(51);
      expect([...seen].sort()).toEqual([...ids].sort());
    }
  });
});

describe("événement annulé", () => {
  it("un album d'un événement annulé n'est plus servi (lecture, listes, photos, façade)", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const [photo] = await photoRows(album.id);
    const name = photo?.storageKey.split("/").pop();
    await db.execute(sql`update events set status = 'cancelled' where id = ${eventId}`);
    expect((await call(kenji, "GET", `/albums/${album.id}`)).status).toBe(404);
    expect((await call(kenji, "GET", `/media/${leoMedia}/albums`)).json.items).toHaveLength(0);
    expect((await call(null, "GET", `/public/albums/${album.id}/photos/${name}`)).status).toBe(404);
    expect((await call(kenji, "GET", `/media/${leoMedia}`)).json).toMatchObject({ albumsCount: 0 });
    // Son titulaire garde la main pour le lire et le retirer.
    expect((await call(leo, "GET", `/albums/${album.id}`)).status).toBe(200);
  });
});

describe("liste blanche", () => {
  it("AlbumView, AlbumSummary et photos : seulement les champs prévus, jamais plate_*, author_id ni le titulaire", async () => {
    const album = await publishedAlbum(leo, eventId, 2);
    // Une photo « floutée » et une « telle quelle » : l'état de plaque ne sort jamais.
    await addPhoto(leo, album.id, { decision: "blurred" });
    await addPhoto(leo, album.id, { decision: "kept" });
    const view = await call(kenji, "GET", `/albums/${album.id}`);
    expect([...keysOf(view.json)].sort()).toEqual(
      [
        "allowSave",
        "cover",
        "event",
        "endsAt",
        "height",
        "id",
        "key",
        "logoUrl",
        "media",
        "mine",
        "name",
        "official",
        "photos",
        "photosCount",
        "position",
        "publishedAt",
        "slug",
        "startsAt",
        "status",
        "title",
        "url",
        "verified",
        "width",
      ].sort(),
    );
    const list = await call(kenji, "GET", `/events/${eventId}/albums`);
    expect([...keysOf(list.json)].sort()).toEqual(
      [...keysOf({ items: [view.json], nextCursor: null, total: 4 })].filter((k) => k !== "photos").sort(),
    );
    const owner = await albumRow(album.id);
    for (const text of [view.text, list.text]) {
      expect(text).not.toMatch(/plate|author|rects/i);
      expect(text).not.toContain("Leo_Media");
      expect(text).not.toContain(leo.id);
      expect(text).not.toContain(owner?.authorId as string);
      expect(text).not.toContain("private/");
    }
    expect(view.json.media.key).toBe(`m:${leoMedia}`);
  });

  it("la fiche du média et la façade ne montrent pas non plus l'état des plaques", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    await addPhoto(leo, album.id, { decision: "kept" });
    const facade = await call(null, "GET", `/events/by-slug/${eventSlug}/media-contents`);
    expect(facade.text).not.toMatch(/plate|author|rects/i);
    const contents = await call(kenji, "GET", `/media/${leoMedia}/contents`);
    expect(contents.text).not.toMatch(/plate|author|rects/i);
    expect(contents.text).not.toContain(leo.id);
  });
});

describe("routes des photos", () => {
  it("protégée : 401 sans session ; 200 image/webp pour un membre, ETag et 304 ; jamais mise en cache partagée", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const [photo] = await photoRows(album.id);
    const name = photo?.storageKey.split("/").pop();
    const raw = (u: TestUser | null, headers: Record<string, string> = {}) =>
      app.request(`/api/albums/${album.id}/photos/${name}`, {
        headers: { ...(u ? { cookie: u.cookie } : {}), ...headers },
      });
    expect((await raw(null)).status).toBe(401);
    const ok = await raw(kenji);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(ok.headers.get("cache-control")).toBe("private, no-cache");
    const etag = ok.headers.get("etag") as string;
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect((await raw(kenji, { "if-none-match": etag })).status).toBe(304);
    // Un nom inconnu, un nom mal formé, un autre album : 404.
    const wrong = await app.request(`/api/albums/${album.id}/photos/${"a".repeat(32)}.webp`, {
      headers: { cookie: kenji.cookie },
    });
    expect(wrong.status).toBe(404);
    const bad = await app.request(`/api/albums/${album.id}/photos/..%2F..%2Fx.webp`, {
      headers: { cookie: kenji.cookie },
    });
    expect(bad.status).toBe(404);
    const other = await publishedAlbum(marc, eventId, 1);
    const crossed = await app.request(`/api/albums/${other.id}/photos/${name}`, { headers: { cookie: kenji.cookie } });
    expect(crossed.status).toBe(404);
  });

  it("publique (T34) : sert un album publié sans session, `public, no-cache`, ETag, aucun cookie posé", async () => {
    const album = await publishedAlbum(leo, eventId, 1);
    const [photo] = await photoRows(album.id);
    const name = photo?.storageKey.split("/").pop();
    const res = await app.request(`/api/public/albums/${album.id}/photos/${name}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("public, no-cache");
    expect(res.headers.get("set-cookie")).toBeNull();
    const etag = res.headers.get("etag") as string;
    const again = await app.request(`/api/public/albums/${album.id}/photos/${name}`, {
      headers: { "if-none-match": etag },
    });
    expect(again.status).toBe(304);
    // Une photo retirée disparaît tout de suite.
    const added = await addPhoto(leo, album.id);
    expect(added.status).toBe(201);
    await call(leo, "DELETE", `/me/albums/${album.id}/photos/${photo?.id}`);
    expect((await app.request(`/api/public/albums/${album.id}/photos/${name}`)).status).toBe(404);
  });
});

describe("listes", () => {
  it("l'événement : l'officiel en tête, puis du plus récent ; le média : pagination par curseur", async () => {
    const a = await publishedAlbum(leo, eventId, 1, { title: "Premier" });
    const b = await publishedAlbum(marc, eventId, 1, { title: "Deuxième" });
    const c = await publishedAlbum(leo, eventId, 1, { title: "Troisième" });
    await db.execute(
      sql`update event_albums set published_at = ${paris(11, 5, 13).toISOString()}::timestamptz where id = ${a.id}`,
    );
    await db.execute(
      sql`update event_albums set published_at = ${paris(11, 5, 14).toISOString()}::timestamptz where id = ${b.id}`,
    );
    await db.execute(
      sql`update event_albums set published_at = ${paris(11, 5, 15).toISOString()}::timestamptz, official_at = now() where id = ${c.id}`,
    );
    const list = await call(kenji, "GET", `/events/${eventId}/albums`);
    expect(list.json.items.map((x: { id: string }) => x.id)).toEqual([c.id, b.id, a.id]);
    expect(list.json.items[0].official).toBe(true);
    // Un seul album officiel par événement.
    await expect(db.execute(sql`update event_albums set official_at = now() where id = ${a.id}`)).rejects.toThrow();
    // Page du média : du plus récent au plus ancien, deux par page.
    const p1 = await call(kenji, "GET", `/media/${leoMedia}/albums?limit=1`);
    expect(p1.json.items.map((x: { id: string }) => x.id)).toEqual([c.id]);
    expect(p1.json.nextCursor).toBe(c.id);
    const p2 = await call(kenji, "GET", `/media/${leoMedia}/albums?limit=1&cursor=${p1.json.nextCursor}`);
    expect(p2.json.items.map((x: { id: string }) => x.id)).toEqual([a.id]);
    expect(p2.json.nextCursor).toBeNull();
  });

  it("GET /me/albums : les miens, brouillons compris, filtrables par statut", async () => {
    await publishedAlbum(leo, eventId, 1);
    const draft = await call(leo, "POST", "/me/albums", { eventId });
    const all = await call(leo, "GET", "/me/albums");
    expect(all.json.items).toHaveLength(2);
    expect((await call(leo, "GET", "/me/albums?status=draft")).json.items.map((a: { id: string }) => a.id)).toEqual([
      draft.json.id,
    ]);
    expect((await call(leo, "GET", "/me/albums?status=published")).json.items).toHaveLength(1);
    expect((await call(leo, "GET", "/me/albums?status=nope")).status).toBe(400);
    expect((await call(kenji, "GET", "/me/albums")).json.items).toHaveLength(0);
  });
});
