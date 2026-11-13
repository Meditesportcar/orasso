// Lot R9e : qui voit quoi. Droits par regard (titulaire, autre média accrédité, organisateur, passionné, sans session), brouillon
// jamais servi à un autre, accréditation retirée après la publication (V6 gardée), média ou compte hors règle, liste blanche des
// vues (ni `plate_state`, ni `plate_rects`, ni `author_id`, ni le pseudo du titulaire), routes des photos (protégée et publique).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
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
      [...keysOf({ items: [view.json], nextCursor: null })].filter((k) => k !== "photos").sort(),
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
