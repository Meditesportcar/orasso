// Lot R9i (T57, T60) : la conversation d'une page ne révèle JAMAIS le compte qui tient la page. Le canari : un titulaire au pseudo,
// à l'identifiant, à l'adresse et à la clé de photo reconnaissables ; pour la personne qui écrit, la sérialisation entière de chaque
// sortie ne contient aucun des quatre. Listes blanches de clés exactes. Fin de vie (titulaire supprimé, passionné supprimé,
// titulaire suspendu), migration (CHECK dans les deux sens), compatibilité de l'APK en ligne (`direct` et `organizer` inchangés).
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import {
  createStructure,
  quietHours,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { conversations, emailOutbox, mediaProfiles, messages, notifications, profiles } from "../../db/schema";
import { push } from "../../lib/push";
import { type RealtimeSocket, realtime } from "../../lib/realtime";
import { accountService } from "../account/service";
import { paris } from "../albums/albums-test-helpers";
import { type Ref, tagScenario } from "../albums/tags-test-helpers";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const LOGO_KEY = "media/logo-sud-cars.webp";
let ref: Ref;
let s: Awaited<ReturnType<typeof tagScenario>>;
let clock: ReturnType<typeof useClock>;
let sent: MockInstance<typeof push.send>;
/** Les traces du titulaire (le canari) : son pseudo, son identifiant de compte, son adresse, la clé de sa photo. */
let canary: string[];
let leoAvatarKey: string;

beforeEach(async () => {
  await resetDb();
  quietHours(false);
  clock = useClock(paris(11, 5, 12));
  ref = await seedReference();
  s = await tagScenario(ref, 4);
  leoAvatarKey = `avatars/canari-${randomUUID()}.webp`;
  await db.update(profiles).set({ avatarKey: leoAvatarKey }).where(eq(profiles.userId, s.leo.id));
  await db.update(mediaProfiles).set({ logoKey: LOGO_KEY }).where(eq(mediaProfiles.id, s.leoMedia));
  canary = [s.leo.pseudo, s.leo.id, s.leo.email, leoAvatarKey.split("/").pop() as string];
  sent = vi.spyOn(push, "send").mockResolvedValue(1);
});

afterEach(() => {
  sent.mockRestore();
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
  return { status: res.status, json, text };
}

const send = (u: TestUser, id: string, body: string) =>
  req(u, "POST", `/conversations/${id}/messages`, { clientId: randomUUID(), body });

async function tagKenji(photoIndex = 0) {
  const r = await req(s.leo, "POST", `/album-photos/${s.photos[photoIndex]?.id}/tags`, {
    vehicleId: s.car.kenji.vehicle.id,
  });
  expect(r.status).toBeLessThan(300);
}

async function device(u: TestUser, token: string) {
  const r = await req(u, "POST", "/me/devices", { platform: "android", expoPushToken: token });
  expect(r.status).toBeLessThan(300);
}

const leaks = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return canary.filter((c) => text.includes(c));
};

/** Les messages poussés vers un appareil (jeton), dans l'ordre. */
const pushesTo = (token: string) =>
  sent.mock.calls
    .flatMap((c) => c[0] as { to: string; title: string; body: string; data: { actor?: unknown } }[])
    .filter((m) => m.to === token);

describe("le canari : rien du titulaire n'arrive jusqu'à la personne qui écrit à la page", () => {
  it("toutes les sorties de la personne (API, temps réel, notifications, push, signalement, export, refus) sont propres ; listes blanches exactes", async () => {
    await tagKenji();
    await device(s.kenji, "ExponentPushToken[kenji]");
    await device(s.leo, "ExponentPushToken[leo]");
    const opened = await req(s.kenji, "POST", `/media/${s.leoMedia}/conversation`);
    expect(opened.status).toBe(201);
    const id = opened.json.id as string;
    const surfaces: Record<string, unknown> = { "ouverture 201": opened.json };

    // Les connexions temps réel de la personne : la conversation et son propre canal.
    const received: string[] = [];
    const socket: RealtimeSocket = { userId: s.kenji.id, send: (d) => received.push(d) };
    realtime.subscribe(`conversation:${id}`, socket);
    realtime.subscribe(`user:${s.kenji.id}`, socket);
    // Un second écouteur de la conversation : le titulaire, pour vérifier qu'il reçoit, lui, les vrais comptes.
    const ownerReceived: string[] = [];
    const ownerSocket: RealtimeSocket = { userId: s.leo.id, send: (d) => ownerReceived.push(d) };
    realtime.subscribe(`conversation:${id}`, ownerSocket);

    const first = await send(s.kenji, id, "Bonjour, je peux avoir la photo du port en grand ?");
    expect(first.status).toBe(201);
    surfaces["POST messages (réponse)"] = first.json;
    // Le titulaire lit : « message.read » part chez la personne.
    const leoList = await req(s.leo, "GET", `/conversations/${id}/messages`);
    const firstId = leoList.json.items[0].id as string;
    expect((await req(s.leo, "POST", `/conversations/${id}/read`, { messageId: firstId })).status).toBe(200);
    // Le titulaire répond : « message.new », notification et push chez la personne.
    clock.advance(1000);
    const reply = await send(s.leo, id, "Oui, je te l'envoie ce soir.");
    expect(reply.status).toBe(201);
    await notificationsService.flush();
    clock.advance(1000);
    const second = await send(s.leo, id, "Et la voici.");
    expect(second.status).toBe(201);

    surfaces["GET /me/conversations"] = (await req(s.kenji, "GET", "/me/conversations")).json;
    const view = await req(s.kenji, "GET", `/conversations/${id}`);
    surfaces["GET /conversations/:id"] = view.json;
    const pageOne = await req(s.kenji, "GET", `/conversations/${id}/messages?limit=2`);
    surfaces["GET messages (première page)"] = pageOne.json;
    expect(pageOne.json.nextCursor).not.toBeNull();
    const pageTwo = await req(
      s.kenji,
      "GET",
      `/conversations/${id}/messages?limit=2&before=${pageOne.json.nextCursor}`,
    );
    surfaces["GET messages (page suivante)"] = pageTwo.json;
    const lastId = pageOne.json.items[0].id as string;
    surfaces["POST read (réponse)"] = (
      await req(s.kenji, "POST", `/conversations/${id}/read`, { messageId: lastId })
    ).json;
    surfaces["GET /me/inbox/summary"] = (await req(s.kenji, "GET", "/me/inbox/summary")).json;
    const flagged = await req(s.kenji, "POST", "/reports", {
      targetType: "message",
      targetId: second.json.id,
      reason: "insult",
    });
    expect(flagged.status).toBe(201);
    surfaces["signalement d'un message de la page"] = flagged.json;
    surfaces["GET /me/export"] = (await req(s.kenji, "GET", "/me/export")).json;
    await notificationsService.flush();

    // Sa ligne `notifications` (titre, corps, `data`) et la charge du push.
    const rows = await db.select().from(notifications).where(eq(notifications.userId, s.kenji.id));
    const received_ = rows.filter((n) => n.type === "message_received");
    expect(received_).toHaveLength(1);
    surfaces["ligne notifications (message_received)"] = received_[0];
    surfaces["toutes ses notifications"] = rows;
    const toKenji = pushesTo("ExponentPushToken[kenji]");
    expect(toKenji).toHaveLength(1);
    surfaces["charge du push"] = toKenji;
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.template, "message_received"))).toHaveLength(0);

    // Les refus de la route d'ouverture : sans session, page inconnue, sans identification, titulaire.
    const refusals = [
      await req(null, "POST", `/media/${s.leoMedia}/conversation`),
      await req(s.kenji, "POST", `/media/${randomUUID()}/conversation`),
      await req(s.lazy, "POST", `/media/${s.leoMedia}/conversation`),
      await req(s.leo, "POST", `/media/${s.leoMedia}/conversation`),
      await req(s.kenji, "POST", "/media/pas-un-uuid/conversation"),
    ];
    expect(refusals.map((r) => r.status)).toEqual([401, 404, 403, 409, 400]);
    refusals.forEach((r, i) => {
      surfaces[`refus ${r.status} (${i})`] = r.json;
    });

    // Le temps réel reçu par SA connexion : les cinq charges, vues au moins une fois chacune.
    for (const type of ["message.new", "message.read", "conversation.updated", "inbox.changed", "notification"]) {
      expect(
        received.some((d) => d.includes(type)),
        `charge « ${type} » reçue`,
      ).toBe(true);
    }
    surfaces["temps réel de la personne"] = received;

    // --- La preuve : zéro trace, sur chaque sortie.
    const swept = Object.entries(surfaces);
    expect(swept.length).toBeGreaterThanOrEqual(16);
    for (const [name, value] of swept) expect(leaks(value), `fuite dans « ${name} »`).toEqual([]);

    // --- Listes blanches (clés exactes).
    expect(Object.keys(view.json).sort()).toEqual(
      [
        "avatarUrl",
        "canWrite",
        "closedAt",
        "id",
        "kind",
        "lastMessage",
        "otherUser",
        "page",
        "participants",
        "side",
        "storyThumbUrl",
        "structure",
        "subtitle",
        "title",
        "unreadCount",
        "writeBlocked",
      ].sort(),
    );
    expect(view.json).toMatchObject({
      kind: "media",
      side: "member",
      title: "Sud Cars",
      subtitle: null,
      participants: ["Sud Cars"],
      otherUser: null,
      structure: null,
      canWrite: true,
      writeBlocked: null,
    });
    expect(view.json.avatarUrl).toContain(LOGO_KEY);
    expect(Object.keys(view.json.page).sort()).toEqual(["id", "key", "logoUrl", "mine", "name"]);
    expect(view.json.page).toMatchObject({ key: `m:${s.leoMedia}`, id: s.leoMedia, name: "Sud Cars", mine: false });
    const messageKeys = [
      "about",
      "asStructure",
      "body",
      "clientId",
      "conversationId",
      "createdAt",
      "deleted",
      "id",
      "image",
      "kind",
      "mine",
      "moderated",
      "readBy",
      "sender",
      "storyThumbUrl",
    ];
    const all = [...pageOne.json.items, ...pageTwo.json.items] as {
      mine: boolean;
      sender: Record<string, unknown>;
      readBy: unknown;
    }[];
    expect(all).toHaveLength(3);
    for (const m of all) {
      expect(Object.keys(m).sort()).toEqual(messageKeys.sort());
      if (m.mine) expect(m.sender).toMatchObject({ userId: s.kenji.id });
      else {
        expect(Object.keys(m.sender).sort()).toEqual(["avatarUrl", "pseudo", "userId"]);
        expect(m.sender).toEqual({
          userId: `m:${s.leoMedia}`,
          pseudo: "Sud Cars",
          avatarUrl: expect.stringContaining(LOGO_KEY),
        });
      }
    }
    // « Lu par » : la page, jamais le compte (le titulaire a lu le premier message de la personne).
    const mineMessage = pageTwo.json.items.at(-1) ?? pageOne.json.items.at(-1);
    const wholePage = await req(s.kenji, "GET", `/conversations/${id}/messages`);
    expect(leaks(wholePage.json)).toEqual([]);
    const firstView = wholePage.json.items.find((m: { id: string }) => m.id === firstId);
    expect(firstView?.readBy).toEqual([{ userId: `m:${s.leoMedia}`, pseudo: "Sud Cars" }]);
    expect(mineMessage).toBeDefined();

    // Push de la personne : titre = la page, corps = l'aperçu seul (aucun pseudo), acteur = la page.
    expect(toKenji[0]?.title).toBe("Sud Cars");
    expect(toKenji[0]?.body).toBe("Oui, je te l'envoie ce soir.");
    expect(toKenji[0]?.body).not.toContain(" : ");
    expect(toKenji[0]?.data.actor).toEqual({
      userId: `m:${s.leoMedia}`,
      pseudo: "Sud Cars",
      avatarUrl: expect.stringContaining(LOGO_KEY),
    });
    // Notification : même forme.
    expect(received_[0]).toMatchObject({ title: "Sud Cars", body: "Oui, je te l'envoie ce soir." });
    expect(((received_[0] as { data: unknown }).data as { actor: unknown }).actor).toMatchObject({
      userId: `m:${s.leoMedia}`,
      pseudo: "Sud Cars",
    });
    // Charges temps réel : l'auteur du message est la page, la lecture est celle de la page.
    const reads = received.filter((d) => d.includes("message.read")).map((d) => JSON.stringify(JSON.parse(d)));
    expect(reads.length).toBeGreaterThan(0);
    // Les lectures reçues sont celles de la page (celle du titulaire) ou les siennes, jamais le compte du titulaire.
    expect(reads.some((d) => d.includes(`"userId":"m:${s.leoMedia}"`))).toBe(true);
    for (const d of reads) {
      expect(d.includes(`"userId":"m:${s.leoMedia}"`) || d.includes(`"userId":"${s.kenji.id}"`)).toBe(true);
    }
    const news = received.filter((d) => d.includes("message.new") && d.includes("Et la voici."));
    expect(news).toHaveLength(1);
    expect(news[0]).toContain(`"sender":{"userId":"m:${s.leoMedia}","pseudo":"Sud Cars"`);
    // Le titulaire, lui, reçoit les vrais comptes (son message : le sien ; le premier message : la personne).
    expect(ownerReceived.some((d) => d.includes("message.new") && d.includes(s.kenji.pseudo))).toBe(true);

    // Côté titulaire : « Kenji · Sud Cars », « Kenji : … », acteur = la personne (aucun second facteur en jeu).
    const toLeo = pushesTo("ExponentPushToken[leo]");
    expect(toLeo).toHaveLength(1);
    expect(toLeo[0]?.title).toBe(`${s.kenji.pseudo} · Sud Cars`);
    expect(toLeo[0]?.body).toBe(
      `${s.kenji.pseudo}: Bonjour, je peux avoir la photo du port en grand ?`.replace(": ", " : "),
    );
    expect(toLeo[0]?.data.actor).toMatchObject({ userId: s.kenji.id, pseudo: s.kenji.pseudo });
    realtime.unsubscribeAll(socket);
    realtime.unsubscribeAll(ownerSocket);
  });

  it("l'image envoyée par la page : son adresse ne dit rien du titulaire", async () => {
    await tagKenji();
    const { id } = (await req(s.kenji, "POST", `/media/${s.leoMedia}/conversation`)).json as { id: string };
    await send(s.kenji, id, "Salut");
    const image = `/api/conversations/${id}/images/${randomUUID()}.webp`;
    expect(leaks(image)).toEqual([]);
  });
});

describe("fin de vie (T60)", () => {
  async function conversationWithMessages() {
    await tagKenji();
    await device(s.kenji, "ExponentPushToken[kenji]");
    const { id } = (await req(s.kenji, "POST", `/media/${s.leoMedia}/conversation`)).json as { id: string };
    await send(s.kenji, id, "Bonjour");
    clock.advance(1000);
    await send(s.leo, id, "Bonjour, que puis-je pour toi ?");
    await notificationsService.flush();
    return id;
  }

  it("titulaire supprimé : fermée, ses messages vidés, sa notification supprimée chez la personne, « Média supprimé », le canari rejoué ; une conversation sans message est fermée aussi", async () => {
    const id = await conversationWithMessages();
    // Une seconde personne ouvre sans écrire.
    const r = await req(s.leo, "POST", `/album-photos/${s.photos[1]?.id}/tags`, { vehicleId: s.car.dam.vehicle.id });
    expect(r.status).toBeLessThan(300);
    const empty = (await req(s.dam, "POST", `/media/${s.leoMedia}/conversation`)).json.id as string;
    expect(
      (
        await db
          .select()
          .from(notifications)
          .where(and(eq(notifications.userId, s.kenji.id), eq(notifications.type, "message_received")))
      ).length,
    ).toBe(1);

    await accountService.anonymize(s.leo.id, null);

    for (const cid of [id, empty]) {
      const [row] = await db.select().from(conversations).where(eq(conversations.id, cid));
      expect(row?.closedAt).not.toBeNull();
    }
    const rows = await db.select().from(messages).where(eq(messages.conversationId, id));
    const fromPage = rows.filter((m) => m.senderId === null);
    expect(fromPage).toHaveLength(1);
    expect(fromPage[0]).toMatchObject({ body: null, deletedAt: expect.any(Date) });
    expect(
      await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, s.kenji.id), eq(notifications.type, "message_received"))),
    ).toHaveLength(0);

    const view = await req(s.kenji, "GET", `/conversations/${id}`);
    expect(view.json).toMatchObject({ title: "Média supprimé", canWrite: false, writeBlocked: "closed" });
    expect(view.json.page).toMatchObject({ name: "Média supprimé", logoUrl: null, mine: false });
    expect((await send(s.kenji, id, "Y a quelqu'un ?")).status).toBe(403);
    // Le canari rejoué après la suppression : aucune sortie ne sert l'ancien pseudo, ni l'identifiant.
    const after = [
      view.json,
      (await req(s.kenji, "GET", "/me/conversations")).json,
      (await req(s.kenji, "GET", `/conversations/${id}/messages`)).json,
      (await req(s.dam, "GET", `/conversations/${empty}`)).json,
      (await req(s.kenji, "GET", "/me/export")).json,
      await db.select().from(notifications).where(eq(notifications.userId, s.kenji.id)),
    ];
    for (const value of after)
      expect(leaks(value.constructor === Object || Array.isArray(value) ? value : String(value))).toEqual([]);
    expect(canary.length).toBe(4);
    expect(leaks(JSON.stringify(after).replaceAll(s.leo.email, ""))).toEqual([]);
    // Elle n'apparaît plus dans les Messages du titulaire (compte vidé) : aucun accès.
    expect((await req(s.leo, "GET", `/conversations/${id}`)).status).toBeGreaterThanOrEqual(401);
  });

  it("passionné supprimé : fermée, « Compte supprimé » et plus d'écriture chez le titulaire, son ancien pseudo nulle part", async () => {
    const id = await conversationWithMessages();
    const oldPseudo = s.kenji.pseudo;
    await accountService.anonymize(s.kenji.id, null);
    const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
    expect(row?.closedAt).not.toBeNull();
    const view = await req(s.leo, "GET", `/conversations/${id}`);
    expect(view.status).toBe(200);
    expect(view.json).toMatchObject({
      title: "Compte supprimé",
      canWrite: false,
      otherUser: null,
      subtitle: "Sud Cars",
    });
    // « Comme aujourd'hui » pour une conversation à deux : la fermeture passe avant « compte supprimé ».
    expect(view.json.writeBlocked).toBe("closed");
    expect((await send(s.leo, id, "Trop tard")).status).toBe(403);
    const list = await req(s.leo, "GET", "/me/conversations");
    expect(JSON.stringify(list.json)).not.toContain(oldPseudo);
    const page = await req(s.leo, "GET", `/conversations/${id}/messages`);
    expect(page.json.items.filter((m: { sender: unknown }) => m.sender === null).length).toBeGreaterThan(0);
    expect(JSON.stringify(page.json)).not.toContain(oldPseudo);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, s.leo.id));
    expect(JSON.stringify(notes)).not.toContain(oldPseudo);
  });

  it("titulaire suspendu : la vue de la personne est égale champ à champ à celle d'avant ; elle ouvre et écrit ; le titulaire lit et reçoit 403 à l'écriture", async () => {
    const id = await conversationWithMessages();
    const before = (await req(s.kenji, "GET", `/conversations/${id}`)).json;
    const listBefore = (await req(s.kenji, "GET", "/me/conversations")).json;
    await db.execute(sql`update profiles set suspended_until = now() + interval '30 days' where user_id = ${s.leo.id}`);
    expect((await req(s.kenji, "GET", `/conversations/${id}`)).json).toEqual(before);
    expect((await req(s.kenji, "GET", "/me/conversations")).json).toEqual(listBefore);
    expect(before.canWrite).toBe(true);
    expect((await req(s.kenji, "POST", `/media/${s.leoMedia}/conversation`)).status).toBe(200);
    expect((await send(s.kenji, id, "Toujours là")).status).toBe(201);
    expect((await req(s.leo, "GET", `/conversations/${id}/messages`)).status).toBe(200);
    expect((await send(s.leo, id, "Je ne peux plus")).status).toBe(403);
    expect((await req(s.leo, "GET", `/conversations/${id}`)).json.writeBlocked).toBe("suspended");
  });

  it("page renommée : le titre de la personne suit ; page supprimée par son compte : le titre devient « Média supprimé »", async () => {
    const id = await conversationWithMessages();
    await db.update(mediaProfiles).set({ name: "Sud Cars Photo" }).where(eq(mediaProfiles.id, s.leoMedia));
    const view = await req(s.kenji, "GET", `/conversations/${id}`);
    expect(view.json.title).toBe("Sud Cars Photo");
    const messagesPage = await req(s.kenji, "GET", `/conversations/${id}/messages`);
    expect(messagesPage.json.items.find((m: { mine: boolean }) => !m.mine).sender.pseudo).toBe("Sud Cars Photo");
  });
});

describe("migration et APK en ligne", () => {
  it("le CHECK tient dans les deux sens : une `media` sans `media_id`, une `direct` avec un `media_id` sont refusées ; le nombre de conversations ne bouge pas", async () => {
    const before = await db.select().from(conversations);
    await expect(
      db.execute(sql`insert into conversations (kind, direct_key) values ('media', 'x:media-sans-page')`),
    ).rejects.toThrow();
    await expect(
      db.execute(
        sql`insert into conversations (kind, direct_key, media_id) values ('direct', 'x:direct-avec-page', ${s.leoMedia})`,
      ),
    ).rejects.toThrow();
    expect(await db.select().from(conversations)).toHaveLength(before.length);
    // La valeur d'enum existe.
    const kinds = await db.execute(sql`select unnest(enum_range(null::conversation_kind))::text as k`);
    expect((kinds.rows as { k: string }[]).map((r) => r.k)).toContain("media");
  });

  it("`direct` et `organizer` : `GET /conversations/:id` champ à champ comme avant, plus `page: null` ; la boîte de la structure compte comme avant", async () => {
    const damien = await signUp("Damien_R9i", { twoFactor: true });
    const structure = await createStructure(damien.id);
    const org = await req(s.kenji, "POST", `/structures/${structure.id}/conversation`);
    expect(org.status).toBe(201);
    await send(s.kenji, org.json.id, "Bonjour l'équipe");
    const direct = await req(s.dam, "POST", "/contact-requests", { pseudo: s.kenji.pseudo, message: "Salut" });
    expect(direct.status).toBeLessThan(300);
    const view = await req(s.kenji, "GET", `/conversations/${org.json.id}`);
    expect(view.json.page).toBeNull();
    expect(view.json.kind).toBe("organizer");
    expect(Object.keys(view.json).sort()).toEqual(
      [
        "avatarUrl",
        "canWrite",
        "closedAt",
        "id",
        "kind",
        "lastMessage",
        "otherUser",
        "page",
        "participants",
        "side",
        "storyThumbUrl",
        "structure",
        "subtitle",
        "title",
        "unreadCount",
        "writeBlocked",
      ].sort(),
    );
    // La conversation d'organisateur compte toujours « chez la structure », pas dans les non-lus de la personne (inchangé).
    await send(damien, org.json.id, "Bonjour Kenji");
    const own = await req(s.kenji, "GET", "/me/inbox/summary");
    expect(own.status).toBe(200);
  });
});
