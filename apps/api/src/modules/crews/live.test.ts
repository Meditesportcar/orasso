// La page du crew en direct (lot R6a) : droit du canal `crew:<id>` (membre, chef, non-membre, demande en attente,
// membre retiré ou parti, crew dissous, compte suspendu), signal émis après la validation et jamais après une
// annulation, signal sans contenu (ni texte, ni pseudo, ni nombre), l'auteur ne reçoit pas le sien, un membre retiré
// est coupé tout de suite (`revoked`), et la relecture d'une publication (`GET /crews/:id/posts/:postId`).
import { crewChannel, crewSignalTypes, fromWallTime, HOUR } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { profiles } from "../../db/schema";
import { type RealtimeSocket, realtime } from "../../lib/realtime";
import { withTx } from "../../lib/tx";
import { canSubscribeCrew, signalCrew } from "./live";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const paris = (month: number, day: number, hour: number) => fromWallTime({ year: 2026, month, day, hour, minute: 0 });
let clock: ReturnType<typeof useClock>;
const sockets: RealtimeSocket[] = [];

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 1, 10));
  await seedReference();
});

afterEach(() => {
  for (const s of sockets.splice(0)) realtime.unsubscribeAll(s);
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
  return { status: res.status, json };
}

type Received = { channel?: string; type: string; payload?: Record<string, unknown> };
type Probe = RealtimeSocket & { messages: Received[] };

/** Une connexion WebSocket d'essai, abonnée au canal du crew si le droit le permet. */
async function listen(u: TestUser, crewId: string): Promise<{ ok: boolean; socket: Probe }> {
  const messages: Received[] = [];
  const socket: Probe = { userId: u.id, send: (d) => messages.push(JSON.parse(d) as Received), messages };
  sockets.push(socket);
  const ok = await realtime.canSubscribe(u.id, crewChannel(crewId), { secondFactor: null });
  if (ok) realtime.subscribe(crewChannel(crewId), socket);
  return { ok, socket };
}

let counter = 0;
async function crewOf3() {
  const kenji = await signUp("Kenji");
  const julie = await signUp("Julie");
  const lea = await signUp("Lea");
  const res = await req(kenji, "POST", "/crews", { name: `Crew direct ${++counter}`, department: "66" });
  expect(res.status).toBe(201);
  const crew = res.json as { id: string; slug: string };
  for (const m of [julie, lea]) {
    expect((await req(m, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
    expect((await req(kenji, "POST", `/crews/${crew.id}/requests/${m.id}/accept`)).status).toBe(204);
  }
  return { kenji, julie, lea, crew };
}

const ALLOWED = new Set(["type", "crewId", "postId", "commentId", "outingId"]);

describe("droit du canal crew:<id>", () => {
  it("membre et chef : oui ; non-membre, demande en attente, identifiant mal formé : non", async () => {
    const { kenji, julie, crew } = await crewOf3();
    const paul = await signUp("Paul");
    const sarah = await signUp("Sarah");
    expect((await req(sarah, "POST", `/crews/${crew.id}/requests`, { message: "Salut" })).status).toBe(201);
    expect((await listen(kenji, crew.id)).ok).toBe(true);
    expect((await listen(julie, crew.id)).ok).toBe(true);
    expect((await listen(paul, crew.id)).ok).toBe(false);
    expect((await listen(sarah, crew.id)).ok).toBe(false);
    expect(await canSubscribeCrew(kenji.id, "crew:../x")).toBe(false);
    expect(await canSubscribeCrew(kenji.id, `crew:${crew.id.toUpperCase()}`)).toBe(false);
  });

  it("membre retiré : revoked tout de suite, plus rien ensuite, et refusé à la revérification", async () => {
    const { kenji, julie, lea, crew } = await crewOf3();
    const j = await listen(julie, crew.id);
    const k = await listen(kenji, crew.id);
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/members/${julie.id}`)).status).toBe(204);
    expect(j.socket.messages).toContainEqual({ type: "revoked", channel: crewChannel(crew.id) });
    expect(k.socket.messages.map((m) => m.type)).toContain("member.left");
    const before = j.socket.messages.length;
    expect((await req(lea, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Après" })).status).toBe(201);
    expect(j.socket.messages).toHaveLength(before);
    expect(k.socket.messages.map((m) => m.type)).toContain("post.created");
    expect(
      await realtime.canSubscribe(julie.id, crewChannel(crew.id), { secondFactor: null, revalidation: true }),
    ).toBe(false);
  });

  it("membre parti, compte suspendu, crew dissous : non", async () => {
    const { kenji, julie, lea, crew } = await crewOf3();
    const l = await listen(lea, crew.id);
    expect((await req(lea, "DELETE", `/crews/${crew.id}/members/${lea.id}`)).status).toBe(204);
    expect(l.socket.messages).toContainEqual({ type: "revoked", channel: crewChannel(crew.id) });
    expect(await canSubscribeCrew(lea.id, crewChannel(crew.id))).toBe(false);

    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, julie.id));
    expect(await canSubscribeCrew(julie.id, crewChannel(crew.id))).toBe(false);

    const k = await listen(kenji, crew.id);
    expect(k.ok).toBe(true);
    expect((await req(kenji, "DELETE", `/crews/${crew.id}`)).status).toBe(204);
    expect(k.socket.messages).toContainEqual({ type: "revoked", channel: crewChannel(crew.id) });
    expect(realtime.subscriberCount(crewChannel(crew.id))).toBe(0);
    expect(await canSubscribeCrew(kenji.id, crewChannel(crew.id))).toBe(false);
  });
});

describe("signaux", () => {
  it("chaque geste envoie un signal sans contenu aux autres membres, jamais à son auteur", async () => {
    const { kenji, julie, lea, crew } = await crewOf3();
    const k = await listen(kenji, crew.id);
    const j = await listen(julie, crew.id);
    const secret = "Texte privé de Julie";
    const post = await req(julie, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: secret });
    expect(post.status).toBe(201);
    const postId = post.json.id as string;
    expect((await req(julie, "PUT", `/crews/${crew.id}/posts/${postId}/reaction`)).status).toBe(200);
    const c = await req(julie, "POST", `/crews/${crew.id}/posts/${postId}/comments`, { text: "Commentaire privé" });
    expect(c.status).toBe(201);
    expect((await req(julie, "DELETE", `/crews/${crew.id}/comments/${c.json.id}`)).status).toBe(204);
    const poll = await req(julie, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { question: "On roule où ?", options: ["Col de Jau", "Côte Vermeille"] },
    });
    expect(poll.status).toBe(201);
    const optionId = poll.json.poll.options[0].id as string;
    expect((await req(julie, "PUT", `/crews/${crew.id}/posts/${poll.json.id}/vote`, { optionId })).status).toBe(200);
    expect((await req(julie, "POST", `/crews/${crew.id}/posts/${poll.json.id}/close`)).status).toBe(200);
    const startsAt = new Date(clock.now.getTime() + 5 * 24 * HOUR).toISOString();
    const outing = await req(julie, "POST", `/crews/${crew.id}/outings`, {
      title: "Balade des Aspres",
      startsAt,
      place: "Parking de la cave coopérative, Thuir",
      program: "Café à Thuir.",
    });
    expect(outing.status).toBe(201);
    const outingId = outing.json.id as string;
    expect(
      (await req(julie, "PATCH", `/crews/${crew.id}/outings/${outingId}`, { place: "Thuir, la cave" })).status,
    ).toBe(200);
    expect((await req(julie, "PUT", `/crews/${crew.id}/outings/${outingId}/rsvp`, { answer: "yes" })).status).toBe(200);
    expect((await req(julie, "DELETE", `/crews/${crew.id}/outings/${outingId}`)).status).toBe(204);
    expect((await req(julie, "DELETE", `/crews/${crew.id}/posts/${postId}`)).status).toBe(204);

    expect(k.socket.messages.map((m) => m.type)).toEqual([
      "post.created",
      "post.fire",
      "comment.created",
      "comment.removed",
      "post.created",
      "poll.voted",
      "poll.closed",
      "outing.created",
      "outing.updated",
      "outing.rsvp",
      "outing.cancelled",
      "post.removed",
    ]);
    for (const m of k.socket.messages) {
      expect(m.channel).toBe(crewChannel(crew.id));
      expect((crewSignalTypes as readonly string[]).includes(m.type)).toBe(true);
      expect(m.payload?.type).toBe(m.type);
      expect(m.payload?.crewId).toBe(crew.id);
      for (const key of Object.keys(m.payload ?? {})) expect(ALLOWED.has(key)).toBe(true);
    }
    const all = JSON.stringify(k.socket.messages);
    for (const leak of [secret, "Commentaire privé", "On roule où", "Balade des Aspres", "Thuir", julie.pseudo]) {
      expect(all).not.toContain(leak);
    }
    expect(k.socket.messages[2]?.payload).toEqual({
      type: "comment.created",
      crewId: crew.id,
      postId,
      commentId: c.json.id,
    });
    // L'auteur ne reçoit rien de ses propres gestes (son écran les affiche déjà).
    expect(j.socket.messages).toEqual([]);

    // Le chef change les réglages, et un membre arrive : les pages ouvertes se relisent.
    expect((await req(kenji, "PATCH", `/crews/${crew.id}`, { description: "Nouvelle description" })).status).toBe(200);
    expect(j.socket.messages.map((m) => m.type)).toEqual(["crew.updated"]);
    const paul = await signUp("Paul");
    expect((await req(paul, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
    expect((await req(kenji, "POST", `/crews/${crew.id}/requests/${paul.id}/accept`)).status).toBe(204);
    expect(j.socket.messages.map((m) => m.type)).toEqual(["crew.updated", "member.joined"]);
    expect(lea).toBeDefined();
  });

  it("émis après la validation, jamais après une annulation ni un refus", async () => {
    const { kenji, julie, crew } = await crewOf3();
    const k = await listen(kenji, crew.id);
    // Annulation : le signal prévu dans la transaction ne part pas.
    await expect(
      withTx(async (_tx, after) => {
        signalCrew(after, crew.id, "post.created", { postId: crypto.randomUUID() });
        throw new Error("annulée");
      }),
    ).rejects.toThrow("annulée");
    expect(k.socket.messages).toEqual([]);
    // Validation : rien tant que la transaction est ouverte, le signal ensuite.
    let duringTx = -1;
    await withTx(async (_tx, after) => {
      signalCrew(after, crew.id, "crew.updated");
      duringTx = k.socket.messages.length;
    });
    expect(duringTx).toBe(0);
    expect(k.socket.messages.map((m) => m.type)).toEqual(["crew.updated"]);
    // Gestes refusés (photo inconnue après l'écriture de la publication, sondage clos) : aucun signal.
    const bad = await req(julie, "POST", `/crews/${crew.id}/posts`, {
      kind: "photo",
      photoKeys: ["private/crew-posts/inconnue.webp"],
    });
    expect(bad.status).toBe(400);
    const poll = await req(julie, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { question: "On roule où ?", options: ["Col de Jau", "Côte Vermeille"] },
    });
    expect((await req(julie, "POST", `/crews/${crew.id}/posts/${poll.json.id}/close`)).status).toBe(200);
    const count = k.socket.messages.length;
    const vote = await req(julie, "PUT", `/crews/${crew.id}/posts/${poll.json.id}/vote`, {
      optionId: poll.json.poll.options[0].id,
    });
    expect(vote.status).toBe(400);
    expect(k.socket.messages).toHaveLength(count);
    expect(k.socket.messages.map((m) => m.type)).toEqual(["crew.updated", "post.created", "poll.closed"]);
  });
});

describe("GET /crews/:id/posts/:postId", () => {
  it("la publication telle que le fil la montre au membre ; 404 hors du crew ou une fois retirée", async () => {
    const { kenji, julie, crew } = await crewOf3();
    const paul = await signUp("Paul");
    const post = await req(julie, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Lavée, prête" });
    const postId = post.json.id as string;
    expect((await req(kenji, "PUT", `/crews/${crew.id}/posts/${postId}/reaction`)).status).toBe(200);
    const one = await req(kenji, "GET", `/crews/${crew.id}/posts/${postId}`);
    expect(one.status).toBe(200);
    const feed = await req(kenji, "GET", `/crews/${crew.id}/feed`);
    const inFeed = feed.json.items.find((i: { post?: { id: string } }) => i.post?.id === postId).post;
    expect(one.json).toEqual(inFeed);
    expect(Object.keys(one.json).sort()).toEqual(
      [
        "author",
        "canRemove",
        "commentsCount",
        "createdAt",
        "crewId",
        "event",
        "firedByMe",
        "firesCount",
        "id",
        "kind",
        "mine",
        "photos",
        "poll",
        "text",
        "vehicle",
      ].sort(),
    );
    expect(one.json).toMatchObject({ firesCount: 1, firedByMe: true, mine: false, canRemove: true });
    expect((await req(paul, "GET", `/crews/${crew.id}/posts/${postId}`)).status).toBe(404);
    expect((await req(null, "GET", `/crews/${crew.id}/posts/${postId}`)).status).toBe(401);
    expect((await req(kenji, "GET", `/crews/${crew.id}/posts/00000000-0000-4000-8000-000000000000`)).status).toBe(404);
    expect((await req(julie, "DELETE", `/crews/${crew.id}/posts/${postId}`)).status).toBe(204);
    expect((await req(kenji, "GET", `/crews/${crew.id}/posts/${postId}`)).status).toBe(404);
  });
});
