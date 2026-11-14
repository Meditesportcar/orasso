// Lot R9g (T46) : l'album « officiel » d'un événement. Qui peut le poser, un seul par événement (même sous deux requêtes simultanées),
// idempotence, façade `feature` de l'APK en ligne, ordre de `GET /events/:id/albums`.
import { eq, isNotNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createEvent,
  createStructure,
  resetDb,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { eventAlbums, session, user } from "../../db/schema";
import { accredit, mediaUser, organizerEvent, paris, publishedAlbum } from "./albums-test-helpers";

afterAll(async () => {
  await pool.end();
});

let orga: TestUser;
let eventId: string;
let structureId: string;
let leo: TestUser;
let kenji: TestUser;
let albumA: string;
let albumB: string;

const officialIds = async () =>
  (await db.select({ id: eventAlbums.id }).from(eventAlbums).where(isNotNull(eventAlbums.officialAt))).map((r) => r.id);
const put = (u: TestUser | null, event: string, album: string) =>
  call(u, "PUT", `/events/${event}/albums/${album}/official`);

beforeEach(async () => {
  await resetDb();
  const clock = useClock(paris(11, 5, 12));
  const s = await organizerEvent();
  orga = s.orga;
  eventId = s.event.id;
  structureId = s.structure.id;
  const l = await mediaUser("Leo_Media", "Sud Cars");
  const k = await mediaUser("Kenji_Media", "Objectif 66");
  leo = l.user;
  kenji = k.user;
  await accredit(leo, l.mediaId, eventId);
  await accredit(kenji, k.mediaId, eventId);
  albumA = (await publishedAlbum(leo, eventId, 1)).id;
  // Kenji publie plus tard : l'ordre « du plus récent » est net.
  clock.set(paris(11, 5, 13));
  albumB = (await publishedAlbum(kenji, eventId, 1)).id;
});

describe("PUT|DELETE /events/:id/albums/:albumId/official", () => {
  it("l'organisateur pose l'étoile, puis la déplace : un seul officiel par événement", async () => {
    const a = await put(orga, eventId, albumA);
    expect(a.status).toBe(200);
    expect(a.json).toMatchObject({ id: albumA, official: true });
    expect(await officialIds()).toEqual([albumA]);
    const b = await put(orga, eventId, albumB);
    expect(b.json).toMatchObject({ id: albumB, official: true });
    expect(await officialIds()).toEqual([albumB]);
  });

  it("poser l'étoile deux fois ne change rien (idempotent, la date est gardée)", async () => {
    await put(orga, eventId, albumA);
    const [first] = await db.select({ at: eventAlbums.officialAt }).from(eventAlbums).where(eq(eventAlbums.id, albumA));
    const again = await put(orga, eventId, albumA);
    expect(again.status).toBe(200);
    const [second] = await db
      .select({ at: eventAlbums.officialAt })
      .from(eventAlbums)
      .where(eq(eventAlbums.id, albumA));
    expect(second?.at?.toISOString()).toBe(first?.at?.toISOString());
  });

  it("DELETE retire l'étoile, et reste idempotent", async () => {
    await put(orga, eventId, albumA);
    const del = await call(orga, "DELETE", `/events/${eventId}/albums/${albumA}/official`);
    expect(del.status).toBe(200);
    expect(del.json.official).toBe(false);
    expect(await officialIds()).toEqual([]);
    expect((await call(orga, "DELETE", `/events/${eventId}/albums/${albumA}/official`)).status).toBe(200);
    // Retirer l'étoile d'un album qui ne l'a pas laisse celle d'un autre.
    await put(orga, eventId, albumB);
    expect((await call(orga, "DELETE", `/events/${eventId}/albums/${albumA}/official`)).status).toBe(200);
    expect(await officialIds()).toEqual([albumB]);
  });

  it("deux PUT simultanés sur deux albums : un seul officiel au final", async () => {
    const [x, y] = await Promise.all([put(orga, eventId, albumA), put(orga, eventId, albumB)]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect((await officialIds()).length).toBe(1);
  });

  it("second facteur manquant : 403 two_factor_required, rien ne bouge", async () => {
    await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, orga.id));
    await db.update(session).set({ secondFactor: null }).where(eq(session.userId, orga.id));
    const res = await put(orga, eventId, albumA);
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("two_factor_required");
    expect(await officialIds()).toEqual([]);
  });

  it("staff, autre structure, média et passionné : 403, sans révéler l'album ; sans session : 401", async () => {
    const staff = await signUp("Staff_66", { twoFactor: true });
    await addMember(structureId, staff.id, "staff");
    const other = await signUp("Autre_Orga", { twoFactor: true });
    const otherStructure = await createStructure(other.id);
    await createEvent(otherStructure.id, { slug: `autre-${Date.now()}` });
    const fan = await signUp("Fan_66");
    for (const u of [staff, other, leo, kenji, fan]) {
      expect((await put(u, eventId, albumA)).status).toBe(403);
      expect((await call(u, "DELETE", `/events/${eventId}/albums/${albumA}/official`)).status).toBe(403);
    }
    // Un album qui n'existe pas : 403 aussi pour un non-organisateur (rien n'est révélé), 404 pour l'organisateur.
    expect((await put(other, eventId, crypto.randomUUID())).status).toBe(403);
    expect((await put(orga, eventId, crypto.randomUUID())).status).toBe(404);
    expect((await put(null, eventId, albumA)).status).toBe(401);
    expect(await officialIds()).toEqual([]);
  });

  it("un album d'un autre événement : 404 ; un brouillon ou un album retiré : 404", async () => {
    const e2 = await createEvent(structureId, { slug: `second-${Date.now()}` });
    expect((await put(orga, e2.id, albumA)).status).toBe(404);
    await call(leo, "DELETE", `/me/albums/${albumA}`);
    expect((await put(orga, eventId, albumA)).status).toBe(404);
  });

  it("un média dont l'accréditation est tombée : on ne lui pose pas l'étoile (403)", async () => {
    await db.execute(sql`update applications set status = 'refused' where user_id = ${leo.id}`);
    // L'album n'est plus visible ni officialisable.
    const res = await put(orga, eventId, albumA);
    expect(res.status).toBe(403);
  });

  it("GET /events/:id/albums : l'officiel d'abord, puis du plus récent", async () => {
    let list = await call(orga, "GET", `/events/${eventId}/albums`);
    expect(list.json.items.map((i: { id: string }) => i.id)).toEqual([albumB, albumA]);
    await put(orga, eventId, albumA);
    list = await call(orga, "GET", `/events/${eventId}/albums`);
    expect(list.json.items.map((i: { id: string }) => i.id)).toEqual([albumA, albumB]);
    expect(list.json.items[0].official).toBe(true);
  });

  it("la façade `PATCH …/media-contents/:cid/feature` fait pareil et prévient encore le média", async () => {
    const on = await call(orga, "PATCH", `/events/${eventId}/media-contents/${albumA}/feature`, { featured: true });
    expect(on.status).toBe(200);
    expect(on.json.featured).toBe(true);
    expect(await officialIds()).toEqual([albumA]);
    const moved = await call(orga, "PATCH", `/events/${eventId}/media-contents/${albumB}/feature`, { featured: true });
    expect(moved.json.featured).toBe(true);
    expect(await officialIds()).toEqual([albumB]);
    const n = await db.execute(
      sql`select count(*)::int as n from notifications where type = 'media_content_featured' and user_id = ${leo.id}`,
    );
    expect((n.rows[0] as { n: number }).n).toBe(1);
    // La route neuve, elle, ne prévient pas le média (la fiche le montre).
    await put(orga, eventId, albumA);
    const m = await db.execute(
      sql`select count(*)::int as n from notifications where type = 'media_content_featured' and user_id = ${leo.id}`,
    );
    expect((m.rows[0] as { n: number }).n).toBe(1);
    const off = await call(orga, "PATCH", `/events/${eventId}/media-contents/${albumA}/feature`, { featured: false });
    expect(off.json.featured).toBe(false);
    expect(await officialIds()).toEqual([]);
  });

  it("sans session : la liste publique des albums de la fiche (officiel d'abord, photos à l'adresse publique, aucun cookie)", async () => {
    await put(orga, eventId, albumA);
    const slug = (await db.execute(sql`select slug from events where id = ${eventId}`)).rows[0] as { slug: string };
    const res = await app.request(`/api/public/events/by-slug/${slug.slug}/albums`);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    const json = (await res.json()) as {
      items: { id: string; official: boolean; mine: boolean; cover: { url: string }[] }[];
    };
    expect(json.items.map((a) => a.id)).toEqual([albumA, albumB]);
    expect(json.items[0]?.official).toBe(true);
    expect(json.items.every((a) => !a.mine)).toBe(true);
    expect(json.items[0]?.cover[0]?.url.startsWith("/api/public/albums/")).toBe(true);
    // Un événement sur invitation ou inconnu : 404.
    expect((await app.request("/api/public/events/by-slug/inconnu/albums")).status).toBe(404);
  });
});
