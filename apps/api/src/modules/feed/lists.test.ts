// Listes par auteur, journal d'un événement, épingle, compteurs des fiches (R8a2) : par regard, strictement les siennes,
// compte privé, curseurs, concurrence, aucune requête par publication.
import { randomBytes, randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addMember,
  call,
  createEvent,
  createPro,
  createStructure,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  feedPostPhotos,
  feedPosts,
  mediaProfiles,
  profiles,
  providerProfiles,
  structures,
  userFollows,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { journalPostIds } from "./lists";
import { materializeMentions } from "./mentions";
import { feedPhotoKey, loadPostViews } from "./posts";

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
  const owner = await signUp("Orga_L", { twoFactor: true });
  const structure = await createStructure(owner.id);
  const event = await createEvent(structure.id, {
    title: "Rassemblement L",
    startsAt: new Date(clock.now.getTime() + HOUR),
    endsAt: new Date(clock.now.getTime() + 5 * HOUR),
    posterKey: "events/poster-l.webp",
  });
  return { owner, structure, event };
}

type PostOver = Partial<typeof feedPosts.$inferInsert> & { authorId: string };
async function mkPost(over: PostOver, photo = true) {
  const [row] = await db
    .insert(feedPosts)
    .values({ caption: "Une légende", department: "66", createdAt: clock.now, ...over })
    .returning();
  if (photo) {
    await db.insert(feedPostPhotos).values({
      postId: row!.id,
      storageKey: feedPhotoKey(row!.id, randomBytes(16).toString("hex")),
      width: 1080,
      height: 1350,
      position: 0,
      noPlateConfirmed: true,
    });
  }
  await materializeMentions(db, row!.id);
  return row!;
}
/** Publication de la casquette organisateur, rattachée à l'événement (affiche pour visuel si `photo` est faux). */
const journalPost = (
  w: Awaited<ReturnType<typeof world>>,
  over: Partial<typeof feedPosts.$inferInsert> = {},
  photo = false,
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

const ids = (r: { json: { items: { id: string }[] } }) => r.json.items.map((i) => i.id);
const follow = (follower: TestUser, followed: TestUser, status: "accepted" | "pending" = "accepted") =>
  db.insert(userFollows).values({ followerId: follower.id, followedId: followed.id, status });
const makePrivate = (u: TestUser) =>
  db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, u.id));

describe("liste d'un auteur : une personne", () => {
  it("par regard : moi, abonné accepté, membre connecté ; compte public lisible, privé restreint", async () => {
    await world();
    const me = await signUp("Moi_L");
    const follower = await signUp("Abonne_L");
    const pending = await signUp("Attente_L");
    const stranger = await signUp("Membre_L");
    const mine = await mkPost({ authorId: me.id, caption: "à moi" });
    // Public : tout membre connecté.
    for (const who of [me, follower, stranger]) {
      const r = await call(who, "GET", `/authors/u:${me.id}/feed-posts`);
      expect(r.status).toBe(200);
      expect(ids(r)).toEqual([mine.id]);
      expect(r.json.restricted).toBe(false);
    }
    await makePrivate(me);
    await follow(follower, me);
    await follow(pending, me, "pending");
    expect(ids(await call(me, "GET", `/authors/u:${me.id}/feed-posts`))).toEqual([mine.id]);
    expect(ids(await call(follower, "GET", `/authors/u:${me.id}/feed-posts`))).toEqual([mine.id]);
    for (const who of [pending, stranger]) {
      const r = await call(who, "GET", `/authors/u:${me.id}/feed-posts`);
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ items: [], nextCursor: null, restricted: true });
    }
  });

  it("compte privé : `restricted` identique avec zéro ou dix publications", async () => {
    await world();
    const empty = await signUp("Vide_L");
    const full = await signUp("Plein_L");
    const viewer = await signUp("Lecteur_L");
    await makePrivate(empty);
    await makePrivate(full);
    for (let i = 0; i < 10; i++)
      await mkPost({ authorId: full.id, createdAt: new Date(clock.now.getTime() - i * 1000) });
    const a = await call(viewer, "GET", `/authors/u:${empty.id}/feed-posts`);
    const b = await call(viewer, "GET", `/authors/u:${full.id}/feed-posts`);
    expect(a.status).toBe(200);
    expect(a.json).toEqual(b.json);
    expect(a.json.restricted).toBe(true);
    // Le filtre et le curseur ne changent rien non plus.
    const c = await call(viewer, "GET", `/authors/u:${full.id}/feed-posts?filter=event`);
    expect(c.json).toEqual(a.json);
  });

  it("compte suspendu, banni, supprimé ou inconnu : 404 ; clé mal formée : 404 ; sans session : 401", async () => {
    await world();
    const viewer = await signUp("Lecteur_L");
    const bad = await signUp("Banni_L");
    const susp = await signUp("Susp_L");
    const gone = await signUp("Parti_L");
    await db
      .update(profiles)
      .set({ bannedAt: new Date(0) })
      .where(eq(profiles.userId, bad.id));
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + HOUR) })
      .where(eq(profiles.userId, susp.id));
    await db
      .update(profiles)
      .set({ deletedAt: new Date(0) })
      .where(eq(profiles.userId, gone.id));
    for (const u of [bad, susp, gone]) {
      expect((await call(viewer, "GET", `/authors/u:${u.id}/feed-posts`)).status, u.pseudo).toBe(404);
    }
    expect((await call(viewer, "GET", "/authors/u:inconnu-du-tout/feed-posts")).status).toBe(404);
    for (const key of ["x", "s:123", "e:" + randomUUID(), "u:", "S:" + randomUUID()]) {
      expect((await call(viewer, "GET", `/authors/${encodeURIComponent(key)}/feed-posts`)).status, key).toBe(404);
    }
    expect((await call(null, "GET", `/authors/u:${viewer.id}/feed-posts`)).status).toBe(401);
  });

  it("strictement les siennes : jamais les publications d'une page signées par la même personne", async () => {
    const w = await world();
    const co = await signUp("Co_L", { twoFactor: true });
    await addMember(w.structure.id, co.id, "co_organizer");
    const own = await mkPost({ authorId: co.id, caption: "à titre personnel" });
    const asPage = await journalPost(w, { authorId: co.id }, true);
    const viewer = await signUp("Lecteur_L");
    expect(ids(await call(viewer, "GET", `/authors/u:${co.id}/feed-posts`))).toEqual([own.id]);
    expect(ids(await call(viewer, "GET", `/authors/s:${w.structure.id}/feed-posts`))).toEqual([asPage.id]);
  });

  it("filtres `event` / `no_event` et tri par date décroissante", async () => {
    const w = await world();
    const fan = await signUp("Fan_L");
    const viewer = await signUp("Lecteur_L");
    const old = await mkPost({ authorId: fan.id, createdAt: new Date(clock.now.getTime() - 3 * HOUR) });
    const att = await mkPost({
      authorId: fan.id,
      eventId: w.event.id,
      eventRole: "attendee",
      createdAt: new Date(clock.now.getTime() - 2 * HOUR),
    });
    const recent = await mkPost({ authorId: fan.id, createdAt: new Date(clock.now.getTime() - HOUR) });
    expect(ids(await call(viewer, "GET", `/authors/u:${fan.id}/feed-posts`))).toEqual([recent.id, att.id, old.id]);
    expect(ids(await call(viewer, "GET", `/authors/u:${fan.id}/feed-posts?filter=event`))).toEqual([att.id]);
    expect(ids(await call(viewer, "GET", `/authors/u:${fan.id}/feed-posts?filter=no_event`))).toEqual([
      recent.id,
      old.id,
    ]);
    expect((await call(viewer, "GET", `/authors/u:${fan.id}/feed-posts?filter=zzz`)).status).toBe(400);
  });

  it("une publication retirée ou d'un compte banni n'apparaît pas ; une publication sans visuel non plus", async () => {
    const w = await world();
    const fan = await signUp("Fan_L");
    const viewer = await signUp("Lecteur_L");
    const kept = await mkPost({ authorId: fan.id });
    const removed = await mkPost({ authorId: fan.id, deletedAt: new Date(0) });
    await mkPost({ authorId: fan.id }, false);
    void removed;
    void w;
    expect(ids(await call(viewer, "GET", `/authors/u:${fan.id}/feed-posts`))).toEqual([kept.id]);
  });

  it("curseur : aucun doublon ni trou, y compris à la même milliseconde", async () => {
    await world();
    const fan = await signUp("Fan_L");
    const viewer = await signUp("Lecteur_L");
    const same = new Date(clock.now.getTime() - HOUR);
    const made: string[] = [];
    for (let i = 0; i < 45; i++) {
      const at = i < 8 ? same : new Date(clock.now.getTime() - (i + 2) * 60_000);
      made.push((await mkPost({ authorId: fan.id, createdAt: at })).id);
    }
    const seen: string[] = [];
    let cursor = "";
    for (let page = 0; page < 4; page++) {
      const r = await call(viewer, "GET", `/authors/u:${fan.id}/feed-posts?filter=all${cursor}`);
      expect(r.json.items.length).toBeLessThanOrEqual(20);
      seen.push(...ids(r));
      if (!r.json.nextCursor) break;
      cursor = `&cursor=${r.json.nextCursor}`;
    }
    expect(new Set(seen).size).toBe(45);
    expect([...seen].sort()).toEqual([...made].sort());
    expect((await call(viewer, "GET", `/authors/u:${fan.id}/feed-posts?cursor=n-importe-quoi`)).status).toBe(400);
  });
});

describe("liste d'un auteur : une page", () => {
  it("structure : strictement ses publications ; ni celle d'un membre qui la cite, ni celle d'un co-organisateur en son nom propre", async () => {
    const w = await world();
    const co = await signUp("Co_L", { twoFactor: true });
    await addMember(w.structure.id, co.id, "co_organizer");
    const fan = await signUp("Fan_L");
    const viewer = await signUp("Lecteur_L");
    const page = await journalPost(w, {}, true);
    const noEvent = await mkPost({ authorId: w.owner.id, persona: "organizer", structureId: w.structure.id });
    await mkPost({ authorId: fan.id, eventId: w.event.id, eventRole: "attendee", caption: `@${w.structure.slug}` });
    await mkPost({ authorId: co.id, caption: "en mon nom" });
    await mkPost({ authorId: co.id, eventId: w.event.id, eventRole: "attendee", caption: "pour le Lydia" });
    const r = await call(viewer, "GET", `/authors/s:${w.structure.id}/feed-posts`);
    expect(ids(r).sort()).toEqual([page.id, noEvent.id].sort());
    expect(ids(await call(viewer, "GET", `/authors/s:${w.structure.id}/feed-posts?filter=event`))).toEqual([page.id]);
    expect(ids(await call(viewer, "GET", `/authors/s:${w.structure.id}/feed-posts?filter=no_event`))).toEqual([
      noEvent.id,
    ]);
  });

  it("page supprimée ou suspendue, ou inconnue : 404 ; fiche pro, prestataire, média : leurs publications", async () => {
    const w = await world();
    const viewer = await signUp("Lecteur_L");
    const po = await signUp("ProOwner_L");
    const pro = await createPro(po.id);
    const prov = await signUp("Presta_L");
    const [pp] = await db
      .insert(providerProfiles)
      .values({ userId: prov.id, type: "photographer", name: "Studio" })
      .returning();
    const [mm] = await db.insert(mediaProfiles).values({ userId: prov.id, name: "Média" }).returning();
    const a = await mkPost({ authorId: po.id, persona: "pro", proId: pro.id });
    const b = await mkPost({ authorId: prov.id, persona: "provider", providerId: pp!.id });
    const c = await mkPost({ authorId: prov.id, persona: "media", mediaId: mm!.id });
    expect(ids(await call(viewer, "GET", `/authors/p:${pro.id}/feed-posts`))).toEqual([a.id]);
    expect(ids(await call(viewer, "GET", `/authors/v:${pp!.id}/feed-posts`))).toEqual([b.id]);
    expect(ids(await call(viewer, "GET", `/authors/m:${mm!.id}/feed-posts`))).toEqual([c.id]);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, w.structure.id));
    expect((await call(viewer, "GET", `/authors/s:${w.structure.id}/feed-posts`)).status).toBe(404);
    await db
      .update(structures)
      .set({ verification: "verified", deletedAt: new Date(0) })
      .where(eq(structures.id, w.structure.id));
    expect((await call(viewer, "GET", `/authors/s:${w.structure.id}/feed-posts`)).status).toBe(404);
    expect((await call(viewer, "GET", `/authors/s:${randomUUID()}/feed-posts`)).status).toBe(404);
  });

  it("la publication d'une page se lit même quand le compte de qui a publié est privé ; banni : elle disparaît", async () => {
    const w = await world();
    await makePrivate(w.owner);
    const viewer = await signUp("Lecteur_L");
    const p = await journalPost(w, {}, true);
    expect(ids(await call(viewer, "GET", `/authors/s:${w.structure.id}/feed-posts`))).toEqual([p.id]);
    await db
      .update(profiles)
      .set({ bannedAt: new Date(0) })
      .where(eq(profiles.userId, w.owner.id));
    expect(ids(await call(viewer, "GET", `/authors/s:${w.structure.id}/feed-posts`))).toEqual([]);
  });
});

describe("journal d'un événement", () => {
  it("les publications de l'organisateur rattachées à l'événement, l'épinglée en tête", async () => {
    const w = await world();
    const fan = await signUp("Fan_L");
    const viewer = await signUp("Lecteur_L");
    const other = await createEvent(w.structure.id, { posterKey: "events/p.webp" });
    const a = await journalPost(w, { createdAt: new Date(clock.now.getTime() - 3 * HOUR) });
    const b = await journalPost(w, { createdAt: new Date(clock.now.getTime() - 2 * HOUR) });
    const c = await journalPost(w, { createdAt: new Date(clock.now.getTime() - HOUR) });
    await journalPost(w, { eventId: other.id });
    await mkPost({ authorId: fan.id, eventId: w.event.id, eventRole: "attendee" });
    await mkPost({ authorId: w.owner.id, persona: "organizer", structureId: w.structure.id });
    expect(ids(await call(viewer, "GET", `/events/${w.event.id}/feed-posts`))).toEqual([c.id, b.id, a.id]);
    await db
      .update(feedPosts)
      .set({ pinnedAt: new Date(0) })
      .where(eq(feedPosts.id, a.id));
    const r = await call(viewer, "GET", `/events/${w.event.id}/feed-posts`);
    expect(ids(r)).toEqual([a.id, c.id, b.id]);
    expect(r.json.items[0].pinned).toBe(true);
  });

  it("événement publié ou annulé seulement ; brouillon, sur invitation, structure supprimée, inconnu : 404", async () => {
    const w = await world();
    const viewer = await signUp("Lecteur_L");
    const cancelled = await createEvent(w.structure.id, { status: "cancelled", posterKey: "events/p.webp" });
    expect((await call(viewer, "GET", `/events/${cancelled.id}/feed-posts`)).status).toBe(200);
    const draft = await createEvent(w.structure.id, { status: "draft" });
    const invite = await createEvent(w.structure.id, { admission: "invite_only" });
    for (const id of [draft.id, invite.id, randomUUID()]) {
      expect((await call(viewer, "GET", `/events/${id}/feed-posts`)).status, id).toBe(404);
    }
    expect((await call(viewer, "GET", "/events/pas-un-uuid/feed-posts")).status).toBe(400);
  });

  it("première page : l'épinglée compte dans les 20, le reste suit sans doublon ni trou", async () => {
    const w = await world();
    const viewer = await signUp("Lecteur_L");
    const made: string[] = [];
    for (let i = 0; i < 30; i++) {
      made.push((await journalPost(w, { createdAt: new Date(clock.now.getTime() - (i + 1) * 60_000) })).id);
    }
    const pinned = made[17] as string;
    await db
      .update(feedPosts)
      .set({ pinnedAt: new Date(0) })
      .where(eq(feedPosts.id, pinned));
    const first = await call(viewer, "GET", `/events/${w.event.id}/feed-posts`);
    expect(first.json.items).toHaveLength(20);
    expect(first.json.items[0].id).toBe(pinned);
    const second = await call(viewer, "GET", `/events/${w.event.id}/feed-posts?cursor=${first.json.nextCursor}`);
    const seen = [...ids(first), ...ids(second)];
    expect(new Set(seen).size).toBe(30);
    expect(second.json.nextCursor).toBeNull();
    expect([...seen].sort()).toEqual([...made].sort());
  });
});

describe("épingle", () => {
  it("une seule par événement : épingler en remplace une autre ; DELETE la retire (idempotent)", async () => {
    const w = await world();
    const a = await journalPost(w);
    const b = await journalPost(w);
    const pin = (id: string) => call(w.owner, "PUT", `/events/${w.event.id}/feed-posts/${id}/pin`);
    expect((await pin(a.id)).json).toEqual({ pinnedPostId: a.id });
    expect((await pin(a.id)).json).toEqual({ pinnedPostId: a.id });
    expect((await pin(b.id)).json).toEqual({ pinnedPostId: b.id });
    const rows = await db.select().from(feedPosts).where(eq(feedPosts.eventId, w.event.id));
    expect(rows.filter((r) => r.pinnedAt).map((r) => r.id)).toEqual([b.id]);
    expect((await call(w.owner, "DELETE", `/events/${w.event.id}/feed-posts/${b.id}/pin`)).json).toEqual({
      pinnedPostId: null,
    });
    expect((await call(w.owner, "DELETE", `/events/${w.event.id}/feed-posts/${b.id}/pin`)).status).toBe(200);
    expect((await db.select().from(feedPosts)).filter((r) => r.pinnedAt)).toEqual([]);
  });

  it("deux épinglages simultanés : un seul gagne, aucun 500, l'autre reçoit l'état final", async () => {
    const w = await world();
    const a = await journalPost(w);
    const b = await journalPost(w);
    for (let round = 0; round < 3; round++) {
      const [r1, r2] = await Promise.all([
        call(w.owner, "PUT", `/events/${w.event.id}/feed-posts/${a.id}/pin`),
        call(w.owner, "PUT", `/events/${w.event.id}/feed-posts/${b.id}/pin`),
      ]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      const pinned = (await db.select().from(feedPosts)).filter((r) => r.pinnedAt);
      expect(pinned).toHaveLength(1);
      // Chaque réponse dit une épingle posée, et l'une des deux dit l'état final ; jamais un état impossible.
      for (const r of [r1, r2]) expect([a.id, b.id]).toContain(r.json.pinnedPostId);
      expect([r1.json.pinnedPostId, r2.json.pinnedPostId]).toContain(pinned[0]?.id);
    }
  });

  it("droits : co-organisateur oui ; staff, passionné, propriétaire sans second facteur, sans session non", async () => {
    const w = await world();
    const post = await journalPost(w);
    const co = await signUp("Co_L", { twoFactor: true });
    const staff = await signUp("Staff_L", { twoFactor: true });
    const fan = await signUp("Fan_L");
    const noFactor = await signUp("Sans2fa_L");
    await addMember(w.structure.id, co.id, "co_organizer");
    await addMember(w.structure.id, staff.id, "staff");
    await addMember(w.structure.id, noFactor.id, "co_organizer");
    const url = `/events/${w.event.id}/feed-posts/${post.id}/pin`;
    expect((await call(staff, "PUT", url)).status).toBe(403);
    expect((await call(fan, "PUT", url)).status).toBe(403);
    const nf = await call(noFactor, "PUT", url);
    expect(nf.status).toBe(403);
    expect(nf.json.error.code).toBe("two_factor_required");
    expect((await call(null, "PUT", url)).status).toBe(401);
    expect((await call(staff, "DELETE", url)).status).toBe(403);
    expect((await call(co, "PUT", url)).status).toBe(200);
  });

  it("une publication d'un autre événement, d'un passionné, d'une autre structure, inconnue ou supprimée : 404", async () => {
    const w = await world();
    const other = await createEvent(w.structure.id, { posterKey: "events/p.webp" });
    const fan = await signUp("Fan_L");
    const owner2 = await signUp("Orga2_L", { twoFactor: true });
    const s2 = await createStructure(owner2.id);
    const elsewhere = await journalPost(w, { eventId: other.id });
    const fanPost = await mkPost({ authorId: fan.id, eventId: w.event.id, eventRole: "attendee" });
    const foreign = await mkPost({
      authorId: owner2.id,
      persona: "organizer",
      structureId: s2.id,
      eventId: w.event.id,
      eventRole: "organizer",
    });
    const removed = await journalPost(w, { deletedAt: new Date(0) });
    for (const id of [elsewhere.id, fanPost.id, foreign.id, removed.id, randomUUID()]) {
      expect((await call(w.owner, "PUT", `/events/${w.event.id}/feed-posts/${id}/pin`)).status, id).toBe(404);
    }
    expect((await call(w.owner, "PUT", `/events/${w.event.id}/feed-posts/pas-un-uuid/pin`)).status).toBe(404);
  });

  it("la publication épinglée supprimée : plus d'épinglée ; une autre peut l'être ensuite", async () => {
    const w = await world();
    const a = await journalPost(w);
    const b = await journalPost(w);
    await call(w.owner, "PUT", `/events/${w.event.id}/feed-posts/${a.id}/pin`);
    expect((await call(w.owner, "DELETE", `/me/feed-posts/${a.id}`)).status).toBe(204);
    const viewer = await signUp("Lecteur_L");
    const r = await call(viewer, "GET", `/events/${w.event.id}/feed-posts`);
    expect(r.json.items.filter((i: { pinned: boolean }) => i.pinned)).toEqual([]);
    expect((await call(w.owner, "PUT", `/events/${w.event.id}/feed-posts/${b.id}/pin`)).json).toEqual({
      pinnedPostId: b.id,
    });
    expect((await call(w.owner, "PUT", `/events/${w.event.id}/feed-posts/${a.id}/pin`)).status).toBe(404);
  });

  it("`manage` : canPin pour le responsable d'une publication du journal", async () => {
    const w = await world();
    const post = await journalPost(w);
    const viewer = await signUp("Lecteur_L");
    const mine = await call(w.owner, "GET", `/feed-posts/${post.id}`);
    expect(mine.json.manage).toEqual({ canDelete: true, canPin: true, canCommentsOff: true, hideFrom: [] });
    const other = await call(viewer, "GET", `/feed-posts/${post.id}`);
    expect(other.json.manage).toEqual({ canDelete: false, canPin: false, canCommentsOff: false, hideFrom: [] });
    // La forme existante est inchangée (champs de R8a1 toujours là).
    expect(other.json).toMatchObject({
      id: post.id,
      author: { key: `s:${w.structure.id}` },
      attach: { role: "organizer" },
    });
  });
});

describe("compteurs des fiches", () => {
  it("événement : `publications` (le journal) et `mentions` (ce que ce lecteur verrait) ; sans session : mentions absent", async () => {
    const w = await world();
    const fan = await signUp("Fan_L");
    const priv = await signUp("Prive_L");
    await makePrivate(priv);
    const viewer = await signUp("Lecteur_L");
    await journalPost(w);
    await journalPost(w, {}, true);
    await mkPost({ authorId: fan.id, eventId: w.event.id, eventRole: "attendee" });
    await mkPost({ authorId: priv.id, eventId: w.event.id, eventRole: "attendee" });
    await follow(viewer, priv);
    const asViewer = await call(viewer, "GET", `/events/by-slug/${w.event.slug}`);
    expect(asViewer.json.publications).toEqual({ count: 2 });
    // Le compte privé n'entre dans aucun compteur, même pour qui le suit.
    expect(asViewer.json.mentions).toEqual({ count: 1 });
    const anon = await call(null, "GET", `/events/by-slug/${w.event.slug}`);
    expect(anon.status).toBe(200);
    expect(anon.json.publications).toEqual({ count: 2 });
    expect("mentions" in anon.json).toBe(false);
  });

  it("structure, pro, prestataire, média : `publications` et `mentions` ; sans session : seule la structure compte", async () => {
    const w = await world();
    const viewer = await signUp("Lecteur_L");
    const po = await signUp("ProOwner_L");
    const pro = await createPro(po.id, { verifiedAt: new Date(0) });
    const prov = await signUp("Presta_L");
    const [pp] = await db
      .insert(providerProfiles)
      .values({ userId: prov.id, type: "photographer", name: "Studio" })
      .returning();
    const [mm] = await db.insert(mediaProfiles).values({ userId: prov.id, name: "Média" }).returning();
    const fan = await signUp("Fan_L");
    await journalPost(w);
    await mkPost({ authorId: fan.id, eventId: w.event.id, eventRole: "attendee" });
    await mkPost({ authorId: fan.id, caption: `@${pro.slug}` });
    await mkPost({ authorId: po.id, persona: "pro", proId: pro.id });
    await mkPost({ authorId: prov.id, persona: "provider", providerId: pp!.id });
    await mkPost({ authorId: prov.id, persona: "media", mediaId: mm!.id });
    const s = await call(viewer, "GET", `/structures/by-slug/${w.structure.slug}`);
    expect(s.json).toMatchObject({ publications: { count: 1 }, mentions: { count: 1 } });
    const sAnon = await call(null, "GET", `/structures/by-slug/${w.structure.slug}`);
    expect(sAnon.json.publications).toEqual({ count: 1 });
    expect("mentions" in sAnon.json).toBe(false);
    const p = await call(viewer, "GET", `/pros/by-slug/${pro.slug}`);
    expect(p.json).toMatchObject({ publications: { count: 1 }, mentions: { count: 1 } });
    const pAnon = await call(null, "GET", `/pros/by-slug/${pro.slug}`);
    expect(pAnon.status).toBe(200);
    expect("publications" in pAnon.json).toBe(false);
    expect("mentions" in pAnon.json).toBe(false);
    const v = await call(viewer, "GET", `/providers/${pp!.id}`);
    expect(v.json).toMatchObject({ publications: { count: 1 }, mentions: { count: 0 } });
    const m = await call(viewer, "GET", `/media/${mm!.id}`);
    expect(m.json).toMatchObject({ publications: { count: 1 }, mentions: { count: 0 } });
  });

  it("profil : `publications` ; nul quand la liste est restreinte (compte privé non suivi), jamais un nombre de plus", async () => {
    await world();
    const priv = await signUp("Prive_L");
    const empty = await signUp("Vide_L");
    const follower = await signUp("Abonne_L");
    const stranger = await signUp("Membre_L");
    await makePrivate(priv);
    await makePrivate(empty);
    await mkPost({ authorId: priv.id });
    await mkPost({ authorId: priv.id });
    await follow(follower, priv);
    const as = async (u: TestUser, of: TestUser) =>
      (await call(u, "GET", `/users/${of.pseudo}`)).json.publications as { count: number } | null;
    expect(await as(priv, priv)).toEqual({ count: 2 });
    expect(await as(follower, priv)).toEqual({ count: 2 });
    expect(await as(stranger, priv)).toBeNull();
    expect(await as(stranger, empty)).toBeNull();
    const pub = await signUp("Public_L");
    await mkPost({ authorId: pub.id });
    expect(await as(stranger, pub)).toEqual({ count: 1 });
    // Le profil garde sa forme (les nombres du réseau y sont toujours).
    expect((await call(stranger, "GET", `/users/${priv.pseudo}`)).status).toBe(200);
  });

  it("le compteur ne dépasse jamais la liste : retirée, sans visuel, page suspendue", async () => {
    const w = await world();
    const viewer = await signUp("Lecteur_L");
    await journalPost(w, {}, true);
    await journalPost(w, { deletedAt: new Date(0) }, true);
    await mkPost({ authorId: w.owner.id, persona: "organizer", structureId: w.structure.id }, false);
    const s = await call(viewer, "GET", `/structures/by-slug/${w.structure.slug}`);
    const list = await call(viewer, "GET", `/authors/s:${w.structure.id}/feed-posts`);
    expect(s.json.publications.count).toBe(list.json.items.length);
    expect(list.json.items).toHaveLength(1);
  });
});

describe("aucune requête par publication", () => {
  it("la liste d'un auteur, le journal et les mentions font autant de requêtes pour 2 publications que pour 14", async () => {
    const w = await world();
    const viewer = await signUp("Lecteur_L");
    const fans: TestUser[] = [];
    const build = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const f = await signUp(`Fan${fans.length}_L`);
        fans.push(f);
        await mkPost({ authorId: f.id, eventId: w.event.id, eventRole: "attendee" });
        await journalPost(w, {}, i % 2 === 0);
      }
    };
    const measure = async () => {
      const spy = vi.spyOn(pool, "query");
      const r = [
        await call(viewer, "GET", `/events/${w.event.id}/feed-posts`),
        await call(viewer, "GET", `/events/${w.event.id}/mentions?section=fans`),
        await call(viewer, "GET", `/authors/s:${w.structure.id}/feed-posts`),
        await call(viewer, "GET", `/authors/s:${w.structure.id}/mentions`),
        await call(null, "GET", `/events/${w.event.id}/feed-posts`),
      ];
      const n = spy.mock.calls.length;
      spy.mockRestore();
      return { n, r };
    };
    await build(2);
    const few = await measure();
    await build(5);
    const many = await measure();
    expect(few.r.map((x) => x.status)).toEqual([200, 200, 200, 200, 200]);
    expect(few.r[0]?.json.items.length).toBeGreaterThanOrEqual(2);
    expect(many.r[0]?.json.items.length).toBeGreaterThan(few.r[0]?.json.items.length);
    expect(many.n).toBe(few.n);
    // `loadPostViews` et `journalPostIds` restent utilisables sans HTTP.
    expect(typeof loadPostViews).toBe("function");
    expect(typeof journalPostIds).toBe("function");
  });
});
