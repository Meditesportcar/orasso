// Communication de l'organisateur (lot 20) : fil public / participants, statut automatique, messages groupés (un
// message par destinataire, lectures, segments, quota des abonnés, tâche par lots), modèles, discussions du staff
// (fenêtres J+1 / J+7, synchronisation), droits (2FA de session, super admin exclu, IDOR), photos, anonymisation.
// Routes sensibles jouées en cookie ET en jeton porteur.
import { randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  suspendByModeration,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  applications,
  conversationParticipants,
  conversations,
  eventAnnouncements,
  groupMessages,
  messages,
  messageTemplates,
  notifications,
  profiles,
  structureBans,
  structureFollows,
  structureMembers,
  structures,
} from "../../db/schema";
import { storage } from "../../lib/storage";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";
import { groupMessagesService } from "./group-messages";
import { staffChatsService } from "./staff-chats";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const MODES = ["cookie", "bearer"] as const;
type Mode = (typeof MODES)[number];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
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
  return { status: res.status, json };
}

async function upload(u: TestUser, purpose: string, mode: Mode = "cookie") {
  const data = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 160, b: 40 } } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(data)], "photo.jpg", { type: "image/jpeg" }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: {
      origin: ORIGIN,
      ...(mode === "cookie" ? { cookie: u.cookie } : { authorization: `Bearer ${bearerOf(u.cookie)}` }),
    },
    body: form,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as { key: string } };
}

/** Structure de Damien (propriétaire, 2FA), un événement dans 2 jours, deux retenus, une en attente. */
async function setup() {
  const ref = await seedReference();
  const damien = await signUp("Damien", { twoFactor: true });
  const s = await createStructure(damien.id);
  const startsAt = new Date(clock.now.getTime() + 2 * DAY);
  const e = await createEvent(s.id, {
    title: "Nocturne de Canet",
    city: "Canet",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 5 * HOUR),
  });
  const people: TestUser[] = [];
  for (const [pseudo, status] of [
    ["Kenji", "accepted"],
    ["Lea", "accepted"],
    ["Nina", "pending"],
  ] as const) {
    const u = await signUp(pseudo);
    const vehicle = await createVehicle(u.id, ref);
    await db.insert(applications).values({
      eventId: e.id,
      userId: u.id,
      vehicleId: vehicle.id,
      status,
      rulesAcceptedAt: new Date(),
      followStructure: false,
    });
    people.push(u);
  }
  const [kenji, lea, nina] = people as [TestUser, TestUser, TestUser];
  return { ref, damien, s, e, kenji, lea, nina };
}

const notificationsOf = (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));

describe("fil de l'événement et consignes", () => {
  for (const mode of MODES) {
    it(`annonce « prévenir » : notification aux inscrits, fil public sans compte (${mode})`, async () => {
      const { damien, e, kenji, lea, nina, s } = await setup();
      const follower = await signUp("Suiveur");
      await db.insert(structureFollows).values({ structureId: s.id, userId: follower.id, source: "manual" });
      const created = await req(
        damien,
        "POST",
        `/events/${e.id}/announcements`,
        { body: "Musique coupée à 22 h. <script>alert(1)</script>", notify: true, pinned: true },
        mode,
      );
      expect(created.status).toBe(201);
      expect(created.json.authorPseudo).toBe(damien.pseudo);
      // Inscrits actifs (retenus et en attente) : push + Journal, jamais d'e-mail.
      for (const u of [kenji, lea, nina]) expect(await notificationsOf(u.id, "event_announcement")).toHaveLength(1);
      // Abonné : une actualité au Journal, sans push.
      expect(await notificationsOf(follower.id, "structure_announcement")).toHaveLength(1);
      await notificationsService.flush();
      // Public, sans compte : visible ; texte rendu tel quel (les clients échappent), sans auteur.
      const pub = await req(null, "GET", `/events/by-slug/${e.slug}/announcements`);
      expect(pub.status).toBe(200);
      expect(pub.json.items).toHaveLength(1);
      expect(pub.json.items[0]).toMatchObject({
        body: "Musique coupée à 22 h. <script>alert(1)</script>",
        pinned: true,
      });
      expect(pub.json.items[0].authorPseudo).toBeUndefined();
      expect(pub.json.items[0].structureName).toBe("Club de test");
    });
  }

  it("annonce réservée aux retenus et consignes : invisibles du public et des non retenus", async () => {
    const { damien, e, kenji, nina } = await setup();
    await req(damien, "POST", `/events/${e.id}/announcements`, {
      body: "Code du portail : 1234",
      audience: "participants",
      notify: true,
    });
    // « Prévenir » d'une annonce réservée : les seuls retenus.
    expect(await notificationsOf(kenji.id, "event_announcement")).toHaveLength(1);
    expect(await notificationsOf(nina.id, "event_announcement")).toHaveLength(0);
    const sent = await req(damien, "POST", `/events/${e.id}/instructions/send`, { instructions: "Arrivée par l'est." });
    expect(sent.status).toBe(200);
    expect(sent.json.recipientsCount).toBe(2);
    expect(await notificationsOf(kenji.id, "event_instructions")).toHaveLength(1);
    expect(await notificationsOf(nina.id, "event_instructions")).toHaveLength(0);
    // Mêmes consignes une seconde fois : refusées (dédoublonnage).
    expect((await req(damien, "POST", `/events/${e.id}/instructions/send`, {})).status).toBe(409);
    for (const viewer of [null, nina]) {
      const feed = await req(viewer, "GET", `/events/by-slug/${e.slug}/announcements`);
      expect(feed.json.items).toHaveLength(0);
    }
    const mine = await req(kenji, "GET", `/events/by-slug/${e.slug}/announcements`, undefined, "bearer");
    expect(mine.json.items.map((i: { kind: string }) => i.kind).sort()).toEqual(["announcement", "instructions"]);
    // Jamais d'e-mail de masse : consignes et annonces partent sans e-mail de repli, même sans appareil.
    await notificationsService.deliverDue();
    const mailed = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, kenji.id)));
    const ours = mailed.filter((n) => n.type === "event_instructions" || n.type === "event_announcement");
    expect(ours.length).toBe(2);
    expect(ours.every((n) => n.deliveredAt && !n.emailSentAt)).toBe(true);
  });

  it("statut : une entrée « Incertain » puis « Maintenu », une seule par changement, et « Annulé »", async () => {
    const { damien, e, kenji } = await setup();
    expect((await req(damien, "PATCH", `/events/${e.id}/outlook`, { outlook: "uncertain" })).status).toBe(200);
    // Même statut renvoyé (double clic) : rien de nouveau.
    await req(damien, "PATCH", `/events/${e.id}/outlook`, { outlook: "uncertain" });
    await req(damien, "PATCH", `/events/${e.id}/outlook`, { outlook: "maintained" });
    let feed = await req(null, "GET", `/events/by-slug/${e.slug}/announcements`);
    expect(feed.json.items.map((i: { body: string }) => i.body)).toEqual([
      "Événement Maintenu : il a bien lieu.",
      "Événement passé en Incertain : l'organisateur confirmera.",
    ]);
    expect(await notificationsOf(kenji.id, "event_outlook_changed")).toHaveLength(2);
    expect((await req(damien, "POST", `/events/${e.id}/cancel`)).status).toBe(200);
    feed = await req(null, "GET", `/events/by-slug/${e.slug}/announcements`);
    expect(feed.json.items[0]).toMatchObject({ kind: "status_change", body: "Événement annulé par l'organisateur." });
  });

  it("modération : épingler, supprimer (photo effacée) ; photo d'annonce réservée aux organisateurs", async () => {
    const { damien, e, kenji } = await setup();
    // Un passionné ne peut pas déposer de photo d'annonce (pas d'hébergement d'images).
    expect((await upload(kenji, "announcement")).status).toBe(403);
    const photo = await upload(damien, "announcement", "bearer");
    expect(photo.status).toBe(201);
    expect(photo.json.key.startsWith("private/announcements/")).toBe(true);
    // Un autre ne peut pas utiliser la photo de Damien.
    const created = await req(damien, "POST", `/events/${e.id}/announcements`, {
      body: "Le plateau est prêt",
      imageKey: photo.json.key,
    });
    expect(created.status).toBe(201);
    const url: string = created.json.image.url;
    const key = url.replace("/api/files/", "");
    expect(key.startsWith("announcements/")).toBe(true);
    expect(await storage.get(key)).not.toBeNull();
    // La clé privée a disparu, la photo ne se réutilise pas.
    expect(await storage.get(photo.json.key)).toBeNull();
    expect(
      (await req(damien, "POST", `/events/${e.id}/announcements`, { body: "Encore", imageKey: photo.json.key })).status,
    ).toBe(400);
    const id = created.json.id;
    expect((await req(damien, "PATCH", `/events/${e.id}/announcements/${id}`, { pinned: true })).json.pinned).toBe(
      true,
    );
    expect((await req(kenji, "DELETE", `/events/${e.id}/announcements/${id}`)).status).toBe(403);
    expect((await req(damien, "DELETE", `/events/${e.id}/announcements/${id}`, undefined, "bearer")).status).toBe(204);
    expect(await storage.get(key)).toBeNull();
    expect((await req(null, "GET", `/events/by-slug/${e.slug}/announcements`)).json.items).toHaveLength(0);
  });
});

describe("droits", () => {
  it("2FA de session, co-organisateur, super admin exclu, structure suspendue, IDOR", async () => {
    const { damien, e, s, kenji } = await setup();
    const sarah = await signUp("Sarah");
    await addMember(s.id, sarah.id, "co_organizer");
    const admin = await signUp("Admin", { twoFactor: true, role: "super_admin" });
    const staff = await signUp("Staffeur", { twoFactor: true });
    await addMember(s.id, staff.id, "staff", ["scan"]);
    const otherOwner = await signUp("Autre", { twoFactor: true });
    const other = await createStructure(otherOwner.id);
    const otherEvent = await createEvent(other.id, { startsAt: new Date(clock.now.getTime() + DAY) });
    const announce = (u: TestUser, eventId: string, mode: Mode = "cookie") =>
      req(u, "POST", `/events/${eventId}/announcements`, { body: "Annonce" }, mode);
    for (const mode of MODES) {
      // Co-organisatrice sans second facteur prouvé par la session.
      expect((await announce(sarah, e.id, mode)).json.error.code).toBe("two_factor_required");
      expect((await announce(kenji, e.id, mode)).status).toBe(403);
      expect((await announce(staff, e.id, mode)).status).toBe(403);
      expect((await announce(admin, e.id, mode)).status).toBe(403);
      // Événement d'une autre structure.
      expect((await announce(damien, otherEvent.id, mode)).status).toBe(403);
      const gm = await req(
        damien,
        "POST",
        `/structures/${other.id}/group-messages`,
        { clientId: randomUUID(), segment: "accepted", eventId: otherEvent.id, body: "x" },
        mode,
      );
      expect(gm.status).toBe(403);
      // Événement d'une autre structure dans un envoi de la sienne : 404, sans fuite.
      const cross = await req(
        damien,
        "POST",
        `/structures/${s.id}/group-messages`,
        { clientId: randomUUID(), segment: "accepted", eventId: otherEvent.id, body: "x" },
        mode,
      );
      expect(cross.status).toBe(404);
      expect((await req(admin, "GET", `/structures/${s.id}/templates`, undefined, mode)).status).toBe(403);
      expect((await req(kenji, "GET", `/structures/${s.id}/inbox/summary`, undefined, mode)).status).toBe(403);
    }
    expect((await announce(damien, e.id)).status).toBe(201);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, s.id));
    expect((await announce(damien, e.id)).status).toBe(403);
    // Historique toujours lisible par l'organisateur.
    expect((await req(damien, "GET", `/structures/${s.id}/group-messages`)).status).toBe(200);
  });
});

describe("messages groupés", () => {
  for (const mode of MODES) {
    it(`aux retenus : un message par destinataire dans sa Boîte, réponse, lectures comptées (${mode})`, async () => {
      const { damien, e, s, kenji, lea, nina } = await setup();
      const preview = await req(
        damien,
        "GET",
        `/structures/${s.id}/group-messages/preview?segment=accepted&eventId=${e.id}`,
        undefined,
        mode,
      );
      expect(preview.json.recipientsCount).toBe(2);
      const clientId = randomUUID();
      const input = {
        clientId,
        segment: "accepted",
        eventId: e.id,
        subject: "Jour J",
        body: "Bonjour {{pseudo}}, rendez-vous à {{event.city}} pour « {{event.title}} ».",
      };
      const sent = await req(damien, "POST", `/structures/${s.id}/group-messages`, input, mode);
      expect(sent.status).toBe(202);
      expect(sent.json.recipientsCount).toBe(2);
      // Même clientId rejoué : le même envoi, rien de nouveau.
      const again = await req(damien, "POST", `/structures/${s.id}/group-messages`, input, mode);
      expect(again.status).toBe(200);
      expect(again.json.groupMessageId).toBe(sent.json.groupMessageId);
      expect(clock.jobs.jobs.filter((j) => j.name === "messaging.group-send")).toHaveLength(1);
      await groupMessagesService.drain(sent.json.groupMessageId);
      // Kenji voit le message dans sa Boîte, au nom de la structure, personnalisé.
      const list = await req(kenji, "GET", "/me/conversations", undefined, mode);
      expect(list.json.items).toHaveLength(1);
      const conversationId = list.json.items[0].id;
      const msgs = await req(kenji, "GET", `/conversations/${conversationId}/messages`, undefined, mode);
      expect(msgs.json.items[0].body).toBe(
        `Jour J\n\nBonjour ${kenji.pseudo}, rendez-vous à Canet pour « Nocturne de Canet ».`,
      );
      expect(msgs.json.items[0].asStructure).toBe(true);
      expect(await notificationsOf(kenji.id, "message_received")).toHaveLength(1);
      // Nina (en attente) n'a rien reçu.
      expect((await req(nina, "GET", "/me/conversations")).json.items).toHaveLength(0);
      // Kenji lit et répond ; la réponse arrive dans « Messages des participants ».
      await req(kenji, "POST", `/conversations/${conversationId}/read`, { messageId: msgs.json.items[0].id }, mode);
      const reply = await req(
        kenji,
        "POST",
        `/conversations/${conversationId}/messages`,
        { clientId: randomUUID(), body: "Merci, j'y serai !" },
        mode,
      );
      expect(reply.status).toBe(201);
      const inbox = await req(damien, "GET", `/structures/${s.id}/conversations`, undefined, mode);
      // Seulement les conversations où la personne a répondu (Léa n'a rien écrit).
      expect(inbox.json.items.map((c: { title: string }) => c.title)).toEqual([kenji.pseudo]);
      expect((await req(damien, "GET", `/structures/${s.id}/inbox/summary`, undefined, mode)).json).toMatchObject({
        participantMessages: 1,
        staffRequests: 0,
      });
      const gm = await req(damien, "GET", `/group-messages/${sent.json.groupMessageId}`, undefined, mode);
      expect(gm.json).toMatchObject({ recipientsCount: 2, sentCount: 2, readCount: 1, status: "sent" });
      // Aucune liste de destinataires exposée.
      expect(JSON.stringify(gm.json)).not.toContain(kenji.id);
      expect(JSON.stringify(gm.json)).not.toContain(lea.pseudo);
    });
  }

  it("abonnés : quota 4 par 30 jours (5e refusé 429), exclusions (supprimé, suspendu, banni, coupé)", async () => {
    const { damien, s } = await setup();
    const followers: TestUser[] = [];
    for (const pseudo of ["Abo1", "Abo2", "Supprime", "Suspendu", "Banni", "Coupe"]) {
      const u = await signUp(pseudo);
      await db.insert(structureFollows).values({ structureId: s.id, userId: u.id, source: "manual" });
      followers.push(u);
    }
    const [, , deleted, suspended, banned, muted] = followers as [
      TestUser,
      TestUser,
      TestUser,
      TestUser,
      TestUser,
      TestUser,
    ];
    await accountService.anonymize(deleted.id, null, { confirm: true });
    // Lot 32 : suspension par la vraie route de la modération.
    await suspendByModeration(suspended, "suspension_7d");
    await db.insert(structureBans).values({ structureId: s.id, userId: banned.id });
    await db
      .update(profiles)
      .set({ mutedTypes: ["structure_announcement"] })
      .where(eq(profiles.userId, muted.id));
    const send = (mode: Mode = "cookie") =>
      req(
        damien,
        "POST",
        `/structures/${s.id}/group-messages`,
        { clientId: randomUUID(), segment: "followers", body: "Nouvelle saison !" },
        mode,
      );
    for (let i = 0; i < 4; i += 1) {
      const r = await send(i % 2 ? "bearer" : "cookie");
      expect(r.status).toBe(202);
      expect(r.json.recipientsCount).toBe(2);
      clock.advance(HOUR);
    }
    const quota = await req(damien, "GET", `/structures/${s.id}/messaging/quota`);
    expect(quota.json.followers).toMatchObject({ quota: 4, used: 4, remaining: 0 });
    const fifth = await send("bearer");
    expect(fifth.status).toBe(429);
    expect(fifth.json.error.code).toBe("follower_quota_exceeded");
    expect(fifth.json.error.details.resetsAt).toBeTruthy();
    // 30 jours après le premier envoi : une place se libère.
    clock.advance(30 * DAY - 3 * HOUR);
    expect((await send()).status).toBe(202);
  });

  it("tâche rejouée : aucun doublon", async () => {
    const { damien, s, e } = await setup();
    const sent = await req(damien, "POST", `/structures/${s.id}/group-messages`, {
      clientId: randomUUID(),
      segment: "pending",
      eventId: e.id,
      body: "Ta candidature est bien reçue",
    });
    const gid = sent.json.groupMessageId as string;
    expect(await groupMessagesService.sendBatch(gid, 2)).toBe(0);
    // Deuxième passage (tâche rejouée) : rien de plus.
    expect(await groupMessagesService.sendBatch(gid, 2)).toBe(0);
    const rows = await db.select().from(messages).where(eq(messages.groupMessageId, gid));
    expect(rows).toHaveLength(1);
  });

  it("lots de taille réduite : 3 destinataires en lots de 2", async () => {
    const { damien, s } = await setup();
    for (const pseudo of ["A1", "A2", "A3"]) {
      const u = await signUp(pseudo);
      await db.insert(structureFollows).values({ structureId: s.id, userId: u.id, source: "manual" });
    }
    const sent = await req(damien, "POST", `/structures/${s.id}/group-messages`, {
      clientId: randomUUID(),
      segment: "followers",
      body: "Bonjour",
    });
    const gid = sent.json.groupMessageId as string;
    const before = clock.jobs.jobs.length;
    expect(await groupMessagesService.sendBatch(gid, 2)).toBe(1);
    expect(clock.jobs.jobs.length).toBe(before + 1);
    expect(await groupMessagesService.sendBatch(gid, 2)).toBe(0);
    const [gm] = await db.select().from(groupMessages).where(eq(groupMessages.id, gid));
    expect(gm).toMatchObject({ status: "sent", sentCount: 3 });
    expect(await db.select().from(messages).where(eq(messages.groupMessageId, gid))).toHaveLength(3);
  });

  it("20 envois par jour et par structure", async () => {
    const { damien, s } = await setup();
    const staff = await signUp("Staffeur");
    await addMember(s.id, staff.id, "staff", ["scan"]);
    for (let i = 0; i < 20; i += 1) {
      const r = await req(damien, "POST", `/structures/${s.id}/group-messages`, {
        clientId: randomUUID(),
        segment: "staff",
        body: `Point ${i}`,
      });
      expect(r.status).toBe(202);
    }
    const over = await req(damien, "POST", `/structures/${s.id}/group-messages`, {
      clientId: randomUUID(),
      segment: "staff",
      body: "Un de trop",
    });
    expect(over.status).toBe(429);
  });
});

describe("modèles", () => {
  it("modèles Orasso en lecture seule, modèles de la structure, IDOR", async () => {
    const { damien, s } = await setup();
    await db
      .insert(messageTemplates)
      .values({ kind: "thanks", name: "Remerciement", body: "Merci {{pseudo}} ! {{review_link}}" });
    const created = await req(damien, "POST", `/structures/${s.id}/templates`, {
      kind: "message",
      name: "Rappel horaires",
      body: "Accueil dès 18 h à {{event.city}}.",
    });
    expect(created.status).toBe(201);
    const list = await req(damien, "GET", `/structures/${s.id}/templates`, undefined, "bearer");
    expect(list.json.items.map((t: { name: string; orasso: boolean }) => [t.name, t.orasso])).toEqual([
      ["Remerciement", true],
      ["Rappel horaires", false],
    ]);
    const orasso = list.json.items[0].id;
    expect((await req(damien, "PATCH", `/structures/${s.id}/templates/${orasso}`, { name: "Piraté" })).status).toBe(
      404,
    );
    expect((await req(damien, "DELETE", `/structures/${s.id}/templates/${orasso}`)).status).toBe(404);
    const otherOwner = await signUp("Autre", { twoFactor: true });
    const other = await createStructure(otherOwner.id);
    expect(
      (await req(otherOwner, "PATCH", `/structures/${other.id}/templates/${created.json.id}`, { name: "x" })).status,
    ).toBe(404);
    expect(
      (await req(damien, "PATCH", `/structures/${s.id}/templates/${created.json.id}`, { name: "Horaires" })).json.name,
    ).toBe("Horaires");
    expect((await req(damien, "DELETE", `/structures/${s.id}/templates/${created.json.id}`)).status).toBe(204);
  });
});

describe("discussions du staff", () => {
  for (const mode of MODES) {
    it(`événement : le staff écrit à J−1, refusé après J+1 ; l'organisateur lit à J+6, pas à J+8 (${mode})`, async () => {
      const { damien, s, e } = await setup();
      const staff = await signUp("Staffeur");
      await addMember(s.id, staff.id, "staff", ["scan"]);
      const outsider = await signUp("Curieux");
      // J−1 (l'événement commence dans 2 jours ; on se place la veille).
      clock.set(new Date(e.startsAt.getTime() - DAY));
      const chat = await req(staff, "GET", `/events/${e.id}/staff-conversation`, undefined, mode);
      expect(chat.status).toBe(200);
      expect(chat.json).toMatchObject({ kind: "event_staff", open: true });
      const id = chat.json.conversationId;
      expect((await req(outsider, "GET", `/events/${e.id}/staff-conversation`, undefined, mode)).status).toBe(403);
      expect((await req(outsider, "GET", `/conversations/${id}/messages`, undefined, mode)).status).toBe(403);
      const write = (u: TestUser) =>
        req(u, "POST", `/conversations/${id}/messages`, { clientId: randomUUID(), body: "Parking B plein" }, mode);
      expect((await write(staff)).status).toBe(201);
      expect((await req(damien, "GET", `/conversations/${id}/messages`, undefined, mode)).json.items).toHaveLength(1);
      // J+1 passé : plus d'écriture ; le staff ne lit plus.
      clock.set(new Date(e.endsAt.getTime() + DAY + 60_000));
      await staffChatsService.closeEventChat(e.id);
      const refused = await write(staff);
      expect(refused.status).toBe(403);
      expect((await req(staff, "GET", `/conversations/${id}/messages`, undefined, mode)).status).toBe(403);
      expect((await req(staff, "GET", `/events/${e.id}/staff-conversation`, undefined, mode)).json.error.code).toBe(
        "conversation_closed",
      );
      expect((await write(damien)).json.error.code).toBe("conversation_closed");
      // Le staff a quitté la conversation (plus de non-lus ni de liste).
      const [row] = await db
        .select()
        .from(conversationParticipants)
        .where(and(eq(conversationParticipants.conversationId, id), eq(conversationParticipants.userId, staff.id)));
      expect(row?.leftAt).not.toBeNull();
      // Organisateur : lit à J+6, pas à J+8.
      clock.set(new Date(e.endsAt.getTime() + 6 * DAY));
      expect((await req(damien, "GET", `/conversations/${id}/messages`, undefined, mode)).status).toBe(200);
      clock.set(new Date(e.endsAt.getTime() + 8 * DAY));
      expect((await req(damien, "GET", `/conversations/${id}/messages`, undefined, mode)).status).toBe(403);
    });
  }

  it("créée à la publication ; synchronisation à l'arrivée d'un staff ; permanente de la structure", async () => {
    const { damien, s } = await setup();
    const draft = await createEvent(s.id, {
      status: "draft",
      publishedAt: null,
      startsAt: new Date(clock.now.getTime() + 5 * DAY),
      endsAt: new Date(clock.now.getTime() + 5 * DAY + 4 * HOUR),
    });
    expect((await req(damien, "POST", `/events/${draft.id}/publish`)).status).toBe(200);
    const [chat] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.kind, "event_staff"), eq(conversations.eventId, draft.id)));
    expect(chat).toBeTruthy();
    // Un staff invité qui accepte devient participant des discussions ouvertes.
    const staff = await signUp("Nouveau");
    const permanent = await req(damien, "GET", `/structures/${s.id}/staff-conversation`);
    expect(permanent.status).toBe(200);
    expect(
      (
        await req(damien, "POST", `/structures/${s.id}/members`, {
          pseudo: staff.pseudo,
          role: "staff",
          staffRoles: ["scan"],
        })
      ).status,
    ).toBe(201);
    expect((await req(staff, "POST", `/me/memberships/${s.id}/accept`)).status).toBe(204);
    const rows = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(and(eq(conversationParticipants.userId, staff.id), isNull(conversationParticipants.leftAt)));
    expect(rows.map((r) => r.conversationId).sort()).toEqual([chat?.id, permanent.json.conversationId].sort());
    // Elles apparaissent dans sa Boîte dès qu'un message y est écrit.
    await req(damien, "POST", `/conversations/${permanent.json.conversationId}/messages`, {
      clientId: randomUUID(),
      body: "Bienvenue !",
    });
    expect((await req(staff, "GET", "/me/conversations", undefined, "bearer")).json.items[0]).toMatchObject({
      kind: "structure_staff",
      unreadCount: 1,
    });
    // Retiré : plus d'accès.
    expect((await req(damien, "DELETE", `/structures/${s.id}/members/${staff.id}`)).status).toBe(204);
    expect((await req(staff, "GET", `/conversations/${permanent.json.conversationId}/messages`)).status).toBe(403);
    // Liste côté organisateur : permanente + événements.
    const list = await req(damien, "GET", `/structures/${s.id}/staff-conversations`);
    expect(list.json.items.map((c: { kind: string }) => c.kind)).toEqual(["structure_staff", "event_staff"]);
  });

  it("balayage : fermeture à J+1 (le staff quitte), purge à un an", async () => {
    const { damien, e, s } = await setup();
    const staff = await signUp("Staffeur");
    await addMember(s.id, staff.id, "staff", ["scan"]);
    const chat = await req(damien, "GET", `/events/${e.id}/staff-conversation`);
    await req(damien, "POST", `/conversations/${chat.json.conversationId}/messages`, {
      clientId: randomUUID(),
      body: "x",
    });
    expect(await staffChatsService.sweep()).toEqual({ closed: 0, purged: 0 });
    clock.set(new Date(e.endsAt.getTime() + DAY + 60_000));
    expect(await staffChatsService.sweep()).toEqual({ closed: 1, purged: 0 });
    const [row] = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, chat.json.conversationId),
          eq(conversationParticipants.userId, staff.id),
        ),
      );
    expect(row?.leftAt).not.toBeNull();
    // Rien de plus au passage suivant.
    expect(await staffChatsService.sweep()).toEqual({ closed: 0, purged: 0 });
    clock.set(new Date(e.endsAt.getTime() + 366 * DAY));
    expect(await staffChatsService.sweep()).toEqual({ closed: 0, purged: 1 });
    expect(await db.select().from(conversations).where(eq(conversations.id, chat.json.conversationId))).toHaveLength(0);
  });
});

describe("anonymisation", () => {
  it("annonces et messages groupés gardent leur texte au nom de la structure, l'auteur disparaît", async () => {
    const { s, e, kenji } = await setup();
    const sarah = await signUp("Sarah", { twoFactor: true });
    await addMember(s.id, sarah.id, "co_organizer");
    await req(sarah, "POST", `/events/${e.id}/announcements`, { body: "Annonce de Sarah" });
    const sent = await req(sarah, "POST", `/structures/${s.id}/group-messages`, {
      clientId: randomUUID(),
      segment: "accepted",
      eventId: e.id,
      body: "Message de Sarah",
    });
    await groupMessagesService.drain(sent.json.groupMessageId);
    await db.update(structureMembers).set({ status: "removed" }).where(eq(structureMembers.userId, sarah.id));
    await accountService.anonymize(sarah.id, null, { confirm: true });
    const [a] = await db.select().from(eventAnnouncements).where(eq(eventAnnouncements.eventId, e.id));
    expect(a).toMatchObject({ authorId: null, body: "Annonce de Sarah" });
    const [gm] = await db.select().from(groupMessages).where(eq(groupMessages.id, sent.json.groupMessageId));
    expect(gm).toMatchObject({ authorId: null, body: "Message de Sarah" });
    const list = await req(kenji, "GET", "/me/conversations");
    const msgs = await req(kenji, "GET", `/conversations/${list.json.items[0].id}/messages`);
    expect(msgs.json.items[0]).toMatchObject({ body: "Message de Sarah", sender: null, asStructure: true });
  });
});

describe("corrections de la relecture", () => {
  it("I1 : lot suivant jamais planifié → le balayage termine l'envoi, sans doublon", async () => {
    const { damien, s } = await setup();
    for (const pseudo of ["B1", "B2", "B3"]) {
      const u = await signUp(pseudo);
      await db.insert(structureFollows).values({ structureId: s.id, userId: u.id, source: "manual" });
    }
    const sent = await req(damien, "POST", `/structures/${s.id}/group-messages`, {
      clientId: randomUUID(),
      segment: "followers",
      body: "Bonjour",
    });
    const gid = sent.json.groupMessageId as string;
    // Premier lot de 2 ; la tâche du lot suivant reste dans la file en mémoire (jamais exécutée).
    expect(await groupMessagesService.sendBatch(gid, 2)).toBe(1);
    // Moins de 2 minutes : le balayage n'y touche pas.
    expect(await groupMessagesService.sweep()).toBe(0);
    await db
      .update(groupMessages)
      .set({ updatedAt: sql`now() - interval '3 minutes'` })
      .where(eq(groupMessages.id, gid));
    expect(await groupMessagesService.sweep()).toBe(1);
    const [gm] = await db.select().from(groupMessages).where(eq(groupMessages.id, gid));
    expect(gm).toMatchObject({ status: "sent", sentCount: 3 });
    expect(await db.select().from(messages).where(eq(messages.groupMessageId, gid))).toHaveLength(3);
    // Un message envoyé n'est plus repris.
    await db
      .update(groupMessages)
      .set({ updatedAt: sql`now() - interval '3 minutes'` })
      .where(eq(groupMessages.id, gid));
    expect(await groupMessagesService.sweep()).toBe(0);
  });

  it("I2 : inscrits d'un événement fini depuis plus de 7 jours → 409 (cookie et porteur)", async () => {
    const { damien, s, e } = await setup();
    clock.set(new Date(e.endsAt.getTime() + 6 * DAY));
    const ok = await req(damien, "GET", `/structures/${s.id}/group-messages/preview?segment=accepted&eventId=${e.id}`);
    expect(ok.status).toBe(200);
    clock.set(new Date(e.endsAt.getTime() + 8 * DAY));
    for (const mode of MODES) {
      for (const segment of ["accepted", "waitlisted", "pending", "providers", "checked_in"]) {
        const r = await req(
          damien,
          "POST",
          `/structures/${s.id}/group-messages`,
          { clientId: randomUUID(), segment, eventId: e.id, body: "Revenez !" },
          mode,
        );
        expect(r.status).toBe(409);
      }
    }
    // Les abonnés restent joignables (dans leur quota), l'événement ne servant qu'aux variables.
    const follower = await signUp("Abo");
    await db.insert(structureFollows).values({ structureId: s.id, userId: follower.id, source: "manual" });
    const followers = await req(damien, "POST", `/structures/${s.id}/group-messages`, {
      clientId: randomUUID(),
      segment: "followers",
      eventId: e.id,
      body: "À l'année prochaine pour {{event.title}}",
    });
    expect(followers.status).toBe(202);
  });

  it("banni entre la création et l'envoi : sauté ; texte trop long après remplacement : 400", async () => {
    const { damien, s, e, kenji, lea } = await setup();
    const sent = await req(damien, "POST", `/structures/${s.id}/group-messages`, {
      clientId: randomUUID(),
      segment: "accepted",
      eventId: e.id,
      body: "Bonjour",
    });
    await db.insert(structureBans).values({ structureId: s.id, userId: lea.id });
    await groupMessagesService.drain(sent.json.groupMessageId);
    const rows = await db.select().from(messages).where(eq(messages.groupMessageId, sent.json.groupMessageId));
    expect(rows).toHaveLength(1);
    expect((await req(kenji, "GET", "/me/conversations")).json.items).toHaveLength(1);
    expect((await req(lea, "GET", "/me/conversations")).json.items).toHaveLength(0);
    const long = await req(damien, "POST", `/structures/${s.id}/group-messages`, {
      clientId: randomUUID(),
      segment: "accepted",
      eventId: e.id,
      body: `${"x".repeat(1980)} {{pseudo}}`,
    });
    expect(long.status).toBe(400);
    expect(long.json.error.message).toContain("trop long");
  });
});
