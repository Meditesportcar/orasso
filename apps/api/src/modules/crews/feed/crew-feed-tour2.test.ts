// Fil d'un crew, tour 2 des relectures (lot R5c1) : événement privé jamais révélé, crew dissous (404 pour tous, fil
// purgé par le chef, gardé pour la modération), notifications revérifiées à la livraison, contenus d'un ancien membre,
// photos pour la modération, chef et auteur suspendu, création idempotente, regroupement des notifications,
// commentaires au-delà de 50, plateau et affiche (D36).
import { fromWallTime, HOUR } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../../test/helpers";
import { app } from "../../../app";
import { db, pool } from "../../../db/client";
import { applications, crewPostPhotos, crewPosts, crews, notifications, profiles } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import { withTx } from "../../../lib/tx";
import { notificationsService } from "../../notifications/service";
import { crewsService } from "../service";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const paris = (month: number, day: number, hour: number) => fromWallTime({ year: 2026, month, day, hour, minute: 0 });

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 1, 10));
  ref = await seedReference();
});

async function req(u: TestUser | null, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(u ? { cookie: u.cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function upload(u: TestUser, width = 800, height = 600) {
  const data = await sharp({ create: { width, height, channels: 3, background: { r: 90, g: 40, b: 20 } } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("purpose", "crew_post");
  form.append("file", new File([new Uint8Array(data)], "photo.jpg", { type: "image/jpeg" }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  return ((await res.json()) as { key: string }).key;
}

let counter = 0;
async function crewOf3() {
  const kenji = await signUp("Kenji");
  const nina = await signUp("Nina");
  const lea = await signUp("Lea");
  const res = await req(kenji, "POST", "/crews", { name: `Crew deux ${++counter}`, department: "66" });
  expect(res.status).toBe(201);
  const crew = res.json as { id: string; slug: string; name: string };
  for (const m of [nina, lea]) {
    expect((await req(m, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
    expect((await req(kenji, "POST", `/crews/${crew.id}/requests/${m.id}/accept`)).status).toBe(204);
  }
  return { kenji, nina, lea, crew };
}

async function photoPost(u: TestUser, crewId: string, n = 2) {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) keys.push(await upload(u, 800 + i, 600));
  const res = await req(u, "POST", `/crews/${crewId}/posts`, { kind: "photo", text: "Belle sortie", photoKeys: keys });
  expect(res.status).toBe(201);
  return res.json as { id: string; photos: { url: string }[] };
}

const path = (url: string) => url.replace(/^\/api/, "");

describe("événement privé (sur invitation)", () => {
  it("jamais révélé à un membre qui ne peut pas le voir : publication, crew retenu, composeur", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const orga = await signUp("Orga");
    const structure = await createStructure(orga.id);
    const event = await createEvent(structure.id, {
      title: "Soirée secrète",
      admission: "invite_only",
      startsAt: new Date(clock.now.getTime() + 5 * 24 * HOUR),
    });
    const vehicle = await createVehicle(nina.id, ref);
    await db.insert(applications).values({
      eventId: event.id,
      userId: nina.id,
      vehicleId: vehicle.id,
      status: "accepted",
      rulesAcceptedAt: clock.now,
      followStructure: false,
      crewId: crew.id,
      decidedAt: clock.now,
    });
    // Nina y va : elle peut la citer, et la voit.
    const post = await req(nina, "POST", `/crews/${crew.id}/posts`, {
      kind: "text",
      text: "J'y serai",
      eventId: event.id,
    });
    expect(post.status).toBe(201);
    expect(post.json.event).toMatchObject({ id: event.id, title: "Soirée secrète" });
    const ninaFeed = await req(nina, "GET", `/crews/${crew.id}/feed`);
    expect(ninaFeed.json.items.some((i: { type: string }) => i.type === "crew_accepted")).toBe(true);
    expect(
      (await req(nina, "GET", `/crews/${crew.id}/post-options`)).json.events.map((e: { id: string }) => e.id),
    ).toEqual([event.id]);
    // Kenji et Léa (non invités) : ni titre, ni date, ni crew retenu, ni proposition au composeur.
    for (const u of [kenji, lea]) {
      const feed = await req(u, "GET", `/crews/${crew.id}/feed`);
      expect(feed.text).not.toContain("Soirée secrète");
      expect(feed.text).not.toContain(event.slug);
      const item = feed.json.items.find((i: { type: string; post?: { id: string } }) => i.post?.id === post.json.id);
      expect(item.post.event).toBeNull();
      expect(feed.json.items.some((i: { type: string }) => i.type === "crew_accepted")).toBe(false);
      const opts = await req(u, "GET", `/crews/${crew.id}/post-options`);
      expect(opts.text).not.toContain("Soirée secrète");
    }
    // Léa ne peut pas la citer (même réponse qu'un événement inconnu).
    const refused = await req(lea, "POST", `/crews/${crew.id}/posts`, {
      kind: "text",
      text: "Moi aussi",
      eventId: event.id,
    });
    expect(refused.status).toBe(400);
    expect(refused.json.error.message).toBe("Événement introuvable.");
  });
});

describe("crew dissous", () => {
  it("par le chef : 404 pour tous sur chaque route, publications et fichiers photo supprimés", async () => {
    const { kenji, nina, crew } = await crewOf3();
    const post = await photoPost(nina, crew.id);
    const poll = await req(kenji, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { question: "Où ?", options: ["Ici", "Là"] },
    });
    const comment = await req(kenji, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Top" });
    const keys = (await db.select().from(crewPostPhotos)).map((p) => p.storageKey);
    expect(keys).toHaveLength(2);
    expect((await req(kenji, "DELETE", `/crews/${crew.id}`)).status).toBe(204);
    for (const u of [kenji, nina]) {
      expect((await req(u, "GET", `/crews/${crew.id}/feed`)).status).toBe(404);
      expect((await req(u, "GET", `/crews/${crew.id}/post-options`)).status).toBe(404);
      expect((await req(u, "GET", `/crews/${crew.id}/posts/${post.id}/comments`)).status).toBe(404);
      expect((await req(u, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Encore" })).status).toBe(404);
      expect((await req(u, "PUT", `/crews/${crew.id}/posts/${post.id}/reaction`)).status).toBe(404);
      expect((await req(u, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "x" })).status).toBe(404);
      expect((await req(u, "DELETE", `/crews/${crew.id}/comments/${comment.json.id}`)).status).toBe(404);
      expect(
        (
          await req(u, "PUT", `/crews/${crew.id}/posts/${poll.json.id}/vote`, {
            optionId: poll.json.poll.options[0].id,
          })
        ).status,
      ).toBe(404);
      expect((await req(u, "POST", `/crews/${crew.id}/posts/${poll.json.id}/close`)).status).toBe(404);
      expect((await req(u, "DELETE", `/crews/${crew.id}/posts/${post.id}`)).status).toBe(404);
      expect((await req(u, "GET", path(post.photos[0]!.url))).status).toBe(404);
    }
    expect(await db.select().from(crewPosts).where(eq(crewPosts.crewId, crew.id))).toHaveLength(0);
    for (const k of keys) expect(await storage.get(k)).toBeNull();
  });

  it("par la modération : 404 pour tous, contenu gardé pour la modération", async () => {
    const { nina, crew } = await crewOf3();
    const post = await photoPost(nina, crew.id, 1);
    await withTx(async (tx, after) => {
      const [row] = await tx.select().from(crews).where(eq(crews.id, crew.id)).for("update");
      await crewsService.archiveInTx(tx, after, row!, "moderation");
    });
    expect((await req(nina, "GET", `/crews/${crew.id}/feed`)).status).toBe(404);
    expect((await req(nina, "GET", path(post.photos[0]!.url))).status).toBe(404);
    const kept = await db.select().from(crewPostPhotos);
    expect(kept).toHaveLength(1);
    expect(await storage.get(kept[0]!.storageKey)).not.toBeNull();
    expect(await db.select().from(crewPosts).where(eq(crewPosts.id, post.id))).toHaveLength(1);
  });
});

describe("notifications revérifiées à la livraison", () => {
  /** Simule une notification différée par les heures calmes. */
  async function defer(type: string) {
    await notificationsService.flush();
    await db
      .update(notifications)
      .set({ deliveredAt: null, deliverAfter: new Date(clock.now.getTime() + HOUR) })
      .where(eq(notifications.type, type));
  }

  it("commentaire : rien pour un auteur parti ; différée puis départ : supprimée sans être envoyée", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const post = await photoPost(nina, crew.id, 1);
    await req(lea, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Belle !" });
    await defer("crew_post_comment");
    expect((await req(nina, "DELETE", `/crews/${crew.id}/members/${nina.id}`)).status).toBe(204);
    clock.advance(2 * HOUR);
    await notificationsService.deliverDue();
    expect(await db.select().from(notifications).where(eq(notifications.type, "crew_post_comment"))).toHaveLength(0);
    // Partie : un nouveau commentaire ne la notifie plus.
    await req(kenji, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Encore là ?" });
    await notificationsService.flush();
    expect(await db.select().from(notifications).where(eq(notifications.type, "crew_post_comment"))).toHaveLength(0);
  });

  it("sondage : le membre retiré avant la livraison ne reçoit rien, les autres oui", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    await req(kenji, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { question: "Quand ?", options: ["Sam", "Dim"] },
    });
    await defer("crew_poll_new");
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/members/${lea.id}`)).status).toBe(204);
    clock.advance(2 * HOUR);
    await notificationsService.deliverDue();
    const rows = await db.select().from(notifications).where(eq(notifications.type, "crew_poll_new"));
    expect(rows.map((r) => r.userId)).toEqual([nina.id]);
    expect(rows[0]!.deliveredAt).not.toBeNull();
  });

  it("regroupement : personnes distinctes, singulier quand une seule personne commente plusieurs fois", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const post = await photoPost(nina, crew.id, 1);
    await req(kenji, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Un" });
    await req(kenji, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Deux" });
    let [n] = await db.select().from(notifications).where(eq(notifications.type, "crew_post_comment"));
    expect(n!.body).toBe(`${kenji.pseudo} a commenté ta publication dans « ${crew.name} ».`);
    await req(lea, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Trois" });
    [n] = await db.select().from(notifications).where(eq(notifications.type, "crew_post_comment"));
    expect(n!.body).toBe(`${lea.pseudo} et 1 autre personne ont commenté ta publication dans « ${crew.name} ».`);
    expect((n!.data as { others: number }).others).toBe(1);
  });
});

describe("contenus d'un ancien membre", () => {
  it("il retire encore ses publications et commentaires ; les autres non-membres : 404", async () => {
    const { kenji, nina, crew } = await crewOf3();
    const paul = await signUp("Paul");
    const mine = await photoPost(nina, crew.id, 1);
    const theirs = await req(kenji, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Du chef" });
    const myComment = await req(nina, "POST", `/crews/${crew.id}/posts/${theirs.json.id}/comments`, { text: "Oui" });
    const keys = (await db.select().from(crewPostPhotos)).map((p) => p.storageKey);
    expect((await req(nina, "DELETE", `/crews/${crew.id}/members/${nina.id}`)).status).toBe(204);
    expect((await req(nina, "GET", `/crews/${crew.id}/feed`)).status).toBe(404);
    expect((await req(nina, "DELETE", `/crews/${crew.id}/posts/${theirs.json.id}`)).status).toBe(404);
    expect((await req(paul, "DELETE", `/crews/${crew.id}/posts/${mine.id}`)).status).toBe(404);
    expect((await req(paul, "DELETE", `/crews/${crew.id}/comments/${myComment.json.id}`)).status).toBe(404);
    expect((await req(nina, "DELETE", `/crews/${crew.id}/posts/${mine.id}`)).status).toBe(204);
    expect((await req(nina, "DELETE", `/crews/${crew.id}/comments/${myComment.json.id}`)).status).toBe(204);
    for (const k of keys) expect(await storage.get(k)).toBeNull();
  });

  it("retrait en bloc : seulement les crews quittés", async () => {
    const { kenji, nina, crew } = await crewOf3();
    const other = await req(kenji, "POST", "/crews", { name: "Autre crew", department: "66" });
    await req(nina, "POST", `/crews/${other.json.id}/requests`, { message: null });
    await req(kenji, "POST", `/crews/${other.json.id}/requests/${nina.id}/accept`);
    await photoPost(nina, crew.id, 1);
    await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Deux" });
    const theirs = await req(kenji, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Du chef" });
    await req(nina, "POST", `/crews/${crew.id}/posts/${theirs.json.id}/comments`, { text: "Oui" });
    const kept = await req(nina, "POST", `/crews/${other.json.id}/posts`, { kind: "text", text: "Je reste ici" });
    expect((await req(nina, "DELETE", "/me/crew-content/left-crews")).json).toEqual({ posts: 0, comments: 0 });
    expect((await req(nina, "DELETE", `/crews/${crew.id}/members/${nina.id}`)).status).toBe(204);
    expect((await req(nina, "DELETE", "/me/crew-content/left-crews")).json).toEqual({ posts: 2, comments: 1 });
    const feed = await req(kenji, "GET", `/crews/${crew.id}/feed`);
    const posts = feed.json.items.filter((i: { type: string }) => i.type === "post");
    expect(posts.map((i: { post: { id: string } }) => i.post.id)).toEqual([theirs.json.id]);
    expect(posts[0].post.commentsCount).toBe(0);
    const otherFeed = await req(nina, "GET", `/crews/${other.json.id}/feed`);
    expect(otherFeed.json.items.some((i: { post?: { id: string } }) => i.post?.id === kept.json.id)).toBe(true);
    expect(await db.select().from(crewPostPhotos)).toHaveLength(0);
  });
});

describe("modération, chef, idempotence, commentaires", () => {
  it("la modération voit les photos et le sondage d'une publication signalée, dans le dossier seulement", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const moderator = await signUp("Modo", { role: "moderator", twoFactor: true });
    const post = await photoPost(nina, crew.id, 2);
    const poll = await req(kenji, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { question: "On roule où ?", options: ["Aspres", "Côte"] },
    });
    await req(lea, "PUT", `/crews/${crew.id}/posts/${poll.json.id}/vote`, { optionId: poll.json.poll.options[0].id });
    const report = await req(lea, "POST", "/reports", {
      targetType: "crew_post",
      targetId: post.id,
      reason: "shocking",
    });
    expect(report.status).toBe(201);
    const pollReport = await req(nina, "POST", "/reports", {
      targetType: "crew_post",
      targetId: poll.json.id,
      reason: "spam",
    });
    const reportId = report.json.id as string;
    const detail = await req(moderator, "GET", `/admin/reports/${reportId}`);
    expect(detail.status).toBe(200);
    const urls: string[] = detail.json.target.imageUrls;
    expect(urls).toHaveLength(2);
    for (const u of urls)
      expect(u).toMatch(new RegExp(`^/api/admin/reports/${reportId}/crew-photos/[0-9a-f-]{36}\\.webp$`));
    expect(detail.json.target.imageUrl).toBe(urls[0]);
    const photo = await req(moderator, "GET", path(urls[0]!));
    expect(photo.status).toBe(200);
    expect(photo.headers.get("cache-control")).toBe("private, no-store");
    // Pas pour un membre, pas par un autre signalement.
    expect((await req(lea, "GET", path(urls[0]!))).status).toBe(403);
    const other = urls[0]!.replace(reportId, pollReport.json.id);
    expect((await req(moderator, "GET", path(other))).status).toBe(404);
    // Sondage signalé : la question et les réponses, jamais qui a voté.
    const pollDetail = await req(moderator, "GET", `/admin/reports/${pollReport.json.id}`);
    expect(pollDetail.json.target.text).toContain("On roule où ?");
    expect(pollDetail.json.target.text).toContain("Aspres");
    expect(JSON.stringify(pollDetail.json.target)).not.toContain(lea.pseudo);
  });

  it("le chef retire la publication d'un auteur suspendu ; un membre ne la voit pas", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const post = await photoPost(nina, crew.id, 1);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 7 * 24 * HOUR) })
      .where(eq(profiles.userId, nina.id));
    expect((await req(lea, "DELETE", `/crews/${crew.id}/posts/${post.id}`)).status).toBe(404);
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/posts/${post.id}`)).status).toBe(204);
    expect(await db.select().from(crewPostPhotos)).toHaveLength(0);
  });

  it("création idempotente : même identifiant, même publication, ni doublon ni photo « déjà utilisée »", async () => {
    const { kenji, nina, crew } = await crewOf3();
    const clientId = "0b8f6c2e-3a7d-4f51-9c4e-2d1a5b6c7d8e";
    const keys = [await upload(nina), await upload(nina, 600, 900)];
    const body = { kind: "photo", text: "Une fois", photoKeys: keys, clientId };
    const first = await req(nina, "POST", `/crews/${crew.id}/posts`, body);
    expect(first.status).toBe(201);
    const again = await req(nina, "POST", `/crews/${crew.id}/posts`, body);
    expect(again.status).toBe(201);
    expect(again.json.id).toBe(first.json.id);
    // Deux envois simultanés d'un sondage avec le même identifiant.
    const pollBody = {
      kind: "poll",
      poll: { question: "Qui ?", options: ["Moi", "Toi"] },
      clientId: crypto.randomUUID(),
    };
    const both = await Promise.all([
      req(kenji, "POST", `/crews/${crew.id}/posts`, pollBody),
      req(kenji, "POST", `/crews/${crew.id}/posts`, pollBody),
    ]);
    expect(both.map((r) => r.status)).toEqual([201, 201]);
    expect(both[0]!.json.id).toBe(both[1]!.json.id);
    const posts = await db.select().from(crewPosts).where(eq(crewPosts.crewId, crew.id));
    expect(posts).toHaveLength(2);
    // Le même identifiant dans un autre crew : refusé.
    const other = await req(nina, "POST", "/crews", { name: "Crew de Nina", department: "66" });
    expect(
      (await req(nina, "POST", `/crews/${other.json.id}/posts`, { kind: "text", text: "x", clientId })).status,
    ).toBe(400);
  });

  it("plus de 50 commentaires : pages chronologiques, sans doublon", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const post = await photoPost(nina, crew.id, 1);
    for (let i = 0; i < 55; i++) {
      clock.advance(1000);
      const who = i % 2 ? kenji : lea;
      expect((await req(who, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: `n°${i}` })).status).toBe(
        201,
      );
    }
    const first = await req(nina, "GET", `/crews/${crew.id}/posts/${post.id}/comments`);
    expect(first.json.items).toHaveLength(50);
    const second = await req(
      nina,
      "GET",
      `/crews/${crew.id}/posts/${post.id}/comments?cursor=${first.json.nextCursor}`,
    );
    expect(second.json.items).toHaveLength(5);
    expect(second.json.nextCursor).toBeNull();
    const texts = [...first.json.items, ...second.json.items].map((c: { text: string }) => c.text);
    expect(texts).toEqual(Array.from({ length: 55 }, (_, i) => `n°${i}`));
  });

  it("D36 : ni le plateau d'un événement où l'autrice est retenue, ni l'affiche, ni /api/files ne montrent les photos", async () => {
    const { nina, crew } = await crewOf3();
    const orga = await signUp("Orga");
    const structure = await createStructure(orga.id);
    const event = await createEvent(structure.id, { startsAt: new Date(clock.now.getTime() + 2 * 24 * HOUR) });
    const vehicle = await createVehicle(nina.id, ref);
    await db.insert(applications).values({
      eventId: event.id,
      userId: nina.id,
      vehicleId: vehicle.id,
      status: "accepted",
      rulesAcceptedAt: clock.now,
      followStructure: false,
      decidedAt: clock.now,
    });
    const key = await upload(nina);
    const post = await req(nina, "POST", `/crews/${crew.id}/posts`, {
      kind: "photo",
      photoKeys: [key],
      vehicleId: vehicle.id,
      eventId: event.id,
    });
    expect(post.status).toBe(201);
    const name = key.split("/").at(-1)!;
    const outside = [
      await req(nina, "GET", `/events/${event.id}/lineup`),
      await req(null, "GET", `/events/${event.id}/lineup`),
      await req(nina, "GET", `/me/vehicles/${vehicle.id}/share-zones?format=story&style=classic`),
      await req(nina, "GET", `/me/vehicles/${vehicle.id}`),
    ];
    for (const r of outside) {
      expect(r.status).toBeLessThan(500);
      expect(r.text).not.toContain("crew-posts");
      expect(r.text).not.toContain(name);
    }
    expect(
      (
        await db
          .select()
          .from(crewPostPhotos)
          .where(and(eq(crewPostPhotos.storageKey, key)))
      ).map((p) => p.postId),
    ).toEqual([post.json.id]);
    for (const variant of [`/files/${key}`, `/files//${key}`, `/files/%2F${key}`, `/files/./${key}`]) {
      expect((await req(nina, "GET", variant)).status).toBe(404);
    }
  });
});
