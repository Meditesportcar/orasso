// Reprise des annonces en publications (vague R8, lot R8d) : chaque branche, deux passages, essai à blanc, épinglée unique,
// photo copiée servie par les deux routes, retrait (`--revert`), aucune notification, façades inchangées, Fil.
import { randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { eq, isNotNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { db, pool } from "../src/db/client";
import {
  applications,
  eventAnnouncements,
  type events,
  feedPostPhotos,
  feedPosts,
  notifications,
  profiles,
  structureFollows,
  structureMembers,
} from "../src/db/schema";
import { resetRateLimits } from "../src/lib/rateLimit";
import { storage } from "../src/lib/storage";
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
let owner: TestUser;
let structure: Awaited<ReturnType<typeof createStructure>>;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  await seedReference();
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

describe("annonces réservées aux inscrits (T3)", () => {
  it("restent lisibles d'un inscrit retenu et de l'équipe, invisibles d'un visiteur et d'un passionné sans candidature, avant comme après la reprise", async () => {
    const ref = await seedReference();
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
