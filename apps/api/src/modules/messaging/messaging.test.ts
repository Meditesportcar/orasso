// Messagerie et Boîte (lot 18) : accès par sorte, idempotence, lecture et « lu par », demandes de contact, suppression,
// non-lus, push dédoublonné, images privées, WebSocket, anonymisation. Routes jouées en cookie ET en jeton porteur.
import { randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createStructure, resetDb, signUp, type TestUser, useClock, viewerOf } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { contactRequests, conversations, messages, notifications, profiles, structureMembers } from "../../db/schema";
import { type RealtimeSocket, realtime } from "../../lib/realtime";
import { storage } from "../../lib/storage";
import { resolveWsSession, wsCredentials } from "../../ws";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const MODES = ["cookie", "bearer"] as const;
type Mode = (typeof MODES)[number];
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
});

const bearerOf = (cookie: string) => {
  const raw = cookie
    .split("; ")
    .find((c) => c.startsWith("better-auth.session_token="))
    ?.slice("better-auth.session_token=".length);
  return raw ? decodeURIComponent(raw) : "";
};

/** Appel HTTP en cookie (site) ou en jeton porteur (appli). */
async function req(u: TestUser | null, method: string, path: string, body?: unknown, mode: Mode = "cookie") {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(u && mode === "cookie" ? { cookie: u.cookie } : {}),
      ...(u && mode === "bearer" ? { authorization: `Bearer ${bearerOf(u.cookie)}` } : {}),
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
  return { status: res.status, json, headers: res.headers };
}

async function upload(u: TestUser, data: Buffer, type: string, mode: Mode = "cookie", purpose = "message") {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(data)], "photo.jpg", { type }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: {
      origin: ORIGIN,
      ...(mode === "cookie" ? { cookie: u.cookie } : { authorization: `Bearer ${bearerOf(u.cookie)}` }),
    },
    body: form,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as { key: string; width: number } };
}

const jpeg = () =>
  sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 160, b: 40 } } })
    .jpeg()
    .toBuffer();

/** Amis par le vrai chemin : demande puis acceptation. */
async function befriend(a: TestUser, b: TestUser) {
  const r = await req(a, "POST", "/friends/requests", { pseudo: b.pseudo });
  expect(r.status).toBe(201);
  expect((await req(b, "POST", `/friends/requests/${r.json.id}/accept`)).status).toBe(200);
}

async function directBetween(a: TestUser, b: TestUser) {
  await befriend(a, b);
  const r = await req(a, "POST", "/conversations/direct", { userId: b.id });
  expect(r.status).toBe(201);
  return r.json.id as string;
}

const send = (u: TestUser, id: string, body: string, mode: Mode = "cookie", clientId = randomUUID()) =>
  req(u, "POST", `/conversations/${id}/messages`, { clientId, body }, mode);

const pushesTo = async (userId: string) =>
  (
    await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.type, "message_received")))
  ).length;

describe.each(MODES)("conversation à deux (%s)", (mode) => {
  it("amis : ouverture, envoi, réception, accès refusé aux autres", async () => {
    const [kenji, lea, intrus] = [await signUp("Kenji"), await signUp("Lea"), await signUp("Intrus")];
    await befriend(kenji, lea);
    const opened = await req(kenji, "POST", "/conversations/direct", { userId: lea.id }, mode);
    expect(opened.status).toBe(201);
    const again = await req(lea, "POST", "/conversations/direct", { userId: kenji.id }, mode);
    expect(again.status).toBe(200);
    expect(again.json.id).toBe(opened.json.id);
    const id = opened.json.id as string;

    const sent = await send(kenji, id, "Salut Léa, tu viens samedi ?", mode);
    expect(sent.status).toBe(201);
    expect(sent.json.mine).toBe(true);

    const page = await req(lea, "GET", `/conversations/${id}/messages`, undefined, mode);
    expect(page.status).toBe(200);
    expect(page.json.items[0].body).toBe("Salut Léa, tu viens samedi ?");
    expect(page.json.items[0].sender.pseudo).toBe(kenji.pseudo);
    expect(page.json.items[0].clientId).toBeNull();

    // Non participant : 403 sans aucun contenu, sur toutes les routes de la conversation.
    for (const path of [`/conversations/${id}`, `/conversations/${id}/messages`]) {
      const r = await req(intrus, "GET", path, undefined, mode);
      expect(r.status).toBe(403);
      expect(JSON.stringify(r.json)).not.toContain("Salut");
    }
    expect((await send(intrus, id, "coucou", mode)).status).toBe(403);
    expect((await req(intrus, "POST", `/conversations/${id}/read`, { messageId: sent.json.id }, mode)).status).toBe(
      403,
    );
    expect((await req(intrus, "DELETE", `/messages/${sent.json.id}`, undefined, mode)).status).toBe(404);
    expect((await req(null, "GET", `/conversations/${id}/messages`)).status).toBe(401);

    // WebSocket : l'abonnement suit les mêmes droits.
    expect(await realtime.canSubscribe(lea.id, `conversation:${id}`)).toBe(true);
    expect(await realtime.canSubscribe(intrus.id, `conversation:${id}`)).toBe(false);
    expect(await realtime.canSubscribe(intrus.id, "conversation:pas-un-uuid")).toBe(false);
  });

  it("non amis : 409 not_friends ; amitié retirée : lecture seule", async () => {
    const [a, b] = [await signUp("Anna"), await signUp("Bruno")];
    const refused = await req(a, "POST", "/conversations/direct", { userId: b.id }, mode);
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("not_friends");

    const id = await directBetween(a, b);
    expect((await send(a, id, "Hello", mode)).status).toBe(201);
    expect((await req(a, "DELETE", `/friends/${b.id}`)).status).toBe(204);
    const blocked = await send(b, id, "Toujours là ?", mode);
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.code).toBe("not_friends");
    const view = await req(b, "GET", `/conversations/${id}`, undefined, mode);
    expect(view.status).toBe(200);
    expect(view.json.canWrite).toBe(false);
    expect(view.json.writeBlocked).toBe("not_friends");
    expect((await req(b, "GET", `/conversations/${id}/messages`, undefined, mode)).json.items).toHaveLength(1);
  });

  it("idempotence par clientId", async () => {
    const [a, b] = [await signUp("Alice"), await signUp("Bob")];
    const id = await directBetween(a, b);
    const clientId = randomUUID();
    const first = await send(a, id, "Une seule fois", mode, clientId);
    const second = await send(a, id, "Une seule fois", mode, clientId);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.json.id).toBe(first.json.id);
    expect(second.json.clientId).toBe(clientId);
    const rows = await db.select().from(messages).where(eq(messages.conversationId, id));
    expect(rows).toHaveLength(1);
    // Le même identifiant repris par l'autre participant ne publie rien de plus.
    expect((await send(b, id, "Volé", mode, clientId)).status).toBe(409);
  });
});

describe("lecture, « lu par », non-lus", () => {
  it("marqueur de lecture, lu par, compteurs, plusieurs appareils", async () => {
    const [kenji, lea] = [await signUp("Kenji"), await signUp("Lea")];
    const id = await directBetween(kenji, lea);
    const m1 = await send(kenji, id, "Premier");
    clock.advance(1000);
    const m2 = await send(kenji, id, "Deuxième");

    let list = await req(lea, "GET", "/me/conversations");
    expect(list.json.items[0].unreadCount).toBe(2);
    expect(list.json.items[0].title).toBe(kenji.pseudo);
    let summary = await req(lea, "GET", "/me/inbox/summary", undefined, "bearer");
    expect(summary.json.unreadMessages).toBe(1);
    expect((await req(lea, "GET", "/me")).json.unreadInbox).toBe(1);

    // Léa lit le premier (téléphone), puis le second (site).
    expect((await req(lea, "POST", `/conversations/${id}/read`, { messageId: m1.json.id }, "bearer")).status).toBe(200);
    let page = await req(kenji, "GET", `/conversations/${id}/messages`);
    const byId = (p: typeof page, mid: string) => p.json.items.find((m: { id: string }) => m.id === mid);
    expect(byId(page, m1.json.id).readBy).toEqual([{ userId: lea.id, pseudo: lea.pseudo }]);
    expect(byId(page, m2.json.id).readBy).toEqual([]);
    expect((await req(lea, "GET", "/me/conversations")).json.items[0].unreadCount).toBe(1);

    await req(lea, "POST", `/conversations/${id}/read`, { messageId: m2.json.id });
    // Un appareil en retard qui renvoie l'ancien marqueur ne fait pas reculer la lecture.
    await req(lea, "POST", `/conversations/${id}/read`, { messageId: m1.json.id }, "bearer");
    page = await req(kenji, "GET", `/conversations/${id}/messages`);
    expect(byId(page, m2.json.id).readBy).toEqual([{ userId: lea.id, pseudo: lea.pseudo }]);
    list = await req(lea, "GET", "/me/conversations");
    expect(list.json.items[0].unreadCount).toBe(0);
    summary = await req(lea, "GET", "/me/inbox/summary");
    expect(summary.json.unreadMessages).toBe(0);
    // « Lu par » n'apparaît que sur ses propres messages.
    const leaPage = await req(lea, "GET", `/conversations/${id}/messages`);
    expect(leaPage.json.items.every((m: { readBy: unknown }) => m.readBy === null)).toBe(true);
    // L'expéditeur n'a rien de non lu.
    expect((await req(kenji, "GET", "/me/conversations")).json.items[0].unreadCount).toBe(0);
  });

  it("suppression : par l'expéditeur seul, « Message supprimé » pour tous", async () => {
    const [a, b] = [await signUp("Alice"), await signUp("Bob")];
    const id = await directBetween(a, b);
    const m = await send(a, id, "Oups, pas pour toi");
    expect((await req(b, "DELETE", `/messages/${m.json.id}`)).status).toBe(404);
    expect((await req(a, "DELETE", `/messages/${m.json.id}`, undefined, "bearer")).status).toBe(204);
    const page = await req(b, "GET", `/conversations/${id}/messages`);
    expect(page.json.items[0]).toMatchObject({ deleted: true, body: null, image: null });
    expect(JSON.stringify(page.json)).not.toContain("Oups");
    const list = await req(b, "GET", "/me/conversations");
    expect(list.json.items[0].lastMessage.preview).toBe("Message supprimé");
    expect(list.json.items[0].unreadCount).toBe(0);
    expect((await req(a, "DELETE", `/messages/${m.json.id}`)).status).toBe(404);
  });

  it("S12 : un push par conversation et par 5 minutes tant qu'il reste du non lu", async () => {
    const [a, b] = [await signUp("Alice"), await signUp("Bob")];
    const id = await directBetween(a, b);
    await send(a, id, "1");
    await send(a, id, "2");
    await send(a, id, "3");
    expect(await pushesTo(b.id)).toBe(1);
    const [n] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, b.id), eq(notifications.type, "message_received")));
    expect(n?.inJournal).toBe(false);
    expect(n?.body).toBe(`${a.pseudo} : 1`);
    clock.advance(5 * 60_000);
    const last = await send(a, id, "4");
    expect(await pushesTo(b.id)).toBe(2);
    // Bob lit : le message suivant peut prévenir tout de suite.
    await req(b, "POST", `/conversations/${id}/read`, { messageId: last.json.id });
    clock.advance(1000);
    await send(a, id, "5");
    expect(await pushesTo(b.id)).toBe(3);
    // Push hors Journal.
    expect(
      (await req(b, "GET", "/me/notifications")).json.items.some(
        (x: { type: string }) => x.type === "message_received",
      ),
    ).toBe(false);
    await notificationsService.flush();
  });

  it("60 messages par minute, comptés en base", async () => {
    const [a, b] = [await signUp("Alice"), await signUp("Bob")];
    const id = await directBetween(a, b);
    for (let i = 0; i < 60; i++) expect((await send(a, id, `m${i}`)).status).toBe(201);
    const over = await send(a, id, "de trop");
    expect(over.status).toBe(429);
    clock.advance(61_000);
    expect((await send(a, id, "ça repart")).status).toBe(201);
  });
});

describe("demandes de contact", () => {
  it("unique, refus des doublons, acceptation → conversation avec le premier message", async () => {
    const [a, c] = [await signUp("Anna"), await signUp("Carl")];
    const created = await req(
      c,
      "POST",
      "/contact-requests",
      { pseudo: a.pseudo, message: "Bonjour, ta 205 est à vendre ?" },
      "bearer",
    );
    expect(created.status).toBe(201);
    const dup = await req(c, "POST", "/contact-requests", { pseudo: a.pseudo, message: "Relance" });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("contact_request_exists");
    const reverse = await req(a, "POST", "/contact-requests", { pseudo: c.pseudo, message: "Et toi ?" });
    expect(reverse.status).toBe(409);
    expect(reverse.json.error.code).toBe("contact_request_exists");

    expect((await req(a, "GET", "/me/inbox/summary")).json.requests).toMatchObject({ contact: 1, friend: 0 });
    const incoming = await req(a, "GET", "/me/contact-requests?direction=in");
    expect(incoming.json.items).toHaveLength(1);
    expect(incoming.json.items[0].message).toBe("Bonjour, ta 205 est à vendre ?");
    expect((await req(a, "GET", "/me")).json.unreadInbox).toBe(1);
    // Notification au Journal du destinataire.
    expect((await db.select().from(notifications).where(eq(notifications.type, "contact_request"))).length).toBe(1);

    // Seul le destinataire accepte.
    expect((await req(c, "POST", `/contact-requests/${created.json.id}/accept`)).status).toBe(404);
    const accepted = await req(a, "POST", `/contact-requests/${created.json.id}/accept`, undefined, "bearer");
    expect(accepted.status).toBe(200);
    const id = accepted.json.conversationId as string;
    const page = await req(a, "GET", `/conversations/${id}/messages`);
    expect(page.json.items).toHaveLength(1);
    expect(page.json.items[0]).toMatchObject({ body: "Bonjour, ta 205 est à vendre ?", mine: false });
    // Conversation ouverte sans amitié (S11) : les deux peuvent écrire.
    expect((await send(a, id, "Oui, elle l'est")).status).toBe(201);
    expect((await send(c, id, "Super")).status).toBe(201);
    const useDirect = await req(c, "POST", "/conversations/direct", { userId: a.id });
    expect(useDirect.status).toBe(200);
    expect(useDirect.json.id).toBe(id);
    expect((await req(a, "GET", "/me/inbox/summary")).json.requests.contact).toBe(0);
    expect((await req(a, "POST", `/contact-requests/${created.json.id}/accept`)).status).toBe(409);
  });

  it("refus silencieux, amis, limite de 10 par jour en base", async () => {
    const [a, d, f] = [await signUp("Anna"), await signUp("Dany"), await signUp("Fred")];
    const r = await req(d, "POST", "/contact-requests", { pseudo: a.pseudo, message: "Salut" });
    expect((await req(a, "POST", `/contact-requests/${r.json.id}/decline`)).status).toBe(204);
    // L'auteur voit toujours sa demande « envoyée », et ne peut pas en refaire une.
    const out = await req(d, "GET", "/me/contact-requests?direction=out");
    expect(out.json.items).toHaveLength(1);
    expect(JSON.stringify(out.json)).not.toContain("declined");
    expect((await req(d, "POST", "/contact-requests", { pseudo: a.pseudo, message: "Encore" })).status).toBe(409);
    // Amis : pas de demande de contact.
    await befriend(a, f);
    const friends = await req(f, "POST", "/contact-requests", { pseudo: a.pseudo, message: "?" });
    expect(friends.status).toBe(409);
    expect(friends.json.error.code).toBe("already_friends");
    // Texte obligatoire.
    expect((await req(d, "POST", "/contact-requests", { pseudo: f.pseudo, message: "  " })).status).toBe(400);
    // 10 par jour.
    const many = await Promise.all(Array.from({ length: 10 }, (_, i) => signUp(`Cible${i}`)));
    for (const t of many.slice(0, 9))
      expect((await req(d, "POST", "/contact-requests", { pseudo: t.pseudo, message: "Hello" })).status).toBe(201);
    const over = await req(d, "POST", "/contact-requests", { pseudo: many[9]!.pseudo, message: "Hello" });
    expect(over.status).toBe(429);
    clock.advance(86_400_000 + 1000);
    expect((await req(d, "POST", "/contact-requests", { pseudo: many[9]!.pseudo, message: "Hello" })).status).toBe(201);
  });
});

describe("organisateurs toujours joignables", () => {
  it("une personne contacte la structure, l'organisateur répond ; accès refusé aux autres", async () => {
    const damien = await signUp("Damien", { twoFactor: true });
    const sarahNo2fa = await signUp("Sarah");
    const kenji = await signUp("Kenji");
    const autre = await signUp("Autre");
    const admin = await signUp("Admin", { twoFactor: true, role: "super_admin" });
    const s = await createStructure(damien.id);
    await db
      .insert(structureMembers)
      .values({ structureId: s.id, userId: sarahNo2fa.id, role: "co_organizer", status: "active" });

    const opened = await req(kenji, "POST", `/structures/${s.id}/conversation`, undefined, "bearer");
    expect(opened.status).toBe(201);
    const id = opened.json.id as string;
    expect((await req(kenji, "POST", `/structures/${s.id}/conversation`)).json.id).toBe(id);
    expect((await send(kenji, id, "Bonjour, il reste de la place ?", "bearer")).status).toBe(201);

    // Damien (2FA) : la conversation est dans sa Boîte, côté structure.
    const list = await req(damien, "GET", "/me/conversations");
    expect(list.json.items[0]).toMatchObject({ id, side: "structure", title: kenji.pseudo, unreadCount: 1 });
    expect((await req(damien, "GET", "/me/inbox/summary")).json.unreadMessages).toBe(1);
    const me = await req(damien, "GET", "/me");
    expect(me.json.personas.find((p: { kind: string }) => p.kind === "organizer").badge).toBeGreaterThanOrEqual(1);
    const reply = await send(damien, id, "Oui, deux places");
    expect(reply.status).toBe(201);
    expect(reply.json.asStructure).toBe(true);
    // Kenji voit « Club de test » et le message de la structure.
    const kList = await req(kenji, "GET", "/me/conversations");
    expect(kList.json.items[0]).toMatchObject({ title: "Club de test", side: "member", unreadCount: 1 });
    const page = await req(kenji, "GET", `/conversations/${id}/messages`);
    expect(page.json.items[0]).toMatchObject({ asStructure: true, body: "Oui, deux places" });
    // Kenji lit : « Lu par Kenji » côté structure.
    await req(kenji, "POST", `/conversations/${id}/read`, { messageId: reply.json.id });
    const dPage = await req(damien, "GET", `/conversations/${id}/messages`);
    expect(dPage.json.items[0].readBy).toEqual([{ userId: kenji.id, pseudo: kenji.pseudo }]);

    // Co-organisatrice sans double authentification : refusée ; personne d'autre ; pas le super admin.
    expect((await req(sarahNo2fa, "GET", `/conversations/${id}/messages`)).json.error.code).toBe("two_factor_required");
    expect((await req(sarahNo2fa, "GET", "/me/conversations")).json.items).toHaveLength(0);
    expect((await req(autre, "GET", `/conversations/${id}`)).status).toBe(403);
    expect((await req(admin, "GET", `/conversations/${id}/messages`)).status).toBe(403);
    expect(await realtime.canSubscribe(sarahNo2fa.id, `conversation:${id}`, { secondFactor: null })).toBe(false);
    expect(await realtime.canSubscribe(damien.id, `conversation:${id}`, { secondFactor: "totp" })).toBe(true);

    // Un co-organisateur retiré perd l'accès tout de suite.
    await db.update(structureMembers).set({ status: "removed" }).where(eq(structureMembers.userId, sarahNo2fa.id));
    expect(await realtime.canSubscribe(sarahNo2fa.id, `conversation:${id}`, { secondFactor: "totp" })).toBe(false);
  });

  it("S10 : l'organisateur écrit le premier à un abonné, pas à un inconnu", async () => {
    const damien = await signUp("Damien", { twoFactor: true });
    const fan = await signUp("Fan");
    const inconnu = await signUp("Inconnu");
    const s = await createStructure(damien.id);
    expect((await req(fan, "POST", `/structures/${s.id}/follow`)).status).toBeLessThan(300);
    for (const mode of MODES) {
      const ok = await req(damien, "POST", `/structures/${s.id}/conversations/with/${fan.id}`, undefined, mode);
      expect(ok.status).toBe(mode === "cookie" ? 201 : 200);
    }
    const refused = await req(damien, "POST", `/structures/${s.id}/conversations/with/${inconnu.id}`);
    expect(refused.status).toBe(403);
    // Un non-organisateur ne peut pas ouvrir au nom de la structure.
    expect((await req(fan, "POST", `/structures/${s.id}/conversations/with/${inconnu.id}`)).status).toBe(403);
    // Structure non vérifiée : on ne la contacte pas.
    const brouillon = await createStructure(damien.id, false);
    expect((await req(fan, "POST", `/structures/${brouillon.id}/conversation`)).status).toBe(404);
  });
});

describe("images privées", () => {
  it("envoi par clé, servie aux seuls participants, jamais par /api/files", async () => {
    const [a, b, intrus] = [await signUp("Alice"), await signUp("Bob"), await signUp("Intrus")];
    const id = await directBetween(a, b);
    // Le type annoncé ne compte pas : un faux JPEG est refusé au décodage.
    expect((await upload(a, Buffer.from("pas une image du tout"), "image/jpeg")).status).toBe(415);
    expect((await upload(a, await jpeg(), "image/jpeg", "cookie", "inconnu")).status).toBe(400);
    const up = await upload(a, await jpeg(), "image/jpeg", "bearer");
    expect(up.status).toBe(201);
    expect(up.json.key).toMatch(/^private\/messages\/[0-9a-f-]{36}\.webp$/);
    // La clé d'un autre n'est pas utilisable.
    expect(
      (await req(b, "POST", `/conversations/${id}/messages`, { clientId: randomUUID(), imageKey: up.json.key })).status,
    ).toBe(400);
    const sent = await req(
      a,
      "POST",
      `/conversations/${id}/messages`,
      { clientId: randomUUID(), imageKey: up.json.key },
      "bearer",
    );
    expect(sent.status).toBe(201);
    expect(sent.json.kind).toBe("image");
    // Une seule fois.
    expect(
      (await req(a, "POST", `/conversations/${id}/messages`, { clientId: randomUUID(), imageKey: up.json.key })).status,
    ).toBe(400);

    const url: string = sent.json.image.url;
    const files = await app.request(`/api/files/${up.json.key}`, { headers: { cookie: a.cookie } });
    expect(files.status).toBe(404);
    for (const mode of MODES) {
      const ok = await app.request(url, {
        headers: mode === "cookie" ? { cookie: b.cookie } : { authorization: `Bearer ${bearerOf(b.cookie)}` },
      });
      expect(ok.status).toBe(200);
      expect(ok.headers.get("content-type")).toBe("image/webp");
    }
    expect((await app.request(url)).status).toBe(401);
    expect((await app.request(url, { headers: { cookie: intrus.cookie } })).status).toBe(403);

    // Supprimée avec le message.
    expect(await storage.get(up.json.key)).not.toBeNull();
    await req(a, "DELETE", `/messages/${sent.json.id}`);
    expect(await storage.get(up.json.key)).toBeNull();
    expect((await app.request(url, { headers: { cookie: b.cookie } })).status).toBe(404);
  });
});

describe("WebSocket", () => {
  it("poignée de main : jeton porteur, sous-protocole, cookie d'une origine de confiance seulement", async () => {
    const u = await signUp("Wanda");
    const token = bearerOf(u.cookie);
    const viaBearer = await resolveWsSession(wsCredentials(new Headers({ authorization: `Bearer ${token}` })));
    expect(viaBearer?.userId).toBe(u.id);
    const hex = Buffer.from(token, "utf8").toString("hex");
    const viaProtocol = await resolveWsSession(
      wsCredentials(new Headers({ "sec-websocket-protocol": `orasso.v1, orasso.bearer.${hex}` })),
    );
    expect(viaProtocol?.userId).toBe(u.id);
    const viaCookie = await resolveWsSession(wsCredentials(new Headers({ cookie: u.cookie, origin: ORIGIN })));
    expect(viaCookie?.userId).toBe(u.id);
    expect(wsCredentials(new Headers({ cookie: u.cookie, origin: "https://site-malveillant.example" }))).toBeNull();
    expect(await resolveWsSession(wsCredentials(new Headers({ authorization: "Bearer faux.jeton" })))).toBeNull();
    // Session supprimée (déconnexion, compte supprimé) : la revérification échoue.
    await accountService.anonymize(u.id, null);
    expect(await resolveWsSession(wsCredentials(new Headers({ authorization: `Bearer ${token}` })))).toBeNull();
  });

  it("diffusion aux seuls lecteurs du moment", async () => {
    const [a, b, intrus] = [await signUp("Alice"), await signUp("Bob"), await signUp("Intrus")];
    const id = await directBetween(a, b);
    const received: Record<string, string[]> = { b: [], intrus: [] };
    const socketB: RealtimeSocket = { userId: b.id, send: (d) => received.b!.push(d) };
    // Abonnement forcé (le serveur l'aurait refusé) : la diffusion filtre quand même.
    const socketI: RealtimeSocket = { userId: intrus.id, send: (d) => received.intrus!.push(d) };
    realtime.subscribe(`conversation:${id}`, socketB);
    realtime.subscribe(`conversation:${id}`, socketI);
    await send(a, id, "En direct");
    expect(received.b!.some((d) => d.includes("message.new") && d.includes("En direct"))).toBe(true);
    expect(received.intrus).toHaveLength(0);
    realtime.unsubscribeAll(socketB);
    realtime.unsubscribeAll(socketI);
  });
});

describe("compte suspendu et compte supprimé", () => {
  it("suspendu : lecture seule", async () => {
    const [a, b] = [await signUp("Alice"), await signUp("Bob")];
    const id = await directBetween(a, b);
    await send(b, id, "Avant");
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 86_400_000) })
      .where(eq(profiles.userId, a.id));
    expect((await send(a, id, "Pendant")).status).toBe(403);
    expect((await req(a, "GET", `/conversations/${id}/messages`)).status).toBe(200);
    expect((await req(a, "GET", `/conversations/${id}`)).json.writeBlocked).toBe("suspended");
  });

  it("anonymisation : messages vidés, pseudo jamais réaffiché, demandes et notifications supprimées", async () => {
    const [a, b, c] = [await signUp("Alice"), await signUp("Bob"), await signUp("Carl")];
    const id = await directBetween(a, b);
    const up = await upload(a, await jpeg(), "image/jpeg");
    await req(a, "POST", `/conversations/${id}/messages`, { clientId: randomUUID(), imageKey: up.json.key });
    await send(a, id, "Mon dernier message");
    await req(a, "POST", "/contact-requests", { pseudo: c.pseudo, message: "Coucou Carl" });
    const pending = await upload(a, await jpeg(), "image/jpeg");
    const oldPseudo = a.pseudo;

    const v = await viewerOf(a);
    expect(v.profile.pseudo).toBe(oldPseudo);
    await accountService.anonymize(a.id, null);

    const page = await req(b, "GET", `/conversations/${id}/messages`);
    expect(page.status).toBe(200);
    expect(page.json.items.every((m: { deleted: boolean; sender: unknown }) => m.deleted && m.sender === null)).toBe(
      true,
    );
    const view = await req(b, "GET", `/conversations/${id}`);
    expect(view.json.title).toBe("Compte supprimé");
    expect(view.json.writeBlocked).toBe("closed");
    const list = await req(b, "GET", "/me/conversations");
    expect(JSON.stringify(list.json)).not.toContain(oldPseudo);
    expect(JSON.stringify(list.json)).not.toContain("Mon dernier message");
    expect(await storage.get(up.json.key)).toBeNull();
    expect(await storage.get(pending.json.key)).toBeNull();
    expect(await db.select().from(contactRequests)).toHaveLength(0);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, b.id));
    expect(JSON.stringify(notes.filter((n) => n.type === "message_received"))).not.toContain(oldPseudo);
    expect((await db.select().from(conversations).where(eq(conversations.id, id)))[0]?.closedAt).not.toBeNull();
  });
});
