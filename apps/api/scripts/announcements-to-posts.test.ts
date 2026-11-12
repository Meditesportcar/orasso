// Reprise des annonces en publications (vague R8, lot R8d) : chaque branche, deux passages, essai à blanc, épinglée unique,
// photo copiée servie par les deux routes, retrait (`--revert`), aucune notification, façades inchangées, Fil.
import { randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { eq, isNotNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { db, pool } from "../src/db/client";
import {
  applications,
  eventAnnouncements,
  events,
  feedPostPhotos,
  feedPosts,
  notifications,
  profiles,
  structureFollows,
  structureMembers,
} from "../src/db/schema";
import { rateLimit, resetRateLimits } from "../src/lib/rateLimit";
import { storage } from "../src/lib/storage";
import { withTx } from "../src/lib/tx";
import { materializeMentions } from "../src/modules/feed/mentions";
import { softDeletePost } from "../src/modules/feed/posts";
import { removeOrRetry, retryRemove } from "../src/modules/vehicles/photos-blur";
import {
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../test/helpers";
import { announcementsToPosts, nearestAspect, revertAnnouncementsToPosts } from "./announcements-to-posts";

afterAll(async () => {
  await pool.end();
});

const HOUR = 3_600_000;
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;
let owner: TestUser;
let structure: Awaited<ReturnType<typeof createStructure>>;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  ref = await seedReference();
  owner = await signUp("Orga_R8d", { twoFactor: true });
  structure = await createStructure(owner.id);
});

const webp = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 20 } } })
    .webp()
    .toBuffer();

/** Un événement avec affiche (ou, `visual: false`, sans aucun visuel). */
const mkEvent = (over: Partial<typeof events.$inferInsert> = {}, visual = true) =>
  createEvent(structure.id, {
    startsAt: new Date(clock.now.getTime() + 48 * HOUR),
    ...(visual ? { posterKey: "events/poster-r8d.webp" } : {}),
    ...over,
  });

type AnnOver = Partial<typeof eventAnnouncements.$inferInsert>;
/** Une annonce publique, avec ou sans image (le fichier est écrit sous une clé publique `announcements/<événement>/…`). */
async function mkAnnouncement(eventId: string, over: AnnOver & { image?: { w: number; h: number } | null } = {}) {
  const { image, ...rest } = over;
  let imageKey: string | null = null;
  let data: Buffer | null = null;
  if (image) {
    imageKey = `announcements/${eventId}/${randomUUID()}.webp`;
    data = await webp(image.w, image.h);
    await storage.put(imageKey, data);
  }
  const [row] = await db
    .insert(eventAnnouncements)
    .values({
      eventId,
      authorId: owner.id,
      kind: "announcement",
      audience: "public",
      body: "Ouverture des portes à 18 h",
      publishedAt: new Date(clock.now.getTime() - 5 * HOUR),
      imageKey,
      imageWidth: image?.w ?? null,
      imageHeight: image?.h ?? null,
      ...rest,
    })
    .returning();
  return { row: row!, data, imageKey };
}

const bodies = async (u: TestUser | null, slug: string) =>
  ((await call(u, "GET", `/events/by-slug/${slug}/announcements`)).json.items as { body: string }[]).map((i) => i.body);

const postOf = async (announcementId: string) =>
  (await db.select().from(feedPosts).where(eq(feedPosts.legacyAnnouncementId, announcementId)))[0];
const photosOf = (postId: string) => db.select().from(feedPostPhotos).where(eq(feedPostPhotos.postId, postId));
const count = async () => Number((await db.select({ n: sql<number>`count(*)::int` }).from(feedPosts))[0]?.n ?? 0);
const notifCount = async () =>
  Number((await db.select({ n: sql<number>`count(*)::int` }).from(notifications))[0]?.n ?? 0);

describe("les branches de la reprise", () => {
  it("avec image : une publication avec une photo copiée, l'image d'origine reste, les champs sont repris", async () => {
    const e = await mkEvent();
    const body = "x".repeat(2000);
    const at = new Date(clock.now.getTime() - 30 * HOUR);
    const a = await mkAnnouncement(e.id, { image: { w: 1200, h: 630 }, body, notified: true, publishedAt: at });
    const stats = await announcementsToPosts();
    expect(stats).toMatchObject({ read: 1, withImage: 1, withPoster: 0, keptNoVisual: 0, failed: 0 });
    const post = await postOf(a.row.id);
    expect(post).toMatchObject({
      persona: "organizer",
      structureId: structure.id,
      eventId: e.id,
      eventRole: "organizer",
      authorId: owner.id,
      caption: body,
      importantReason: "other",
      aspect: "landscape",
    });
    expect(post?.createdAt.getTime()).toBe(at.getTime());
    expect(post?.importantSentAt?.getTime()).toBe(at.getTime());
    const photos = await photosOf(post!.id);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ position: 0, width: 1200, height: 630, noPlateConfirmed: true });
    expect(photos[0]?.storageKey).toMatch(new RegExp(`^private/feed/${post!.id}/[0-9a-f]{32}\\.webp$`));
    // Le fichier copié est identique ; l'image d'origine existe toujours ; l'annonce n'a pas bougé.
    expect((await storage.get(photos[0]!.storageKey))?.equals(a.data!)).toBe(true);
    expect((await storage.get(a.imageKey!))?.equals(a.data!)).toBe(true);
    const [still] = await db.select().from(eventAnnouncements).where(eq(eventAnnouncements.id, a.row.id));
    expect(still).toMatchObject({ imageKey: a.imageKey, deletedAt: null, body, notified: true });
  });

  it("sans image sur un événement à affiche : une publication sans photo (l'affiche est son visuel)", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id);
    const stats = await announcementsToPosts();
    expect(stats).toMatchObject({ withImage: 0, withPoster: 1, keptNoVisual: 0 });
    const post = await postOf(a.row.id);
    expect(post).toBeTruthy();
    expect(await photosOf(post!.id)).toHaveLength(0);
    expect(post?.importantReason).toBeNull();
    // La publication est servie par le journal, avec l'affiche.
    const journal = await call(owner, "GET", `/events/${e.id}/feed-posts`);
    expect(journal.status).toBe(200);
    expect(journal.json.items.map((p: { id: string }) => p.id)).toEqual([post!.id]);
    expect(journal.json.items[0].visual).toBe("event_poster");
  });

  it("sans image et sans visuel : elle reste une annonce", async () => {
    const e = await mkEvent({}, false);
    const a = await mkAnnouncement(e.id);
    const stats = await announcementsToPosts();
    expect(stats).toMatchObject({ read: 1, keptNoVisual: 1, withImage: 0, withPoster: 0 });
    expect(await postOf(a.row.id)).toBeUndefined();
    expect(await count()).toBe(0);
  });

  it("image disparue du stockage : l'affiche prend le relais, sinon elle reste", async () => {
    const withPoster = await mkEvent();
    const gone = await mkAnnouncement(withPoster.id, { image: { w: 800, h: 1000 } });
    await storage.remove(gone.imageKey!);
    const bare = await mkEvent({}, false);
    const gone2 = await mkAnnouncement(bare.id, { image: { w: 800, h: 1000 } });
    await storage.remove(gone2.imageKey!);
    const stats = await announcementsToPosts();
    expect(stats).toMatchObject({ imageMissing: 2, withPoster: 1, keptNoVisual: 1, withImage: 0 });
    expect(await photosOf((await postOf(gone.row.id))!.id)).toHaveLength(0);
    expect(await postOf(gone2.row.id)).toBeUndefined();
  });

  it("auteur disparu : le propriétaire actif de la structure ; à défaut elle reste une annonce", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { authorId: null });
    expect((await announcementsToPosts()).withPoster).toBe(1);
    expect((await postOf(a.row.id))?.authorId).toBe(owner.id);
    // Sans propriétaire actif : elle reste.
    await db.delete(feedPosts);
    await db.delete(structureMembers).where(eq(structureMembers.structureId, structure.id));
    const stats = await announcementsToPosts();
    expect(stats.keptNoAuthor).toBe(1);
    expect(await count()).toBe(0);
  });

  it("l'auteur d'origine est gardé quand il est en règle ; banni, c'est le propriétaire", async () => {
    const e = await mkEvent();
    const staff = await signUp("Staff_R8d");
    await db
      .insert(structureMembers)
      .values({ structureId: structure.id, userId: staff.id, role: "co_organizer", status: "active" });
    const a = await mkAnnouncement(e.id, { authorId: staff.id });
    const b = await mkAnnouncement(e.id, { authorId: staff.id, publishedAt: new Date(clock.now.getTime() - 4 * HOUR) });
    await db.execute(sql`update profiles set banned_at = now() where user_id = ${staff.id}`);
    await announcementsToPosts();
    expect((await postOf(a.row.id))?.authorId).toBe(owner.id);
    expect((await postOf(b.row.id))?.authorId).toBe(owner.id);
  });

  it("restent des annonces : événement brouillon ou sur invitation, structure non vérifiée ou supprimée, réservées aux inscrits, consignes", async () => {
    const draft = await mkEvent({ status: "draft" });
    const invite = await mkEvent({ admission: "invite_only" });
    const ok = await mkEvent();
    const other = await createStructure((await signUp("Autre_R8d", { twoFactor: true })).id, false);
    const unverified = await createEvent(other.id, { posterKey: "events/p.webp" });
    await mkAnnouncement(draft.id);
    await mkAnnouncement(invite.id);
    await mkAnnouncement(unverified.id);
    await mkAnnouncement(ok.id, { audience: "participants" });
    await mkAnnouncement(ok.id, { kind: "instructions", audience: "participants" });
    await mkAnnouncement(ok.id, { kind: "status_change" });
    await mkAnnouncement(ok.id, { deletedAt: new Date() });
    const stats = await announcementsToPosts();
    expect(stats).toMatchObject({ read: 3, keptNotServed: 3, withImage: 0, withPoster: 0 });
    expect(await count()).toBe(0);
  });
});

describe("rejouable, à blanc, épinglée, retrait", () => {
  it("deux passages : rien de plus (lignes, fichiers, épingle)", async () => {
    const e = await mkEvent();
    await mkAnnouncement(e.id, { image: { w: 1080, h: 1350 }, pinned: true });
    await mkAnnouncement(e.id);
    const first = await announcementsToPosts();
    expect(first).toMatchObject({ withImage: 1, withPoster: 1, pinned: 1 });
    const before = await db.select().from(feedPosts);
    const photosBefore = await db.select().from(feedPostPhotos);
    const second = await announcementsToPosts();
    expect(second).toMatchObject({ alreadyMigrated: 2, withImage: 0, withPoster: 0, pinned: 0, failed: 0 });
    expect(await db.select().from(feedPosts)).toHaveLength(before.length);
    expect((await db.select().from(feedPostPhotos)).map((p) => p.storageKey).sort()).toEqual(
      photosBefore.map((p) => p.storageKey).sort(),
    );
  });

  it("--dry-run : ni ligne ni fichier, les mêmes chiffres que la reprise réelle", async () => {
    const e = await mkEvent();
    const bare = await mkEvent({}, false);
    await mkAnnouncement(e.id, { image: { w: 1080, h: 1350 }, pinned: true });
    await mkAnnouncement(e.id);
    await mkAnnouncement(bare.id);
    const files = async () => (await db.select().from(feedPostPhotos)).length;
    const blank = await announcementsToPosts({ dryRun: true });
    expect(blank.dryRun).toBe(true);
    expect(await count()).toBe(0);
    expect(await files()).toBe(0);
    expect(await storage.get(`private/feed/${randomUUID()}/x.webp`)).toBeNull();
    const real = await announcementsToPosts();
    const { dryRun: _a, ...b } = blank;
    const { dryRun: _b, ...r } = real;
    expect(r).toEqual(b);
    expect(real).toMatchObject({
      read: 3,
      withImage: 1,
      withPoster: 1,
      keptNoVisual: 1,
      postsBefore: 0,
      postsAfter: 2,
    });
  });

  it("une seule épinglée par événement : la plus récente des annonces épinglées ; pas d'épingle si la fiche en a déjà une", async () => {
    const e = await mkEvent();
    const old = await mkAnnouncement(e.id, { pinned: true, publishedAt: new Date(clock.now.getTime() - 20 * HOUR) });
    const recent = await mkAnnouncement(e.id, { pinned: true, publishedAt: new Date(clock.now.getTime() - 2 * HOUR) });
    await mkAnnouncement(e.id, { pinned: false, publishedAt: new Date(clock.now.getTime() - 1 * HOUR) });
    expect((await announcementsToPosts()).pinned).toBe(1);
    expect((await postOf(recent.row.id))?.pinnedAt).not.toBeNull();
    expect((await postOf(old.row.id))?.pinnedAt).toBeNull();
    const pinned = await db.select().from(feedPosts).where(isNotNull(feedPosts.pinnedAt));
    expect(pinned).toHaveLength(1);
    // Une fiche qui a déjà sa publication épinglée la garde.
    const e2 = await mkEvent();
    const [mine] = await db
      .insert(feedPosts)
      .values({
        authorId: owner.id,
        persona: "organizer",
        structureId: structure.id,
        eventId: e2.id,
        eventRole: "organizer",
        caption: "À moi",
        pinnedAt: new Date(),
      })
      .returning();
    const a2 = await mkAnnouncement(e2.id, { pinned: true });
    await announcementsToPosts();
    expect((await postOf(a2.row.id))?.pinnedAt).toBeNull();
    expect((await db.select().from(feedPosts).where(eq(feedPosts.id, mine!.id)))[0]?.pinnedAt).not.toBeNull();
  });

  it("la photo copiée est servie par la route des photos (avec session) et par la route publique (sans session)", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { image: { w: 1080, h: 1350 } });
    await announcementsToPosts();
    const post = (await postOf(a.row.id))!;
    const photo = (await photosOf(post.id))[0]!;
    const name = photo.storageKey.slice(photo.storageKey.lastIndexOf("/") + 1);
    const viewer = await signUp("Voit_R8d");
    const priv = await app.request(`/api/feed-posts/${post.id}/photos/${name}`, {
      headers: { cookie: viewer.cookie, origin: "http://localhost" },
    });
    expect(priv.status).toBe(200);
    expect(Buffer.from(await priv.arrayBuffer()).equals(a.data!)).toBe(true);
    const pub = await app.request(`/api/public/feed-posts/${post.id}/photos/${name}`);
    expect(pub.status).toBe(200);
    expect(Buffer.from(await pub.arrayBuffer()).equals(a.data!)).toBe(true);
    // Sans session, le journal sert la publication reprise (T4) ; l'ancienne clé publique de l'image n'a pas changé.
    const journal = await call(null, "GET", `/events/${e.id}/feed-posts`);
    expect(journal.status).toBe(200);
    expect(journal.json.items.map((p: { id: string }) => p.id)).toEqual([post.id]);
    expect(JSON.stringify(journal.json)).not.toContain(owner.id);
    expect((await app.request(`/api/files/${a.imageKey}`)).status).toBe(200);
  });

  it("--revert : l'état d'avant (lignes et fichiers), les annonces et leurs images intactes ; on peut reprendre ensuite", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { image: { w: 1080, h: 1350 } });
    await mkAnnouncement(e.id);
    await announcementsToPosts();
    const key = (await photosOf((await postOf(a.row.id))!.id))[0]!.storageKey;
    expect(await storage.get(key)).not.toBeNull();
    const blank = await revertAnnouncementsToPosts({ dryRun: true });
    expect(blank).toMatchObject({ posts: 2, files: 1, postsBefore: 2, postsAfter: 0 });
    expect(await count()).toBe(2);
    const done = await revertAnnouncementsToPosts();
    expect(done).toMatchObject({ posts: 2, files: 1, postsBefore: 2, postsAfter: 0 });
    expect(await count()).toBe(0);
    expect(await db.select().from(feedPostPhotos)).toHaveLength(0);
    expect(await storage.get(key)).toBeNull();
    expect((await storage.get(a.imageKey!))?.equals(a.data!)).toBe(true);
    expect(await db.select().from(eventAnnouncements)).toHaveLength(2);
    expect(await announcementsToPosts()).toMatchObject({ withImage: 1, withPoster: 1 });
  });

  it("aucune notification n'est envoyée", async () => {
    const e = await mkEvent();
    await mkAnnouncement(e.id, { notified: true, image: { w: 1080, h: 1350 } });
    await db
      .insert(structureFollows)
      .values({ structureId: structure.id, userId: (await signUp("Abonne_R8d")).id, source: "manual" });
    const before = await notifCount();
    await announcementsToPosts();
    await announcementsToPosts();
    expect(await notifCount()).toBe(before);
  });
});

describe("façades et Fil", () => {
  it("les routes d'annonces rendent la forme d'avant, plus migratedPostId sur une annonce reprise", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { image: { w: 1080, h: 1350 }, pinned: true });
    const kept = await mkAnnouncement((await mkEvent({}, false)).id);
    await mkAnnouncement(e.id, { audience: "participants", body: "Réservée aux inscrits" });
    const slug = e.slug;
    const before = {
      visitor: (await call(null, "GET", `/events/by-slug/${slug}/announcements`)).json,
      orga: (await call(owner, "GET", `/events/${e.id}/announcements`)).json,
      other: (await call(owner, "GET", `/events/${kept.row.eventId}/announcements`)).json,
    };
    await announcementsToPosts();
    const after = {
      visitor: (await call(null, "GET", `/events/by-slug/${slug}/announcements`)).json,
      orga: (await call(owner, "GET", `/events/${e.id}/announcements`)).json,
      other: (await call(owner, "GET", `/events/${kept.row.eventId}/announcements`)).json,
    };
    const post = (await postOf(a.row.id))!;
    for (const k of ["visitor", "orga", "other"] as const) {
      expect(after[k].items).toHaveLength(before[k].items.length);
      after[k].items.forEach((item: Record<string, unknown>, i: number) => {
        const { migratedPostId, ...rest } = item;
        // Champ à champ : rien d'autre n'a changé, dans le même ordre.
        expect(rest).toEqual(before[k].items[i]);
        if (item.id === a.row.id) expect(migratedPostId).toBe(post.id);
        else expect(migratedPostId).toBeUndefined();
      });
    }
    // Une annonce non reprise ne porte pas le champ ; une annonce réservée aux inscrits reste invisible d'un visiteur.
    expect(JSON.stringify(after.visitor)).not.toContain("Réservée aux inscrits");
    expect(after.other.items[0]).not.toHaveProperty("migratedPostId");
    expect(after.visitor.items.some((i: { id: string }) => i.id === a.row.id)).toBe(true);
  });

  it("une annonce créée par l'ancienne route après la reprise reste lisible, puis est reprise au passage suivant", async () => {
    const e = await mkEvent();
    await mkAnnouncement(e.id);
    await announcementsToPosts();
    const res = await call(owner, "POST", `/events/${e.id}/announcements`, {
      body: "Nouvelle annonce de l'ancien APK",
      audience: "public",
      pinned: false,
      notify: false,
    });
    expect(res.status).toBe(201);
    expect(res.json.migratedPostId).toBeUndefined();
    const list = await call(null, "GET", `/events/by-slug/${e.slug}/announcements`);
    expect(list.json.items.map((i: { body: string }) => i.body)).toContain("Nouvelle annonce de l'ancien APK");
    expect(await announcementsToPosts()).toMatchObject({ read: 2, alreadyMigrated: 1, withPoster: 1 });
    const again = await call(null, "GET", `/events/by-slug/${e.slug}/announcements`);
    expect(again.json.items.filter((i: { migratedPostId?: string }) => i.migratedPostId)).toHaveLength(2);
  });

  it("l'ancien APK retire une annonce reprise : la publication reprise l'est aussi, photo comprise", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { image: { w: 1080, h: 1350 } });
    await announcementsToPosts();
    const post = (await postOf(a.row.id))!;
    const key = (await photosOf(post.id))[0]!.storageKey;
    expect((await call(owner, "DELETE", `/events/${e.id}/announcements/${a.row.id}`)).status).toBe(204);
    const [gone] = await db.select().from(feedPosts).where(eq(feedPosts.id, post.id));
    expect(gone?.deletedAt).not.toBeNull();
    expect(await storage.get(key)).toBeNull();
    // Elle ne revient pas : l'annonce est retirée, la reprise est déjà faite.
    expect(await announcementsToPosts()).toMatchObject({ read: 0 });
  });

  it("le Fil ne sert plus de carte `announcement` et sert la publication reprise à qui suit la structure", async () => {
    const e = await mkEvent({ department: "66" });
    const a = await mkAnnouncement(e.id, { body: "Texte repris en publication" });
    const viewer = await signUp("Suiveur_R8d");
    await db
      .update(profiles)
      .set({ departments: ["66"] })
      .where(eq(profiles.userId, viewer.id));
    await db.insert(structureFollows).values({ structureId: structure.id, userId: viewer.id, source: "manual" });
    const noPost = await call(viewer, "GET", "/fil");
    expect(noPost.status).toBe(200);
    expect(noPost.json.items.some((c: { kind: string }) => c.kind === "announcement")).toBe(false);
    expect(JSON.stringify(noPost.json)).not.toContain("Texte repris en publication");
    await announcementsToPosts();
    const post = (await postOf(a.row.id))!;
    const res = await call(viewer, "GET", "/fil");
    expect(res.json.items.some((c: { kind: string }) => c.kind === "announcement")).toBe(false);
    const ids = res.json.items.map((c: { id: string }) => c.id);
    expect(ids).toContain(`feed_post:${post.id}`);
  });
});

describe("tour 2 : retrait, épingle, reprise non servie, retrait de la reprise", () => {
  it("une reprise retirée (par l'auteur ou par la modération) emporte l'annonce : plus servie, ni sans session ni à un inscrit, image effacée", async () => {
    const ref2 = ref;
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { image: { w: 1080, h: 1350 }, body: "Annonce à retirer A" });
    const b = await mkAnnouncement(e.id, { body: "Annonce à retirer B" });
    const inscrit = await signUp("Retenu2_R8d");
    const car = await createVehicle(inscrit.id, ref2);
    await db.insert(applications).values({
      eventId: e.id,
      userId: inscrit.id,
      vehicleId: car.id,
      status: "accepted",
      rulesAcceptedAt: new Date(),
      followStructure: false,
      decidedAt: new Date(),
    });
    await announcementsToPosts();
    const pa = (await postOf(a.row.id))!;
    const pb = (await postOf(b.row.id))!;
    expect((await call(owner, "DELETE", `/me/feed-posts/${pa.id}`)).status).toBe(204);
    // Modération : le même retrait que la décision d'un signalement.
    const keys = await db.transaction((tx) => softDeletePost(tx, pb.id, owner.id, new Date()));
    expect(Array.isArray(keys)).toBe(true);
    for (const u of [null, inscrit, owner]) {
      const list = await bodies(u, e.slug);
      expect(list).not.toContain("Annonce à retirer A");
      expect(list).not.toContain("Annonce à retirer B");
    }
    const [ann] = await db.select().from(eventAnnouncements).where(eq(eventAnnouncements.id, a.row.id));
    expect(ann).toMatchObject({ imageKey: null });
    expect(ann?.deletedAt).not.toBeNull();
    expect(await storage.get(a.imageKey!)).toBeNull();
  });

  it("garde-fou : une annonce dont la reprise est retirée n'est plus servie même si l'annonce n'a pas été marquée", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { body: "Garde-fou" });
    await announcementsToPosts();
    await db.update(feedPosts).set({ deletedAt: new Date() }).where(eq(feedPosts.legacyAnnouncementId, a.row.id));
    expect(await bodies(null, e.slug)).not.toContain("Garde-fou");
  });

  it("l'ancien APK épingle une annonce reprise : la publication est épinglée aussi, et désépinglée", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { body: "À épingler" });
    await announcementsToPosts();
    expect((await call(owner, "PATCH", `/events/${e.id}/announcements/${a.row.id}`, { pinned: true })).status).toBe(
      200,
    );
    expect((await postOf(a.row.id))?.pinnedAt).not.toBeNull();
    expect((await call(owner, "PATCH", `/events/${e.id}/announcements/${a.row.id}`, { pinned: false })).status).toBe(
      200,
    );
    expect((await postOf(a.row.id))?.pinnedAt).toBeNull();
  });

  it("une reprise qui n'est plus servie (affiche retirée) : l'annonce reste affichée (pas de migratedPostId)", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { body: "Sans affiche bientôt" });
    await announcementsToPosts();
    let item = (await call(null, "GET", `/events/by-slug/${e.slug}/announcements`)).json.items.find(
      (i: { id: string }) => i.id === a.row.id,
    );
    expect(item.migratedPostId).toBeTruthy();
    await db
      .update(events)
      .set({ posterKey: null, posterPostKey: null, posterPhotoKey: null })
      .where(eq(events.id, e.id));
    item = (await call(null, "GET", `/events/by-slug/${e.slug}/announcements`)).json.items.find(
      (i: { id: string }) => i.id === a.row.id,
    );
    expect(item).toBeTruthy();
    expect(item.migratedPostId).toBeUndefined();
  });

  it("reprise pendant un épinglage en direct : pas d'échec, une seule épinglée", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { pinned: true, body: "Épinglée par la reprise" });
    const [live] = await db
      .insert(feedPosts)
      .values({
        authorId: owner.id,
        persona: "organizer",
        structureId: structure.id,
        eventId: e.id,
        eventRole: "organizer",
        caption: "En direct",
        pinnedAt: new Date(),
      })
      .returning();
    const stats = await announcementsToPosts();
    expect(stats.failed).toBe(0);
    expect((await postOf(a.row.id))?.pinnedAt).toBeNull();
    expect((await db.select().from(feedPosts).where(eq(feedPosts.id, live!.id)))[0]?.pinnedAt).not.toBeNull();
  });

  it("--revert retire aussi signalements et notifications qui pointent vers les publications reprises", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { body: "À signaler" });
    await announcementsToPosts();
    const post = (await postOf(a.row.id))!;
    const reporter = await signUp("Signale_R8d");
    await db.execute(
      sql`insert into reports (reporter_id, target_type, target_id, reason) values (${reporter.id}, 'feed_post', ${post.id}, 'other')`,
    );
    await db.insert(notifications).values({
      userId: reporter.id,
      type: "feed_post_mention",
      family: "social",
      deliverAfter: new Date(),
      title: "x",
      body: "y",
      data: { postId: post.id },
    } as never);
    await revertAnnouncementsToPosts();
    const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from reports where target_id = ${post.id}`);
    expect(Number(r.rows[0]?.n)).toBe(1);
    const n = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from notifications where data ->> 'postId' = ${post.id}`,
    );
    expect(Number(n.rows[0]?.n)).toBe(0);
  });
});

describe("tour 3 : reprise et retrait sous contrainte", () => {
  it("l'effacement d'une image d'annonce retirée est repris par la tâche (motif strict)", async () => {
    const key = `announcements/${randomUUID()}/${randomUUID()}.webp`;
    await storage.put(key, await webp(10, 10));
    await retryRemove(key);
    expect(await storage.get(key)).toBeNull();
    const other = "announcements/x/y.webp";
    await storage.put(other, await webp(10, 10));
    await retryRemove(other);
    expect(await storage.get(other)).not.toBeNull();
    await storage.remove(other);
    const k2 = `announcements/${randomUUID()}/${randomUUID()}.webp`;
    await storage.put(k2, await webp(10, 10));
    const spy = vi.spyOn(storage, "remove").mockRejectedValueOnce(new Error("refusé"));
    await removeOrRetry(k2);
    spy.mockRestore();
    expect(await storage.get(k2)).not.toBeNull();
    await retryRemove(k2);
    expect(await storage.get(k2)).toBeNull();
  });

  it("une annonce supprimée pendant la reprise n'est pas republiée (fichier copié effacé)", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { image: { w: 1080, h: 1350 }, body: "Supprimée en route" });
    const realCopy = storage.copy.bind(storage);
    const spy = vi.spyOn(storage, "copy").mockImplementation(async (from: string, to: string) => {
      await realCopy(from, to);
      await db.update(eventAnnouncements).set({ deletedAt: new Date() }).where(eq(eventAnnouncements.id, a.row.id));
    });
    const stats = await announcementsToPosts();
    spy.mockRestore();
    expect(stats).toMatchObject({ deletedDuring: 1, withImage: 0, failed: 0 });
    expect(await postOf(a.row.id)).toBeUndefined();
    expect(await db.select().from(feedPostPhotos)).toHaveLength(0);
  });

  it("--revert : un signalement n'est jamais supprimé ; la reprise visée est retirée en douceur, détachée, l'annonce est de nouveau servie", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { body: "Annonce signalée" });
    const b = await mkAnnouncement(e.id, { body: "Annonce sans signalement" });
    await announcementsToPosts();
    const post = (await postOf(a.row.id))!;
    const reporter = await signUp("Signale3_R8d");
    await db.execute(
      sql`insert into reports (reporter_id, target_type, target_id, reason, screenshot_key) values (${reporter.id}, 'feed_post', ${post.id}, 'other', 'reports/capture-r8d.webp')`,
    );
    const stats = await revertAnnouncementsToPosts();
    expect(stats).toMatchObject({ posts: 2, detached: 1 });
    const reports = await db.execute<{ n: number; k: string | null }>(
      sql`select count(*)::int as n, max(screenshot_key) as k from reports where target_id = ${post.id}`,
    );
    expect(Number(reports.rows[0]?.n)).toBe(1);
    expect(reports.rows[0]?.k).toBe("reports/capture-r8d.webp");
    const [kept] = await db.select().from(feedPosts).where(eq(feedPosts.id, post.id));
    expect(kept?.deletedAt).not.toBeNull();
    expect(kept?.legacyAnnouncementId).toBeNull();
    expect(await postOf(b.row.id)).toBeUndefined();
    const list = await bodies(null, e.slug);
    expect(list).toContain("Annonce signalée");
    expect(list).toContain("Annonce sans signalement");
  });

  it("--revert est atomique : un échec en cours de route annule tout", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { body: "Atomique" });
    await announcementsToPosts();
    const post = (await postOf(a.row.id))!;
    const user = await signUp("Notifie3_R8d");
    await db.insert(notifications).values({
      userId: user.id,
      type: "feed_post_mention",
      family: "social",
      title: "x",
      body: "y",
      deliverAfter: new Date(),
      data: { postId: post.id },
    } as never);
    await db.execute(
      sql`create or replace function r8d_boom() returns trigger language plpgsql as 'begin raise exception ''boom''; end'`,
    );
    await db.execute(sql`create trigger r8d_boom before delete on feed_posts for each row execute function r8d_boom()`);
    try {
      await expect(revertAnnouncementsToPosts()).rejects.toThrow();
    } finally {
      await db.execute(sql`drop trigger r8d_boom on feed_posts`);
    }
    expect(await postOf(a.row.id)).toBeTruthy();
    const n = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from notifications where data ->> 'postId' = ${post.id}`,
    );
    expect(Number(n.rows[0]?.n)).toBe(1);
  });

  it("deux retraits simultanés (reprise dans l'appli, annonce par l'ancien APK) : aucun 500", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { body: "Course" });
    await announcementsToPosts();
    const post = (await postOf(a.row.id))!;
    const [r1, r2] = await Promise.all([
      call(owner, "DELETE", `/me/feed-posts/${post.id}`),
      call(owner, "DELETE", `/events/${e.id}/announcements/${a.row.id}`),
    ]);
    expect(r1.status).toBeLessThan(500);
    expect(r2.status).toBeLessThan(500);
    expect(await bodies(null, e.slug)).not.toContain("Course");
  });

  it("deux épingles opposées simultanées par l'ancien APK : l'annonce et la publication disent la même chose", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { body: "Épingle en course" });
    await announcementsToPosts();
    await Promise.all([
      call(owner, "PATCH", `/events/${e.id}/announcements/${a.row.id}`, { pinned: true }),
      call(owner, "PATCH", `/events/${e.id}/announcements/${a.row.id}`, { pinned: false }),
    ]);
    const [ann] = await db.select().from(eventAnnouncements).where(eq(eventAnnouncements.id, a.row.id));
    expect(Boolean((await postOf(a.row.id))?.pinnedAt)).toBe(ann?.pinned);
  });

  it("fiche : le responsable lit le nombre de mentions masquées, un passionné jamais", async () => {
    const e = await mkEvent();
    const fan = await signUp("Fan3_R8d");
    const [post] = await db
      .insert(feedPosts)
      .values({ authorId: fan.id, caption: "J'y serai", department: "66", eventId: e.id, eventRole: "attendee" })
      .returning();
    await db.insert(feedPostPhotos).values({
      postId: post!.id,
      storageKey: `private/feed/${post!.id}/${"a".repeat(32)}.webp`,
      width: 1080,
      height: 1350,
      position: 0,
      noPlateConfirmed: true,
    });
    await withTx((tx) => materializeMentions(tx, post!.id));
    const before = await call(owner, "GET", `/events/by-slug/${e.slug}`);
    expect(before.json.mentions.count).toBe(1);
    expect(before.json.hiddenMentions.count).toBe(0);
    expect((await call(owner, "PUT", `/mentions/e:${e.id}/${post!.id}/hidden`)).status).toBe(200);
    const after = await call(owner, "GET", `/events/by-slug/${e.slug}`);
    expect(after.json.mentions.count).toBe(0);
    expect(after.json.hiddenMentions.count).toBe(1);
    expect((await call(fan, "GET", `/events/by-slug/${e.slug}`)).json.hiddenMentions).toBeUndefined();
    expect((await call(null, "GET", `/events/by-slug/${e.slug}`)).json.hiddenMentions).toBeUndefined();
  });
});

describe("tour 4 : verrous de la reprise, du retrait et du retour arrière", () => {
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("un retrait de l'annonce pendant que la reprise valide : la publication reprise est retirée aussi", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { body: "Course reprise et retrait" });
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    // Le script : annonce verrouillée, publication créée, validation retenue.
    const script = db.transaction(async (tx) => {
      await tx.execute(sql`select 1 from event_announcements where id = ${a.row.id} for update`);
      await tx.insert(feedPosts).values({
        authorId: owner.id,
        persona: "organizer",
        structureId: structure.id,
        eventId: e.id,
        eventRole: "organizer",
        caption: "Reprise en cours",
        legacyAnnouncementId: a.row.id,
      });
      await gate;
    });
    await pause(300);
    const removal = call(owner, "DELETE", `/events/${e.id}/announcements/${a.row.id}`);
    await pause(600);
    release();
    await script;
    expect((await removal).status).toBe(204);
    const post = await postOf(a.row.id);
    expect(post?.deletedAt).not.toBeNull();
    expect(await bodies(null, e.slug)).not.toContain("Course reprise et retrait");
  });

  it("--revert : un signalement validé pendant l'attente du verrou protège la publication et ses photos", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { image: { w: 1080, h: 1350 }, body: "Signalée en cours de retour arrière" });
    await announcementsToPosts();
    const post = (await postOf(a.row.id))!;
    const photoKey = (await photosOf(post.id))[0]!.storageKey;
    const reporter = await signUp("Signale4_R8d");
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select 1 from feed_posts where id = ${post.id} for update`);
      await gate;
      await tx.execute(
        sql`insert into reports (reporter_id, target_type, target_id, reason) values (${reporter.id}, 'feed_post', ${post.id}, 'other')`,
      );
    });
    await pause(300);
    const reverting = revertAnnouncementsToPosts();
    await pause(600);
    release();
    await holder;
    const stats = await reverting;
    expect(stats.detached).toBe(1);
    const reports = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from reports where target_id = ${post.id}`,
    );
    expect(Number(reports.rows[0]?.n)).toBe(1);
    const [kept] = await db.select().from(feedPosts).where(eq(feedPosts.id, post.id));
    expect(kept?.caption).toBe("Signalée en cours de retour arrière");
    expect(await photosOf(post.id)).toHaveLength(1);
    expect(await storage.get(photoKey)).not.toBeNull();
  });
});

describe("tour 6 : la limite d'écriture est comptée une fois malgré un rejeu", () => {
  it("59 écritures comptées, un 40P01 simulé : l'épingle passe (la 60e)", async () => {
    const e = await mkEvent();
    const a = await mkAnnouncement(e.id, { body: "Limite" });
    await announcementsToPosts();
    for (let i = 0; i < 58; i++) rateLimit("feedWrite", owner.id);
    const real = db.transaction.bind(db);
    let failed = false;
    const spy = vi.spyOn(db, "transaction").mockImplementation(((fn: never, cfg: never) => {
      if (!failed) {
        failed = true;
        return Promise.reject(Object.assign(new Error("deadlock"), { code: "40P01" }));
      }
      return real(fn, cfg);
    }) as never);
    const res = await call(owner, "PATCH", `/events/${e.id}/announcements/${a.row.id}`, { pinned: true });
    spy.mockRestore();
    expect(failed).toBe(true);
    expect(res.status).toBe(200);
  });
});

describe("annonces réservées aux inscrits (T3)", () => {
  it("restent lisibles d'un inscrit retenu et de l'équipe, invisibles d'un visiteur et d'un passionné sans candidature, avant comme après la reprise", async () => {
    const e = await mkEvent();
    await mkAnnouncement(e.id, { audience: "participants", body: "Réservée aux retenus" });
    await mkAnnouncement(e.id, { body: "Annonce publique" });
    const inscrit = await signUp("Retenu_R8d");
    const autre = await signUp("Sans_R8d");
    const car = await createVehicle(inscrit.id, ref);
    await db.insert(applications).values({
      eventId: e.id,
      userId: inscrit.id,
      vehicleId: car.id,
      status: "accepted",
      rulesAcceptedAt: new Date(),
      followStructure: false,
      decidedAt: new Date(),
    });
    const bodies = async (u: TestUser | null) =>
      ((await call(u, "GET", `/events/by-slug/${e.slug}/announcements`)).json.items as { body: string }[]).map(
        (i) => i.body,
      );
    for (const phase of ["avant", "après"]) {
      expect(await bodies(inscrit), phase).toContain("Réservée aux retenus");
      expect(await bodies(owner), phase).toContain("Réservée aux retenus");
      expect(await bodies(null), phase).not.toContain("Réservée aux retenus");
      expect(await bodies(autre), phase).not.toContain("Réservée aux retenus");
      expect(await bodies(inscrit), phase).toContain("Annonce publique");
      if (phase === "avant") await announcementsToPosts();
    }
    // Seule l'annonce publique a été reprise.
    expect(await count()).toBe(1);
  });
});

describe("le format le plus proche", () => {
  it("choisit entre 4:5, 1:1 et paysage", () => {
    expect(nearestAspect(1080, 1350)).toBe("portrait_4_5");
    expect(nearestAspect(1000, 1000)).toBe("square");
    expect(nearestAspect(1200, 630)).toBe("landscape");
    expect(nearestAspect(800, 1500)).toBe("portrait_4_5");
    expect(nearestAspect(1100, 1000)).toBe("square");
  });
});
