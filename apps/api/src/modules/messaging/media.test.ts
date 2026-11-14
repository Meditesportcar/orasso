// Lot R9i (T55 à T60) : la conversation de page d'un média. Qui l'ouvre (une personne identifiée sur un album publié du
// média ; la page n'écrit jamais la première), qui la lit (la personne et le titulaire de la page, sans second facteur, et
// personne d'autre), les compteurs, la sorte `media` et ses clés. La vie privée (le compte du titulaire ne sort jamais) est
// dans `media-privacy.test.ts`.
import { randomUUID } from "node:crypto";
import { mediaKey, parseMediaKey } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { quietHours, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { albumPhotoTags, conversations, eventAlbums, events, messages } from "../../db/schema";
import { realtime } from "../../lib/realtime";
import { paris, setAccreditation, softDeleteMedia } from "../albums/albums-test-helpers";
import { type Ref, tagScenario } from "../albums/tags-test-helpers";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let ref: Ref;
let s: Awaited<ReturnType<typeof tagScenario>>;
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  quietHours(false);
  clock = useClock(paris(11, 5, 12));
  ref = await seedReference();
  s = await tagScenario(ref, 4);
});

async function req(
  u: TestUser | null,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...headers,
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

const photo = (i: number) => s.photos[i]?.id as string;
const tagCar = (user: { id: string }, photoIndex: number, key: "dam" | "kenji" | "priv") =>
  req(s.leo, "POST", `/album-photos/${photo(photoIndex)}/tags`, { vehicleId: s.car[key].vehicle.id }).then((r) => {
    expect(r.status).toBeLessThan(300);
    return user;
  });
const tagPseudo = async (userId: string, photoIndex: number) => {
  const r = await req(s.leo, "POST", `/album-photos/${photo(photoIndex)}/tags`, { userId });
  expect(r.status).toBeLessThan(300);
};
const openPage = (u: TestUser | null, mediaId = s.leoMedia) => req(u, "POST", `/media/${mediaId}/conversation`);
const send = (u: TestUser, id: string, body: string) =>
  req(u, "POST", `/conversations/${id}/messages`, { clientId: randomUUID(), body });
const summary = async (u: TestUser) => (await req(u, "GET", "/me/inbox/summary")).json.unreadMessages as number;
const rowsOfPage = () => db.select().from(conversations).where(eq(conversations.kind, "media"));

describe("ouvrir la conversation d'une page (T58)", () => {
  it("identifié par sa voiture ou par son pseudo : 201, puis 200 avec le même identifiant ; deux ouvertures simultanées : une seule ligne", async () => {
    await tagCar(s.dam, 0, "dam");
    await tagPseudo(s.kenji.id, 1);
    const first = await openPage(s.dam);
    expect(first.status).toBe(201);
    expect(Object.keys(first.json).sort()).toEqual(["created", "id"]);
    const again = await openPage(s.dam);
    expect(again.status).toBe(200);
    expect(again.json).toEqual({ id: first.json.id, created: false });
    const both = await Promise.all([openPage(s.kenji), openPage(s.kenji)]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(both[0]?.json.id).toBe(both[1]?.json.id);
    const rows = await rowsOfPage();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.directKey).sort()).toEqual(
      [mediaKey(s.leoMedia, s.dam.id), mediaKey(s.leoMedia, s.kenji.id)].sort(),
    );
    for (const r of rows) {
      expect(r.mediaId).toBe(s.leoMedia);
      expect(r.createdBy).not.toBe(s.leo.id);
    }
  });

  it("sans identification, identification retirée sans conversation, album brouillon ou supprimé : 403 avec le libellé", async () => {
    const refused = await openPage(s.lazy);
    expect(refused.status).toBe(403);
    expect(refused.json.error.message).toBe("Tu peux écrire à un média quand il t'a identifié sur un de ses albums.");
    // Retirée avant l'ouverture.
    await tagCar(s.priv, 0, "priv");
    await db.update(albumPhotoTags).set({ removedAt: new Date(), removedReason: "not_mine" });
    expect((await openPage(s.priv)).status).toBe(403);
    // Album brouillon, puis supprimé, puis de nouveau publié.
    await tagCar(s.kenji, 1, "kenji");
    await db.update(eventAlbums).set({ status: "draft" }).where(eq(eventAlbums.id, s.albumId));
    expect((await openPage(s.kenji)).status).toBe(403);
    await db
      .update(eventAlbums)
      .set({ status: "published", deletedAt: new Date() })
      .where(eq(eventAlbums.id, s.albumId));
    expect((await openPage(s.kenji)).status).toBe(403);
    await db.update(eventAlbums).set({ deletedAt: null }).where(eq(eventAlbums.id, s.albumId));
    expect((await openPage(s.kenji)).status).toBe(201);
    expect(await rowsOfPage()).toHaveLength(1);
  });

  it("l'identification retirée APRÈS l'ouverture : la conversation reste lisible et inscriptible des deux côtés", async () => {
    await tagCar(s.dam, 0, "dam");
    const { id } = (await openPage(s.dam)).json;
    expect((await send(s.dam, id, "Bonjour")).status).toBe(201);
    await db.update(albumPhotoTags).set({ removedAt: new Date(), removedReason: "not_mine" });
    expect((await openPage(s.dam)).status).toBe(200);
    expect((await send(s.dam, id, "Encore moi")).status).toBe(201);
    expect((await send(s.leo, id, "Je te réponds")).status).toBe(201);
    expect((await req(s.dam, "GET", `/conversations/${id}`)).json.canWrite).toBe(true);
  });

  it("sans session : 401 ; titulaire sur sa page : 409 ; page inconnue ou supprimée : 404 ; identifiant mal formé : 400 ; la page n'écrit jamais la première", async () => {
    expect((await openPage(null)).status).toBe(401);
    const own = await openPage(s.leo);
    expect(own.status).toBe(409);
    expect(own.json.error.message).toBe("C'est ta page.");
    expect((await openPage(s.dam, randomUUID())).status).toBe(404);
    expect((await openPage(s.dam, "pas-un-uuid")).status).toBe(400);
    // Aucune route « la page écrit à la personne » : ni `/media/:id/conversations/with/:userId`, ni ouverture à l'envers.
    expect((await req(s.leo, "POST", `/media/${s.leoMedia}/conversations/with/${s.dam.id}`)).status).toBe(404);
    expect((await req(s.leo, "POST", "/conversations/direct", { userId: s.dam.id })).status).toBe(409);
    await tagCar(s.dam, 0, "dam");
    await softDeleteMedia(s.leoMedia);
    expect((await openPage(s.dam)).status).toBe(404);
    expect(await rowsOfPage()).toHaveLength(0);
  });

  it("un titulaire suspendu ou banni ne change rien à l'ouverture (aucun refus ne dit l'état d'un compte)", async () => {
    await tagCar(s.dam, 0, "dam");
    await db.execute(
      (await import("drizzle-orm"))
        .sql`update profiles set suspended_until = now() + interval '30 days' where user_id = ${s.leo.id}`,
    );
    expect((await openPage(s.dam)).status).toBe(201);
    await db.execute(
      (await import("drizzle-orm")).sql`update profiles set banned_at = now() where user_id = ${s.leo.id}`,
    );
    expect((await openPage(s.dam)).status).toBe(200);
  });
});

describe("les conditions de « Tes photos » (sauf le titulaire)", () => {
  it("accréditation retombée, événement annulé, événement sur invitation : 403 ; l'état du titulaire n'y change rien", async () => {
    await tagCar(s.kenji, 0, "kenji");
    const accreditation = (await db.query.applications.findFirst({
      where: (a, { and: all, eq: is }) => all(is(a.eventId, s.event.id), is(a.kind, "media")),
    })) as { id: string };
    await setAccreditation(accreditation.id, "pending");
    expect((await openPage(s.kenji)).status).toBe(403);
    await setAccreditation(accreditation.id, "accepted");
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, s.event.id));
    expect((await openPage(s.kenji)).status).toBe(403);
    await db.update(events).set({ status: "published", admission: "invite_only" }).where(eq(events.id, s.event.id));
    expect((await openPage(s.kenji)).status).toBe(403);
    await db.update(events).set({ admission: "open" }).where(eq(events.id, s.event.id));
    expect((await openPage(s.kenji)).status).toBe(201);
  });
});

describe("qui lit et qui écrit (T56)", () => {
  it("la page n'écrit jamais la première, même en connaissant l'identifiant ; elle répond dès que la personne a écrit", async () => {
    await tagCar(s.dam, 0, "dam");
    const { id } = (await openPage(s.dam)).json as { id: string };
    const view = await req(s.leo, "GET", `/conversations/${id}`);
    expect(view.status).toBe(200);
    expect(view.json).toMatchObject({ canWrite: false, writeBlocked: "closed" });
    expect((await send(s.leo, id, "Coucou, c'est la page")).status).toBe(403);
    expect(await db.select().from(messages).where(eq(messages.conversationId, id))).toHaveLength(0);
    expect((await send(s.dam, id, "Bonjour")).status).toBe(201);
    clock.advance(1000);
    expect((await req(s.leo, "GET", `/conversations/${id}`)).json.canWrite).toBe(true);
    expect((await send(s.leo, id, "Je te réponds")).status).toBe(201);
  });

  async function opened() {
    await tagCar(s.dam, 0, "dam");
    const { id } = (await openPage(s.dam)).json as { id: string };
    expect((await send(s.dam, id, "Bonjour, la photo en grand ?")).status).toBe(201);
    return id;
  }

  it("le titulaire, sans second facteur, liste, lit et répond ; kind « media », côté « member » des deux côtés", async () => {
    const id = await opened();
    // Le titulaire de test n'a prouvé aucun second facteur.
    const list = await req(s.leo, "GET", "/me/conversations");
    expect(list.status).toBe(200);
    expect(list.json.items).toHaveLength(1);
    expect(list.json.items[0]).toMatchObject({
      id,
      kind: "media",
      side: "member",
      title: s.dam.pseudo,
      subtitle: "Sud Cars",
    });
    const view = await req(s.leo, "GET", `/conversations/${id}`);
    expect(view.status).toBe(200);
    expect(view.json).toMatchObject({
      kind: "media",
      side: "member",
      canWrite: true,
      page: { key: `m:${s.leoMedia}`, id: s.leoMedia, name: "Sud Cars", mine: true },
    });
    expect(view.json.otherUser).toMatchObject({ userId: s.dam.id, pseudo: s.dam.pseudo });
    expect((await req(s.leo, "GET", `/conversations/${id}/messages`)).json.items[0].sender.userId).toBe(s.dam.id);
    expect((await send(s.leo, id, "Je te l'envoie ce soir.")).status).toBe(201);
    const mineView = await req(s.dam, "GET", `/conversations/${id}`);
    expect(mineView.json).toMatchObject({
      kind: "media",
      side: "member",
      title: "Sud Cars",
      subtitle: null,
      otherUser: null,
    });
    expect(mineView.json.page).toMatchObject({ key: `m:${s.leoMedia}`, mine: false });
    const rows = await db.select().from(messages).where(eq(messages.conversationId, id));
    expect(rows.every((m) => m.asStructure === false)).toBe(true);
  });

  it("un tiers (autre passionné, organisateur de l'événement avec second facteur, autre média, super admin) : 403 partout, abonnement refusé", async () => {
    const id = await opened();
    const messageId = (await req(s.dam, "GET", `/conversations/${id}/messages`)).json.items[0].id as string;
    const admin = await signUp("Admin_R9i", { twoFactor: true, role: "super_admin" });
    for (const who of [s.kenji, s.orga, s.marc, admin]) {
      expect((await req(who, "GET", `/conversations/${id}`)).status).toBe(403);
      expect((await req(who, "GET", `/conversations/${id}/messages`)).status).toBe(403);
      expect((await send(who, id, "Intrus")).status).toBe(403);
      expect((await req(who, "POST", `/conversations/${id}/read`, { messageId })).status).toBe(403);
      expect((await req(who, "GET", `/conversations/${id}/images/${randomUUID()}.webp`)).status).toBe(403);
      expect(await realtime.canSubscribe(who.id, `conversation:${id}`, { secondFactor: "totp" })).toBe(false);
      expect((await req(who, "GET", "/me/conversations")).json.items).toEqual([]);
    }
    // Les deux lecteurs, eux, s'abonnent.
    expect(await realtime.canSubscribe(s.dam.id, `conversation:${id}`)).toBe(true);
    expect(await realtime.canSubscribe(s.leo.id, `conversation:${id}`)).toBe(true);
  });

  it("l'en-tête X-Orasso-Actor ne change rien, pour personne : la messagerie écrit et lit en son propre nom", async () => {
    const id = await opened();
    for (const [who, header] of [
      [s.dam, `m:${s.leoMedia}`],
      [s.leo, `u:${s.dam.id}`],
      [s.leo, `m:${s.leoMedia}`],
      [s.kenji, `m:${s.leoMedia}`],
    ] as const) {
      const plain = await req(who, "GET", `/conversations/${id}`);
      const withHeader = await req(who, "GET", `/conversations/${id}`, undefined, { "x-orasso-actor": header });
      expect(withHeader.status).toBe(plain.status);
      expect(withHeader.json).toEqual(plain.json);
    }
    const sent = await req(
      s.dam,
      "POST",
      `/conversations/${id}/messages`,
      { clientId: randomUUID(), body: "Avec en-tête" },
      {
        "x-orasso-actor": `m:${s.leoMedia}`,
      },
    );
    expect(sent.status).toBe(201);
    const [row] = await db.select().from(messages).where(eq(messages.id, sent.json.id));
    expect(row?.senderId).toBe(s.dam.id);
    const reply = await req(
      s.leo,
      "POST",
      `/conversations/${id}/messages`,
      { clientId: randomUUID(), body: "Réponse" },
      {
        "x-orasso-actor": `u:${s.dam.id}`,
      },
    );
    const [replyRow] = await db.select().from(messages).where(eq(messages.id, reply.json.id));
    expect(replyRow?.senderId).toBe(s.leo.id);
  });

  it("« À propos de » un événement est refusé (réservé aux conversations avec une structure)", async () => {
    const id = await opened();
    const refused = await req(s.dam, "POST", `/conversations/${id}/messages`, {
      clientId: randomUUID(),
      body: "À propos",
      aboutEventId: s.event.id,
    });
    expect(refused.status).toBe(400);
    expect(refused.json.error.details.field).toBe("aboutEventId");
  });

  it("non-lus : +1 chez le titulaire au message de la personne, +1 chez la personne à la réponse, remis à zéro par la lecture", async () => {
    await tagCar(s.dam, 0, "dam");
    const { id } = (await openPage(s.dam)).json as { id: string };
    expect(await summary(s.leo)).toBe(0);
    await send(s.dam, id, "Premier message");
    expect(await summary(s.leo)).toBe(1);
    expect(await summary(s.dam)).toBe(0);
    const [last] = (await req(s.leo, "GET", `/conversations/${id}/messages`)).json.items as { id: string }[];
    expect((await req(s.leo, "POST", `/conversations/${id}/read`, { messageId: last?.id })).status).toBe(200);
    expect(await summary(s.leo)).toBe(0);
    await send(s.leo, id, "Réponse de la page");
    expect(await summary(s.dam)).toBe(1);
    const [reply] = (await req(s.dam, "GET", `/conversations/${id}/messages`)).json.items as { id: string }[];
    await req(s.dam, "POST", `/conversations/${id}/read`, { messageId: reply?.id });
    expect(await summary(s.dam)).toBe(0);
    // La conversation de page compte aussi dans la liste du titulaire (pas dans la boîte d'une structure).
    expect((await req(s.leo, "GET", "/me/conversations")).json.items[0].unreadCount).toBe(0);
  });

  it("le titulaire suspendu lit et ne peut plus écrire ; la personne, elle, écrit toujours", async () => {
    const id = await opened();
    await db.execute(
      (await import("drizzle-orm"))
        .sql`update profiles set suspended_until = now() + interval '30 days' where user_id = ${s.leo.id}`,
    );
    clock.advance(1000);
    expect((await req(s.leo, "GET", `/conversations/${id}/messages`)).status).toBe(200);
    expect((await send(s.leo, id, "Réponse")).status).toBe(403);
    expect((await send(s.dam, id, "Toujours là")).status).toBe(201);
  });
});

describe("clés et sorte (T55)", () => {
  it("`direct_key` = media:<page>:<compte>, relue sans perte ; un compte réel ne contient pas « : »", async () => {
    await tagCar(s.dam, 0, "dam");
    const { id } = (await openPage(s.dam)).json as { id: string };
    const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
    expect(row?.kind).toBe("media");
    expect(row?.directKey).toBe(`media:${s.leoMedia}:${s.dam.id}`);
    expect(parseMediaKey(row?.directKey)).toEqual({ mediaId: s.leoMedia, userId: s.dam.id });
    expect(s.dam.id).not.toContain(":");
    expect(s.leo.id).not.toContain(":");
  });
});
