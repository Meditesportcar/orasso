// Sans session (R8a2, décision T4) : un visiteur ne voit que les publications de l'organisateur, sur la fiche de
// l'événement et la page de la structure ; liste blanche de `PublicPostView` ; route des photos publiques.
import { randomBytes, randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createPro,
  createStructure,
  resetDb,
  seedReference,
  signUp,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { feedPostPhotos, feedPosts, mediaProfiles, profiles, providerProfiles, structures } from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { storage } from "../../lib/storage";
import { materializeMentions } from "./mentions";
import { feedPhotoKey, feedPhotoName } from "./posts";

afterAll(async () => {
  await pool.end();
});

const HOUR = 3_600_000;
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  await seedReference();
});

async function world() {
  const owner = await signUp("Orga_P", { twoFactor: true });
  const structure = await createStructure(owner.id);
  const event = await createEvent(structure.id, {
    title: "Rassemblement P",
    startsAt: new Date(clock.now.getTime() + HOUR),
    endsAt: new Date(clock.now.getTime() + 5 * HOUR),
    posterKey: "events/poster-p.webp",
  });
  return { owner, structure, event };
}

/** Publication insérée avec une vraie photo dans le stockage ; rend aussi l'adresse de la photo. */
async function mkPost(over: Partial<typeof feedPosts.$inferInsert> & { authorId: string }, photo = true) {
  const [row] = await db
    .insert(feedPosts)
    .values({ caption: "Une légende", department: "66", createdAt: clock.now, ...over })
    .returning();
  let name = "";
  if (photo) {
    const key = feedPhotoKey(row!.id, randomBytes(16).toString("hex"));
    await storage.put(key, Buffer.from("fausse-image-webp"));
    await db
      .insert(feedPostPhotos)
      .values({ postId: row!.id, storageKey: key, width: 1080, height: 1350, position: 0, noPlateConfirmed: true });
    name = feedPhotoName(key);
  }
  await materializeMentions(db, row!.id);
  return { row: row!, name };
}
const orgPost = (
  w: Awaited<ReturnType<typeof world>>,
  over: Partial<typeof feedPosts.$inferInsert> = {},
  photo = true,
) =>
  mkPost(
    {
      authorId: w.owner.id,
      persona: "organizer",
      structureId: w.structure.id,
      eventId: w.event.id,
      eventRole: "organizer",
      ...over,
    },
    photo,
  );

const PUBLIC_KEYS = [
  "attach",
  "author",
  "caption",
  "createdAt",
  "id",
  "important",
  "photos",
  "pinned",
  "placeLabel",
  "reactionsCount",
  "visual",
];

describe("journal et liste d'une structure, sans session", () => {
  it("le journal est servi, l'épinglée en tête, en liste blanche (type PublicPostView)", async () => {
    const w = await world();
    const a = await orgPost(w, { createdAt: new Date(clock.now.getTime() - 2 * HOUR) });
    const b = await orgPost(w, { createdAt: new Date(clock.now.getTime() - HOUR) }, false);
    await db
      .update(feedPosts)
      .set({ pinnedAt: new Date(0) })
      .where(eq(feedPosts.id, a.row.id));
    const r = await call(null, "GET", `/events/${w.event.id}/feed-posts`);
    expect(r.status).toBe(200);
    expect(r.json.items.map((i: { id: string }) => i.id)).toEqual([a.row.id, b.row.id]);
    for (const item of r.json.items) expect(Object.keys(item).sort()).toEqual(PUBLIC_KEYS);
    expect(Object.keys(r.json.items[0].author).sort()).toEqual(["avatarUrl", "key", "kind", "name", "verified"]);
    expect(r.json.items[0].author).toMatchObject({ key: `s:${w.structure.id}`, name: "Club de test" });
    // Photo propre : l'adresse publique ; sans photo : l'affiche de l'événement.
    expect(r.json.items[0].photos[0].url).toBe(`/api/public/feed-posts/${a.row.id}/photos/${a.name}`);
    expect(r.json.items[0].visual).toBe("photos");
    expect(r.json.items[1].visual).toBe("event_poster");
    // Rien de la personne qui a publié : ni identifiant, ni pseudo.
    expect(r.text).not.toContain(w.owner.id);
    expect(r.text).not.toContain(w.owner.pseudo);
    expect(r.text).not.toContain("reactedByMe");
    expect(r.text).not.toContain("lastComments");
    expect(r.text).not.toContain("coAuthor");
  });

  it("la liste d'une structure est servie (`s:`), avec filtre et curseur ; toute autre clé : 401", async () => {
    const w = await world();
    const a = await orgPost(w);
    const noEvent = await mkPost({ authorId: w.owner.id, persona: "organizer", structureId: w.structure.id });
    const pro = await createPro((await signUp("ProOwner_P")).id);
    const fan = await signUp("Fan_P");
    const prov = await signUp("Presta_P");
    const [pp] = await db
      .insert(providerProfiles)
      .values({ userId: prov.id, type: "photographer", name: "Studio" })
      .returning();
    const [mm] = await db.insert(mediaProfiles).values({ userId: prov.id, name: "Média" }).returning();
    const r = await call(null, "GET", `/authors/s:${w.structure.id}/feed-posts`);
    expect(r.status).toBe(200);
    expect(r.json.items.map((i: { id: string }) => i.id).sort()).toEqual([a.row.id, noEvent.row.id].sort());
    expect(Object.keys(r.json)).toEqual(["items", "nextCursor"]);
    for (const item of r.json.items) expect(Object.keys(item).sort()).toEqual(PUBLIC_KEYS);
    const ev = await call(null, "GET", `/authors/s:${w.structure.id}/feed-posts?filter=event`);
    expect(ev.json.items.map((i: { id: string }) => i.id)).toEqual([a.row.id]);
    for (const key of [`u:${fan.id}`, `p:${pro.id}`, `v:${pp!.id}`, `m:${mm!.id}`]) {
      expect((await call(null, "GET", `/authors/${key}/feed-posts`)).status, key).toBe(401);
    }
    expect((await call(null, "GET", "/authors/pas-une-cle/feed-posts")).status).toBe(404);
    // Page supprimée ou suspendue : 404 comme avec une session.
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, w.structure.id));
    expect((await call(null, "GET", `/authors/s:${w.structure.id}/feed-posts`)).status).toBe(404);
  });

  it("jamais une publication de personne, de pro, de prestataire ou de média ; ni celle d'un membre qui cite l'organisateur", async () => {
    const w = await world();
    const fan = await signUp("Fan_P");
    const po = await signUp("ProOwner_P");
    const pro = await createPro(po.id);
    await orgPost(w);
    await mkPost({ authorId: fan.id, eventId: w.event.id, eventRole: "attendee", caption: `@${w.structure.slug}` });
    await mkPost({ authorId: po.id, persona: "pro", proId: pro.id, eventId: w.event.id });
    const journal = await call(null, "GET", `/events/${w.event.id}/feed-posts`);
    const list = await call(null, "GET", `/authors/s:${w.structure.id}/feed-posts`);
    expect(journal.json.items).toHaveLength(1);
    expect(list.json.items).toHaveLength(1);
    expect(journal.text + list.text).not.toContain(fan.pseudo);
  });

  it("toute mention, toute autre liste et la publication seule exigent une session (401)", async () => {
    const w = await world();
    const p = await orgPost(w);
    for (const path of [
      `/events/${w.event.id}/mentions?section=fans`,
      `/events/${w.event.id}/mentions?section=on_site`,
      `/authors/s:${w.structure.id}/mentions`,
      `/feed-posts/${p.row.id}`,
      `/feed-posts/${p.row.id}/photos/${p.name}`,
      "/fil",
      "/me/feed-posts",
    ]) {
      expect((await call(null, "GET", path)).status, path).toBe(401);
    }
    expect((await call(null, "PUT", `/events/${w.event.id}/feed-posts/${p.row.id}/pin`)).status).toBe(401);
    expect((await call(null, "PUT", `/mentions/e:${w.event.id}/${p.row.id}/hidden`)).status).toBe(401);
  });

  it("événement brouillon, sur invitation, inconnu : 404 même sans session", async () => {
    const w = await world();
    const draft = await createEvent(w.structure.id, { status: "draft" });
    const invite = await createEvent(w.structure.id, { admission: "invite_only" });
    for (const id of [draft.id, invite.id, randomUUID()]) {
      expect((await call(null, "GET", `/events/${id}/feed-posts`)).status, id).toBe(404);
    }
  });

  it("publication retirée, compte banni : rien ; compte privé de qui a publié : le journal reste servi", async () => {
    const w = await world();
    await orgPost(w, { deletedAt: new Date(0) });
    const ok = await orgPost(w);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, w.owner.id));
    expect(
      (await call(null, "GET", `/events/${w.event.id}/feed-posts`)).json.items.map((i: { id: string }) => i.id),
    ).toEqual([ok.row.id]);
    await db
      .update(profiles)
      .set({ bannedAt: new Date(0) })
      .where(eq(profiles.userId, w.owner.id));
    expect((await call(null, "GET", `/events/${w.event.id}/feed-posts`)).json.items).toEqual([]);
  });
});

describe("structure non vérifiée : rien de public", () => {
  it("en attente, non vérifiée, suspendue, supprimée : journal, liste et photo en 404 ; vérifiée : servis", async () => {
    const w = await world();
    const p = await orgPost(w);
    const check = async (expected: number) => {
      const j = await call(null, "GET", `/events/${w.event.id}/feed-posts`);
      const l = await call(null, "GET", `/authors/s:${w.structure.id}/feed-posts`);
      const ph = await app.request(`/api/public/feed-posts/${p.row.id}/photos/${p.name}`);
      return [j.status, l.status, ph.status, expected];
    };
    expect(await check(200)).toEqual([200, 200, 200, 200]);
    for (const verification of ["pending", "unverified"] as const) {
      await db.update(structures).set({ verification }).where(eq(structures.id, w.structure.id));
      expect((await check(404)).slice(0, 3), verification).toEqual([404, 404, 404]);
      // Un membre connecté garde la liste (comme avant).
      expect((await call(w.owner, "GET", `/authors/s:${w.structure.id}/feed-posts`)).status).toBe(200);
    }
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, w.structure.id));
    expect((await check(404)).slice(0, 3)).toEqual([404, 404, 404]);
    await db
      .update(structures)
      .set({ verification: "verified", deletedAt: new Date(0) })
      .where(eq(structures.id, w.structure.id));
    expect((await check(404)).slice(0, 3)).toEqual([404, 404, 404]);
  });
});

describe("photos publiques", () => {
  it("200 et 304 sans Set-Cookie, même avec une session à renouveler (route avant la session)", async () => {
    const w = await world();
    const p = await orgPost(w);
    const fan = await signUp("Cookie_P");
    const url = `/api/public/feed-posts/${p.row.id}/photos/${p.name}`;
    const res = await app.request(url, { headers: { cookie: fan.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    const again = await app.request(url, {
      headers: { cookie: fan.cookie, "if-none-match": res.headers.get("etag") ?? "" },
    });
    expect(again.status).toBe(304);
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  const photo = (id: string, name: string, headers: Record<string, string> = {}) =>
    app.request(`/api/public/feed-posts/${id}/photos/${name}`, { headers });

  it("une publication d'organisateur : servie sans session, `public, max-age=300`, ETag et 304", async () => {
    const w = await world();
    const p = await orgPost(w);
    const res = await photo(p.row.id, p.name);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, no-cache");
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("set-cookie")).toBeNull();
    const etag = res.headers.get("etag") ?? "";
    expect(etag).not.toBe("");
    expect((await photo(p.row.id, p.name, { "if-none-match": etag })).status).toBe(304);
  });

  it("publication d'une personne, d'un pro, d'un prestataire, d'un média, retirée, page suspendue, inconnue : 404", async () => {
    const w = await world();
    const fan = await signUp("Fan_P");
    const po = await signUp("ProOwner_P");
    const pro = await createPro(po.id);
    const prov = await signUp("Presta_P");
    const [pp] = await db
      .insert(providerProfiles)
      .values({ userId: prov.id, type: "photographer", name: "Studio" })
      .returning();
    const [mm] = await db.insert(mediaProfiles).values({ userId: prov.id, name: "Média" }).returning();
    const posts = [
      await mkPost({ authorId: fan.id }),
      await mkPost({ authorId: fan.id, eventId: w.event.id, eventRole: "attendee" }),
      await mkPost({ authorId: po.id, persona: "pro", proId: pro.id }),
      await mkPost({ authorId: prov.id, persona: "provider", providerId: pp!.id }),
      await mkPost({ authorId: prov.id, persona: "media", mediaId: mm!.id }),
      await orgPost(w, { deletedAt: new Date(0) }),
    ];
    for (const p of posts) expect((await photo(p.row.id, p.name)).status, p.row.persona).toBe(404);
    const ok = await orgPost(w);
    expect((await photo(ok.row.id, "0".repeat(32) + ".webp")).status).toBe(404);
    expect((await photo(ok.row.id, "pas-un-nom")).status).toBe(404);
    expect((await photo(randomUUID(), ok.name)).status).toBe(404);
    expect((await photo("pas-un-uuid", ok.name)).status).toBe(404);
    // La photo d'une autre publication sous un autre identifiant : 404.
    const other = await orgPost(w);
    expect((await photo(other.row.id, ok.name)).status).toBe(404);
    expect((await photo(ok.row.id, ok.name)).status).toBe(200);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, w.structure.id));
    expect((await photo(ok.row.id, ok.name)).status).toBe(404);
    await db.update(structures).set({ verification: "verified" }).where(eq(structures.id, w.structure.id));
    await db
      .update(profiles)
      .set({ bannedAt: new Date(0) })
      .where(eq(profiles.userId, w.owner.id));
    expect((await photo(ok.row.id, ok.name)).status).toBe(404);
  });

  it("la route protégée du Fil exige toujours une session pour la même photo", async () => {
    const w = await world();
    const p = await orgPost(w);
    const res = await app.request(`/api/feed-posts/${p.row.id}/photos/${p.name}`);
    expect(res.status).toBe(401);
  });
});
