// Messagerie (lot 18) : corrections de la relecture — envois réservés aux images de message et purge quotidienne,
// structure suspendue, push sans contenu côté structure, revérification WebSocket, plafond de connexions, droits des
// canaux d'événement avec la preuve de second facteur, anonymisation d'un organisateur.
import { randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createEvent, createStructure, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { adminAuditLog, messages, notifications, structureMembers, structures, uploads } from "../../db/schema";
import { realtime } from "../../lib/realtime";
import { storage } from "../../lib/storage";
import { checkWsSession, MAX_WS_PER_USER, trackConnection } from "../../ws";
import { accountService } from "../account/service";
import { uploadsService } from "../uploads/service";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
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

async function upload(u: TestUser, purpose: string) {
  const data = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 20, b: 200 } } })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(data)], "x.png", { type: "image/png" }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as { key: string } };
}

const send = (u: TestUser, id: string, body: string) =>
  req(u, "POST", `/conversations/${id}/messages`, { clientId: randomUUID(), body });

describe("envois de fichiers (I1)", () => {
  it("seulement les usages qui ont un consommateur (message, annonce, logo de crew, photo de main courante) ; purge des fichiers jamais rattachés", async () => {
    const a = await signUp("Alice");
    for (const purpose of ["provider_photo", "report"]) {
      expect((await upload(a, purpose)).status).toBe(400);
    }
    const pending = await upload(a, "message");
    expect(pending.status).toBe(201);
    const [row] = await db.select().from(uploads).where(eq(uploads.key, pending.json.key));
    // Moins de 24 h : gardé.
    clock.set(new Date((row?.createdAt ?? new Date()).getTime() + 23 * 3_600_000));
    expect(await uploadsService.purgeExpired()).toBe(0);
    clock.set(new Date((row?.createdAt ?? new Date()).getTime() + 25 * 3_600_000));
    expect(await uploadsService.purgeExpired()).toBe(1);
    expect(await db.select().from(uploads).where(eq(uploads.key, pending.json.key))).toHaveLength(0);
    expect(await storage.get(pending.json.key)).toBeNull();
  });
});

async function organizerSetup() {
  const damien = await signUp("Damien", { twoFactor: true });
  const sarah = await signUp("Sarah", { twoFactor: true });
  const kenji = await signUp("Kenji");
  const s = await createStructure(damien.id);
  await db
    .insert(structureMembers)
    .values({ structureId: s.id, userId: sarah.id, role: "co_organizer", status: "active" });
  const opened = await req(kenji, "POST", `/structures/${s.id}/conversation`);
  expect(opened.status).toBe(201);
  return { damien, sarah, kenji, s, id: opened.json.id as string };
}

describe("structure suspendue (I2) et push côté structure (I3)", () => {
  it("push sans contenu pour l'organisateur, avec contenu pour la personne", async () => {
    const { damien, kenji, id } = await organizerSetup();
    expect((await send(kenji, id, "Mon numéro de plaque est AB-123-CD")).status).toBe(201);
    const [toDamien] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, damien.id), eq(notifications.type, "message_received")));
    expect(toDamien?.title).toBe("Club de test");
    expect(toDamien?.body).toBe("Nouveau message pour Club de test");
    expect(JSON.stringify(toDamien)).not.toContain("AB-123-CD");
    expect((await send(damien, id, "Bien reçu")).status).toBe(201);
    const [toKenji] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, kenji.id), eq(notifications.type, "message_received")));
    expect(toKenji?.body).toBe(`${damien.pseudo} : Bien reçu`);
  });

  it("plus d'écriture ni d'ouverture, historique lisible", async () => {
    const { damien, kenji, s, id } = await organizerSetup();
    await send(kenji, id, "Avant la suspension");
    const fan = await signUp("Fan");
    expect((await req(fan, "POST", `/structures/${s.id}/follow`)).status).toBeLessThan(300);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, s.id));

    expect((await send(kenji, id, "Pendant")).status).toBe(403);
    expect((await send(damien, id, "Pendant")).status).toBe(403);
    expect((await req(kenji, "GET", `/conversations/${id}`)).json.writeBlocked).toBe("structure_suspended");
    expect((await req(damien, "GET", `/conversations/${id}`)).json.writeBlocked).toBe("structure_suspended");
    expect((await req(kenji, "GET", `/conversations/${id}/messages`)).json.items).toHaveLength(1);
    expect((await req(damien, "GET", `/conversations/${id}/messages`)).json.items).toHaveLength(1);

    const other = await signUp("Autre");
    const contact = await req(other, "POST", `/structures/${s.id}/conversation`);
    expect(contact.status).toBe(403);
    expect(contact.json.error.message).toBe("Cette structure est suspendue.");
    expect((await req(damien, "POST", `/structures/${s.id}/conversations/with/${fan.id}`)).status).toBe(403);
  });
});

describe("WebSocket (I4, I5)", () => {
  it("revérification : erreur passagère = rien fermé ; session absente = 4401", async () => {
    const failing = async () => {
      throw new Error("base indisponible");
    };
    expect(await checkWsSession(new Headers(), "u1", failing)).toEqual({ action: "retry" });
    expect(await checkWsSession(new Headers(), "u1", async () => null)).toEqual({ action: "close" });
    expect(await checkWsSession(new Headers(), "u1", async () => ({ userId: "u2", secondFactor: null }))).toEqual({
      action: "close",
    });
    expect(await checkWsSession(new Headers(), "u1", async () => ({ userId: "u1", secondFactor: "totp" }))).toEqual({
      action: "keep",
      secondFactor: "totp",
    });
  });

  it("5 connexions au plus par personne : la plus ancienne est fermée", () => {
    const closed: number[] = [];
    const untracks = Array.from({ length: MAX_WS_PER_USER + 1 }, (_, i) =>
      trackConnection("user-plafond", () => closed.push(i)),
    );
    expect(closed).toEqual([0]);
    // Une connexion fermée libère sa place.
    untracks[3]?.();
    trackConnection("user-plafond", () => closed.push(99));
    expect(closed).toEqual([0]);
    for (const u of untracks) u();
  });
});

describe("canaux d'un événement (bug hérité du lot 15)", () => {
  it("la preuve de second facteur de la connexion est transmise ; journal admin au premier abonnement seulement", async () => {
    const damien = await signUp("Damien", { twoFactor: true });
    const admin = await signUp("Admin", { twoFactor: true, role: "super_admin" });
    const s = await createStructure(damien.id);
    const e = await createEvent(s.id);
    const channel = `event:${e.id}:triage`;
    expect(await realtime.canSubscribe(damien.id, channel, { secondFactor: "totp" })).toBe(true);
    expect(await realtime.canSubscribe(damien.id, `event:${e.id}:live`, { secondFactor: "passkey" })).toBe(true);
    // Session ouverte par mot de passe seul : refusé.
    expect(await realtime.canSubscribe(damien.id, channel, { secondFactor: null })).toBe(false);

    const views = () =>
      db
        .select()
        .from(adminAuditLog)
        .where(and(eq(adminAuditLog.actorUserId, admin.id), eq(adminAuditLog.action, "structure.view_as")));
    expect(await realtime.canSubscribe(admin.id, channel, { secondFactor: "totp" })).toBe(true);
    expect(await views()).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      expect(await realtime.canSubscribe(admin.id, channel, { secondFactor: "totp", revalidation: true })).toBe(true);
    }
    expect(await views()).toHaveLength(1);
    expect(await realtime.canSubscribe(admin.id, channel, { secondFactor: null, revalidation: true })).toBe(false);
  });
});

describe("anonymisation d'un organisateur", () => {
  it("les messages écrits au nom de la structure gardent leur texte, sans expéditeur", async () => {
    const { sarah, kenji, id } = await organizerSetup();
    const reply = await send(sarah, id, "Réponse de la structure");
    expect(reply.status).toBe(201);
    await accountService.anonymize(sarah.id, null);
    const [row] = await db.select().from(messages).where(eq(messages.id, reply.json.id));
    expect(row?.body).toBe("Réponse de la structure");
    expect(row?.senderId).toBeNull();
    expect(row?.deletedAt).toBeNull();
    const page = await req(kenji, "GET", `/conversations/${id}/messages`);
    expect(page.json.items[0]).toMatchObject({ body: "Réponse de la structure", asStructure: true, sender: null });
    expect(JSON.stringify(page.json)).not.toContain(sarah.pseudo);
  });
});
