// Lot 24 : staff côté site (demandes, invitations, retrait), rôle boutique (billets du public, compteur d'entrées),
// direct par catégorie, photo de la main courante, position de l'alerte. Chaque route sensible est exercée en cookie
// ET en jeton porteur ; les scénarios hors ligne (rejeu, deux appareils) passent par l'API de synchro.
import { randomUUID } from "node:crypto";
import { fromWallTime, STAFF_PENDING_MAX, STAFF_REQUEST_COOLDOWN_MS } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
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
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  categories,
  devices,
  events,
  incidents,
  notifications,
  profiles,
  staffAlerts,
  structureMembers,
  structures,
  ticketScans,
  tickets,
  vehicleCategories,
  visitorEntries,
} from "../../db/schema";
import { applicationsService } from "../applications/service";
import { fieldService } from "../field/service";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const MODES = ["cookie", "bearer"] as const;
type Mode = (typeof MODES)[number];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let clock: ReturnType<typeof useClock>;

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
  return { status: res.status, json, res };
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

async function device(userId: string, name = "Pixel") {
  const [d] = await db.insert(devices).values({ userId, platform: "android", name }).returning();
  return d!.id;
}

/**
 * Structure vérifiée de Damien (propriétaire, 2FA), « Salon Argelès » demain, boutique activée, billets gratuits
 * ouverts ; Léa a le rôle boutique, Théo seulement le scan ; Kenji est un visiteur avec un billet.
 */
async function setup() {
  const ref = await seedReference();
  const damien = await signUp("Damien", { twoFactor: true });
  const s = await createStructure(damien.id);
  const lea = await signUp("Lea_Shop");
  const theo = await signUp("Theo_Scan");
  const kenji = await signUp("Kenji_Visiteur");
  await addMember(s.id, lea.id, "staff", ["shop"]);
  await addMember(s.id, theo.id, "staff", ["scan"]);
  const startsAt = new Date(clock.now.getTime() + DAY);
  const e = await createEvent(s.id, {
    title: "Salon Argelès",
    city: "Argelès",
    lat: 42.546,
    lng: 3.024,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 8 * HOUR),
    publicAccess: "free_reservation",
    shopEnabled: true,
  });
  expect((await req(damien, "PUT", `/events/${e.id}/ticketing`, { enabled: true, capacity: 20 })).status).toBe(200);
  const bought = await req(kenji, "POST", `/events/${e.id}/tickets/reserve`, { quantity: 2 });
  expect(bought.status).toBe(201);
  const payloads: string[] = bought.json.map((t: { payload: string }) => t.payload);
  const ids: string[] = bought.json.map((t: { id: string }) => t.id);
  return { ref, damien, s, lea, theo, kenji, e, payloads, ids };
}

const scanItem = (rawPayload: string, over: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  rawPayload,
  decision: "ok",
  reason: null,
  scannedAt: clock.now.toISOString(),
  ...over,
});

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
});

describe("devenir staff : demande, réponse, délais", () => {
  it("demande → requested → acceptée sans rôle (lot 36, rôles par événement) → staff actif ; notifications et compteurs", async () => {
    const w = await setup();
    const nina = await signUp("Nina_Candidate");
    for (const mode of MODES) {
      const user = mode === "cookie" ? nina : await signUp("Nina_Bearer");
      const asked = await req(
        user,
        "POST",
        `/structures/${w.s.id}/staff-requests`,
        { message: "Dispo le week-end" },
        mode,
      );
      expect(asked.status).toBe(201);
      expect(asked.json).toEqual({ status: "requested" });
      // Répéter la demande en cours est sans effet (une seule notification à l'organisateur).
      expect((await req(user, "POST", `/structures/${w.s.id}/staff-requests`, {}, mode)).status).toBe(201);
    }
    await notificationsService.flush();
    const org = await db.select().from(notifications).where(eq(notifications.userId, w.damien.id));
    expect(org.filter((n) => n.type === "staff_request")).toHaveLength(2);
    const members = (await req(w.damien, "GET", `/structures/${w.s.id}/members`)).json;
    expect(members.filter((m: { status: string }) => m.status === "requested")).toHaveLength(2);
    const summary = await req(w.damien, "GET", `/structures/${w.s.id}/inbox/summary`);
    expect(summary.json.staffRequests).toBe(2);

    // Un simple utilisateur ne répond pas aux demandes ; l'organisateur d'une autre structure non plus.
    expect((await req(nina, "POST", `/structures/${w.s.id}/members/${nina.id}/accept`, {})).status).toBe(403);
    const otherOwner = await signUp("Autre_Orga", { twoFactor: true });
    const otherStructure = await createStructure(otherOwner.id);
    expect((await req(otherOwner, "POST", `/structures/${w.s.id}/members/${nina.id}/accept`, {})).status).toBe(403);
    // Une demande qui n'existe pas dans CETTE structure : introuvable.
    expect(
      (await req(otherOwner, "POST", `/structures/${otherStructure.id}/members/${nina.id}/accept`, {})).status,
    ).toBe(404);

    // Une ancienne version de l'appli envoie encore des rôles : ils sont ignorés.
    const accept = await req(w.damien, "POST", `/structures/${w.s.id}/members/${nina.id}/accept`, {
      staffRoles: ["scan", "placement"],
      canDecide: true,
    });
    expect(accept.status).toBe(204);
    const row = await db.query.structureMembers.findFirst({
      where: and(eq(structureMembers.structureId, w.s.id), eq(structureMembers.userId, nina.id)),
    });
    expect(row).toMatchObject({ status: "active", role: "staff", staffRoles: [], canDecide: false });
    await notificationsService.flush();
    const mine = await db.select().from(notifications).where(eq(notifications.userId, nina.id));
    expect(mine.map((n) => n.type)).toContain("staff_request_accepted");
    // Plus de demande en attente pour elle : une deuxième réponse ne trouve rien.
    expect((await req(w.damien, "POST", `/structures/${w.s.id}/members/${nina.id}/accept`, {})).status).toBe(404);
    const ninaEvents = await req(nina, "GET", "/me/staff-events");
    expect(ninaEvents.json.map((m: { event: { id: string } }) => m.event.id)).toContain(w.e.id);
  });

  it("refus : la demande disparaît, la même personne attend 24 h ; un membre actif ne redemande pas", async () => {
    const w = await setup();
    const nina = await signUp("Nina_Refusee");
    await req(nina, "POST", `/structures/${w.s.id}/staff-requests`, {});
    expect((await req(w.damien, "POST", `/structures/${w.s.id}/members/${nina.id}/decline`)).status).toBe(204);
    const again = await req(nina, "POST", `/structures/${w.s.id}/staff-requests`, {});
    expect(again.status).toBe(409);
    clock.advance(STAFF_REQUEST_COOLDOWN_MS + 60_000);
    expect((await req(nina, "POST", `/structures/${w.s.id}/staff-requests`, {})).status).toBe(201);
    // Membre actif : conflit.
    expect((await req(w.lea, "POST", `/structures/${w.s.id}/staff-requests`, {})).status).toBe(409);
  });

  it("structure non vérifiée, banni, file pleine, sans compte", async () => {
    const w = await setup();
    const nina = await signUp("Nina_Candidate");
    const orgaB = await signUp("OrgaB", { twoFactor: true });
    const unverified = await createStructure(orgaB.id, false);
    expect((await req(nina, "POST", `/structures/${unverified.id}/staff-requests`, {})).status).toBe(404);
    expect((await req(null, "POST", `/structures/${w.s.id}/staff-requests`, {})).status).toBe(401);
    await req(w.damien, "POST", `/structures/${w.s.id}/bans`, { pseudo: nina.pseudo, reason: null });
    expect((await req(nina, "POST", `/structures/${w.s.id}/staff-requests`, {})).status).toBe(403);
    // File bornée : STAFF_PENDING_MAX demandes en attente, la suivante est refusée.
    const crowd = [];
    for (let i = 0; i < STAFF_PENDING_MAX; i++) crowd.push(await signUp(`Fan_${i}`));
    for (const u of crowd) {
      await db.insert(structureMembers).values({
        structureId: w.s.id,
        userId: u.id,
        role: "staff",
        status: "requested",
      });
    }
    const late = await signUp("Retardataire");
    const full = await req(late, "POST", `/structures/${w.s.id}/staff-requests`, {});
    expect(full.status).toBe(409);
  });
});

describe("invitations de staff", () => {
  it("l'invité reçoit une notification et un compteur ; lui seul accepte ; pas de doublon ni de rafale", async () => {
    const w = await setup();
    const nina = await signUp("Nina_Invitee");
    const intruder = await signUp("Intrus");
    for (const mode of MODES) {
      const invite = await req(
        w.damien,
        "POST",
        `/structures/${w.s.id}/members`,
        { pseudo: nina.pseudo, role: "staff", staffRoles: ["shop"], canDecide: false },
        mode,
      );
      if (mode === "cookie") expect(invite.status).toBe(201);
      // Deuxième invitation : déjà invité.
      else expect(invite.status).toBe(409);
    }
    await notificationsService.flush();
    expect(
      (await db.select().from(notifications).where(eq(notifications.userId, nina.id))).map((n) => n.type),
    ).toContain("staff_invitation");
    const summary = await req(nina, "GET", "/me/inbox/summary");
    expect(summary.json.requests.staffInvitation).toBe(1);
    // Un autre compte ne peut pas accepter à sa place (il n'a pas d'invitation).
    expect((await req(intruder, "POST", `/me/memberships/${w.s.id}/accept`)).status).toBe(404);
    expect((await req(nina, "POST", `/me/memberships/${w.s.id}/accept`, undefined, "bearer")).status).toBe(204);
    expect((await req(nina, "GET", "/me/inbox/summary")).json.requests.staffInvitation).toBe(0);
    const row = await db.query.structureMembers.findFirst({
      where: and(eq(structureMembers.structureId, w.s.id), eq(structureMembers.userId, nina.id)),
    });
    expect(row).toMatchObject({ status: "active", staffRoles: ["shop"] });
    // Une invitation déjà acceptée ne se rejoue pas.
    expect((await req(nina, "POST", `/me/memberships/${w.s.id}/accept`)).status).toBe(404);
  });

  it("refus de l'invité : pas de relance avant 24 h ; un staff ne peut pas inviter", async () => {
    const w = await setup();
    const nina = await signUp("Nina_Refuse");
    const invite = () =>
      req(w.damien, "POST", `/structures/${w.s.id}/members`, {
        pseudo: nina.pseudo,
        role: "staff",
        staffRoles: [],
        canDecide: false,
      });
    expect((await invite()).status).toBe(201);
    expect((await req(nina, "POST", `/me/memberships/${w.s.id}/decline`)).status).toBe(204);
    expect((await invite()).status).toBe(409);
    clock.advance(STAFF_REQUEST_COOLDOWN_MS + 60_000);
    expect((await invite()).status).toBe(201);
    // Staff : pas d'invitation (réservé aux organisateurs).
    const res = await req(w.lea, "POST", `/structures/${w.s.id}/members`, {
      pseudo: "Autre",
      role: "staff",
      staffRoles: [],
      canDecide: false,
    });
    expect(res.status).toBe(403);
  });

  it("inviter quelqu'un qui a demandé à rejoindre le staff l'accepte d'emblée", async () => {
    const w = await setup();
    const nina = await signUp("Nina_Demande");
    await req(nina, "POST", `/structures/${w.s.id}/staff-requests`, {});
    const res = await req(w.damien, "POST", `/structures/${w.s.id}/members`, {
      pseudo: nina.pseudo,
      role: "staff",
      staffRoles: ["placement"],
      canDecide: false,
    });
    expect(res.status).toBe(201);
    const row = await db.query.structureMembers.findFirst({
      where: and(eq(structureMembers.structureId, w.s.id), eq(structureMembers.userId, nina.id)),
    });
    expect(row).toMatchObject({ status: "active", staffRoles: ["placement"] });
  });

  it("retrait : l'accès hors ligne est coupé au prochain contact", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() - 2 * HOUR));
    expect((await req(w.lea, "GET", `/events/${w.e.id}/staff/sync`)).status).toBe(200);
    expect((await req(w.damien, "DELETE", `/structures/${w.s.id}/members/${w.lea.id}`)).status).toBe(204);
    expect((await req(w.lea, "GET", `/events/${w.e.id}/staff/sync`)).status).toBe(403);
    // Ses envois en file (lots de billets) sont refusés aussi.
    const d = await device(w.lea.id);
    const refused = await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, {
      deviceId: d,
      items: [scanItem(w.payloads[0] as string)],
    });
    expect(refused.status).toBe(403);
    expect((await req(w.lea, "GET", "/me/staff-events")).json).toEqual([]);
  });
});

describe("rôle boutique : synchro et contrôle des billets", () => {
  it("la synchro ne porte les billets qu'au rôle boutique, boutique activée ; différentielle par curseur", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() - 2 * HOUR));
    for (const mode of MODES) {
      const shop = await req(w.lea, "GET", `/events/${w.e.id}/staff/sync`, undefined, mode);
      expect(shop.status).toBe(200);
      expect(shop.json.shopEnabled).toBe(true);
      expect(shop.json.tickets).toHaveLength(2);
      expect(shop.json.tickets[0]).toMatchObject({ status: "valid", holderLabel: w.kenji.pseudo, typeLabel: "Entrée" });
      // Pas d'identité au-delà du pseudo public.
      expect(Object.keys(shop.json.tickets[0]).sort()).toEqual(
        ["holderLabel", "status", "ticketId", "typeLabel", "updatedAt", "usedAt"].sort(),
      );
    }
    const scanOnly = await req(w.theo, "GET", `/events/${w.e.id}/staff/sync`);
    expect(scanOnly.status).toBe(200);
    expect(scanOnly.json.tickets).toBeUndefined();
    expect(scanOnly.json.shopEnabled).toBeUndefined();
    // Boutique désactivée : plus de billets, même pour le rôle boutique.
    await db.update(events).set({ shopEnabled: false });
    const off = await req(w.lea, "GET", `/events/${w.e.id}/staff/sync`);
    expect(off.json.tickets).toBeUndefined();
    await db.update(events).set({ shopEnabled: true });
    // Différentielle : un billet utilisé depuis le curseur revient, pas les autres.
    const first = await req(w.lea, "GET", `/events/${w.e.id}/staff/sync`);
    const d = await device(w.lea.id);
    clock.advance(60_000);
    await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, {
      deviceId: d,
      items: [scanItem(w.payloads[0] as string)],
    });
    const delta = await req(
      w.lea,
      "GET",
      `/events/${w.e.id}/staff/sync?since=${encodeURIComponent(first.json.cursor)}`,
    );
    expect(delta.json.full).toBe(false);
    expect(delta.json.tickets.map((t: { ticketId: string }) => t.ticketId)).toContain(w.ids[0]);
    expect(delta.json.tickets.find((t: { ticketId: string }) => t.ticketId === w.ids[0]).status).toBe("used");
  });

  it("scan : OK puis déjà utilisé ; rejeu du même identifiant sans double comptage ; deux téléphones", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() - HOUR));
    const d1 = await device(w.lea.id, "Pixel 1");
    const lea2 = await signUp("Lea_Autre");
    await addMember(w.s.id, lea2.id, "staff", ["shop"]);
    const d2 = await device(lea2.id, "Pixel 2");
    for (const mode of MODES) {
      const item = scanItem(w.payloads[mode === "cookie" ? 0 : 1] as string);
      const r1 = await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, { deviceId: d1, items: [item] }, mode);
      expect(r1.status).toBe(200);
      expect(r1.json.results[0]).toMatchObject({ id: item.id, result: "accepted", ticketName: "Entrée" });
      // Rejeu après une coupure réseau : même réponse, aucune écriture de plus.
      const replay = await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, { deviceId: d1, items: [item] }, mode);
      expect(replay.json.results[0]).toMatchObject({ id: item.id, result: "accepted" });
      // Autre lecture du même billet, ailleurs : déjà utilisé.
      const other = scanItem(w.payloads[mode === "cookie" ? 0 : 1] as string);
      const r2 = await req(lea2, "POST", `/events/${w.e.id}/ticket-scans`, { deviceId: d2, items: [other] }, mode);
      expect(r2.json.results[0]).toMatchObject({ result: "already" });
    }
    const rows = await db.select().from(ticketScans).where(eq(ticketScans.eventId, w.e.id));
    expect(rows.filter((r) => r.serverResult === "accepted")).toHaveLength(2);
    expect(rows).toHaveLength(4);
    const used = await db.select().from(tickets).where(eq(tickets.eventId, w.e.id));
    expect(used.every((t) => t.status === "used" && t.usedBy === w.lea.id && t.usedByDeviceId === d1)).toBe(true);
    // Un identifiant déjà reçu d'un autre staff est refusé (pas d'écrasement, rien de révélé).
    const stolen = scanItem(w.payloads[0] as string);
    await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, { deviceId: d1, items: [stolen] });
    const hijack = await req(lea2, "POST", `/events/${w.e.id}/ticket-scans`, { deviceId: d2, items: [stolen] });
    expect(hijack.json.results[0]).toMatchObject({ result: "rejected" });
  });

  it("lot hors ligne : le même billet lu deux fois dans le lot compte une fois ; compteurs du direct", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() - HOUR));
    const d = await device(w.lea.id);
    const items = [
      scanItem(w.payloads[0] as string),
      scanItem(w.payloads[0] as string),
      scanItem(w.payloads[1] as string),
    ];
    const res = await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, { deviceId: d, items });
    expect(res.json.results.map((r: { result: string }) => r.result)).toEqual(["accepted", "already", "accepted"]);
    const live = await req(w.damien, "GET", `/events/${w.e.id}/live`);
    expect(live.json.tickets).toEqual({ sold: 2, used: 2 });
  });

  it("refus : falsifié, illisible, autre événement, billet annulé, QR d'inscription", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() - HOUR));
    const d = await device(w.lea.id);
    // Autre événement de la même structure, avec son billet.
    const e2 = await createEvent(w.s.id, {
      title: "Autre salon",
      startsAt: new Date(clock.now.getTime() + 3 * DAY),
      publicAccess: "free_reservation",
      shopEnabled: true,
    });
    await req(w.damien, "PUT", `/events/${e2.id}/ticketing`, { enabled: true, capacity: 5 });
    const bought = await req(w.kenji, "POST", `/events/${e2.id}/tickets/reserve`, { quantity: 1 });
    const foreign = bought.json[0].payload as string;
    const forged = `${(w.payloads[0] as string).slice(0, -4)}AAAA`;
    const cases: [string, string][] = [
      [foreign, "other_event"],
      [forged, "forged"],
      ["OB1PASUNVRAIBILLET", "malformed"],
      ["https://exemple.fr/promo", "malformed"],
    ];
    for (const [payload, reason] of cases) {
      const res = await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, {
        deviceId: d,
        items: [scanItem(payload)],
      });
      expect(res.json.results[0]).toMatchObject({ result: "refused", reason });
    }
    // Annulé par son titulaire avant la lecture.
    await req(w.kenji, "DELETE", `/tickets/${w.ids[0]}`);
    const cancelled = await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, {
      deviceId: d,
      items: [scanItem(w.payloads[0] as string)],
    });
    expect(cancelled.json.results[0]).toMatchObject({ result: "refused", reason: "cancelled" });
    // Le billet de l'événement 2 lu sur l'événement 1 n'a rien utilisé.
    const t2 = await db.select().from(tickets).where(eq(tickets.eventId, e2.id));
    expect(t2[0]?.status).toBe("valid");
  });

  it("accès : rôle boutique requis, boutique activée, autre événement et autre structure fermés", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() - HOUR));
    const dLea = await device(w.lea.id);
    const dTheo = await device(w.theo.id);
    const body = (deviceId: string) => ({ deviceId, items: [scanItem(w.payloads[0] as string)] });
    // Théo n'a que le scan : ni billets, ni compteur.
    expect((await req(w.theo, "POST", `/events/${w.e.id}/ticket-scans`, body(dTheo))).status).toBe(403);
    expect(
      (
        await req(w.theo, "POST", `/events/${w.e.id}/visitor-entries`, {
          items: [{ id: randomUUID(), delta: 1, at: clock.now }],
        })
      ).status,
    ).toBe(403);
    // Visiteur ordinaire, anonyme.
    expect((await req(w.kenji, "POST", `/events/${w.e.id}/ticket-scans`, body(dLea))).status).toBe(403);
    expect((await req(null, "POST", `/events/${w.e.id}/ticket-scans`, body(dLea))).status).toBe(401);
    // L'appareil d'un autre compte n'est pas le sien.
    expect((await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, body(dTheo))).status).toBe(400);
    // Staff boutique d'une AUTRE structure : fermé.
    const otherOwner = await signUp("Autre_Orga", { twoFactor: true });
    const other = await createStructure(otherOwner.id);
    const stranger = await signUp("Staff_Voisin");
    await addMember(other.id, stranger.id, "staff", ["shop"]);
    const dStranger = await device(stranger.id);
    expect((await req(stranger, "POST", `/events/${w.e.id}/ticket-scans`, body(dStranger))).status).toBe(403);
    expect((await req(stranger, "GET", `/events/${w.e.id}/staff/sync`)).status).toBe(403);
    // Rôle ajusté pour l'événement : Léa perd la boutique ici → fermé.
    await req(w.damien, "PATCH", `/events/${w.e.id}/staff/${w.lea.id}`, { roles: ["scan"] });
    expect((await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, body(dLea))).status).toBe(403);
    await req(w.damien, "PATCH", `/events/${w.e.id}/staff/${w.lea.id}`, { roles: null });
    // Boutique désactivée : l'envoi n'est pas refusé en bloc, chaque lecture reçoit « rejected » et reste consignée.
    await db.update(events).set({ shopEnabled: false });
    const off = await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, body(dLea));
    expect(off.status).toBe(200);
    expect(off.json.results[0]).toMatchObject({ result: "rejected", reason: "shop_disabled" });
    expect(
      (await db.select().from(ticketScans).where(eq(ticketScans.serverResult, "rejected"))).map((r) => r.reason),
    ).toEqual(["shop_disabled"]);
    expect((await db.select().from(tickets)).every((t) => t.status === "valid")).toBe(true);
    await db.update(events).set({ shopEnabled: true });
    expect((await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, body(dLea))).status).toBe(200);
    // Organisateur : accès d'office (2FA de session).
    const dDamien = await device(w.damien.id);
    expect((await req(w.damien, "POST", `/events/${w.e.id}/ticket-scans`, body(dDamien))).status).toBe(200);
  });

  it("fenêtre : avant la veille et après le règlement, chaque lecture est rejetée avec sa raison", async () => {
    const w = await setup();
    const d = await device(w.lea.id);
    const send = () =>
      req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, { deviceId: d, items: [scanItem(w.payloads[0] as string)] });
    clock.set(new Date(w.e.startsAt.getTime() - 3 * DAY));
    expect((await send()).json.results[0]).toMatchObject({ result: "rejected", reason: "locked" });
    clock.set(new Date(w.e.endsAt.getTime() + 4 * DAY));
    expect((await send()).json.results[0]).toMatchObject({ result: "rejected", reason: "settled" });
    expect((await db.select().from(tickets)).every((t) => t.status === "valid")).toBe(true);
  });

  it("identifiant déjà pris par un autre événement : rejeté, le billet n'est pas touché (jamais 500)", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() - HOUR));
    const d = await device(w.lea.id);
    const e2 = await createEvent(w.s.id, {
      title: "Autre",
      startsAt: new Date(clock.now.getTime() + 3 * DAY),
      shopEnabled: true,
    });
    const shared = randomUUID();
    await db.insert(ticketScans).values({
      id: shared,
      eventId: e2.id,
      staffUserId: w.lea.id,
      localDecision: "ok",
      scannedAt: clock.now,
      receivedAt: clock.now,
      serverResult: "refused",
    });
    const res = await req(w.lea, "POST", `/events/${w.e.id}/ticket-scans`, {
      deviceId: d,
      items: [scanItem(w.payloads[0] as string, { id: shared })],
    });
    expect(res.status).toBe(200);
    expect(res.json.results[0]).toMatchObject({ result: "rejected" });
    expect(
      (
        await db
          .select()
          .from(tickets)
          .where(eq(tickets.id, w.ids[0] as string))
      )[0]?.status,
    ).toBe("valid");
  });
});

describe("rôle boutique : compteur d'entrées des visiteurs", () => {
  it("idempotent par identifiant, total tous appareils, jamais négatif, valeurs limitées", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() - HOUR));
    const d = await device(w.lea.id);
    const a = { id: randomUUID(), delta: 10, at: clock.now.toISOString() };
    const b = { id: randomUUID(), delta: 1, at: clock.now.toISOString() };
    for (const mode of MODES) {
      const res = await req(w.lea, "POST", `/events/${w.e.id}/visitor-entries`, { deviceId: d, items: [a, b] }, mode);
      expect(res.status).toBe(200);
      // Rejeu du même lot (coupure réseau) : rien n'est compté deux fois.
      expect(res.json.total).toBe(11);
    }
    const lea2 = await signUp("Lea_Deux");
    await addMember(w.s.id, lea2.id, "staff", ["shop"]);
    const minus = { id: randomUUID(), delta: -1, at: clock.now.toISOString() };
    const r = await req(lea2, "POST", `/events/${w.e.id}/visitor-entries`, { items: [minus] });
    expect(r.json).toMatchObject({ total: 10, results: [{ id: minus.id, applied: true }] });
    // Le total ne descend pas sous zéro.
    const big = [1, 2, 3].map(() => ({ id: randomUUID(), delta: -10, at: clock.now.toISOString() }));
    expect((await req(w.lea, "POST", `/events/${w.e.id}/visitor-entries`, { items: big })).json.total).toBe(0);
    const rows = await db.select().from(visitorEntries).where(eq(visitorEntries.eventId, w.e.id));
    expect(rows).toHaveLength(6);
    // Valeurs hors de ±1 et ±10 refusées.
    const bad = await req(w.lea, "POST", `/events/${w.e.id}/visitor-entries`, {
      items: [{ id: randomUUID(), delta: 5, at: clock.now.toISOString() }],
    });
    expect(bad.status).toBe(400);
    const live = await req(w.damien, "GET", `/events/${w.e.id}/live`);
    expect(live.json.visitors).toBe(0);
    // Le staff ne lit pas le direct.
    expect((await req(w.lea, "GET", `/events/${w.e.id}/live`)).status).toBe(403);
  });
});

describe("direct par catégorie, prestataires, main courante avec photo, alerte avec position", () => {
  it("live.byCategory : attendus / arrivés par catégorie principale", async () => {
    const w = await setup();
    const [muscle] = await db
      .insert(categories)
      .values({ slug: "muscle", label: "Muscle car", position: 5 })
      .returning();
    const people = [await signUp("Kenji_Fan"), await signUp("Nina_Fan")];
    const cars = [];
    for (const u of people) {
      const car = await createVehicle(u.id, w.ref);
      await db.insert(vehicleCategories).values({ vehicleId: car.id, categoryId: muscle!.id });
      cars.push(car);
    }
    const orga = await viewerOf(w.damien);
    const created = [];
    for (const [i, u] of people.entries()) {
      const [a] = await applicationsService.apply(await viewerOf(u), w.e.id, {
        vehicleIds: [cars[i]!.id],
        rulesAccepted: true,
        followStructure: true,
        newsletterOptIn: false,
        companions: 0,
        message: null,
      });
      await applicationsService.decide(orga, w.e.id, a!.id, { decision: "accept", sendReasons: true, note: null });
      created.push(a!);
    }
    clock.set(new Date(w.e.startsAt.getTime() + HOUR));
    const first = created[0]!;
    expect(
      (await req(w.damien, "POST", `/events/${w.e.id}/checkins`, { applicationId: first.id, method: "manual" })).status,
    ).toBe(201);
    const live = await req(w.damien, "GET", `/events/${w.e.id}/live`);
    const row = live.json.byCategory.find((c: { slug: string }) => c.slug === "muscle");
    expect(row).toMatchObject({ expected: 2, arrived: 1, label: "Muscle car" });
    expect(live.json.providers).toEqual({ expected: 0, arrived: 0 });
  });

  it("incident avec photo : envoyée après coup, rattachée une fois, privée", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() + HOUR));
    const clientId = randomUUID();
    for (const mode of MODES) {
      const made = await req(
        w.lea,
        "POST",
        `/events/${w.e.id}/incidents`,
        {
          clientId: mode === "cookie" ? clientId : randomUUID(),
          occurredAt: clock.now.toISOString(),
          location: "Entrée A",
          description: "Rétroviseur arraché",
        },
        mode,
      );
      expect(made.status).toBe(201);
    }
    // (L'horloge simulée est en avance sur la base : chaque envoi purge les fichiers en attente plus vieux que 24 h
    // du même compte. On envoie donc la bonne photo en dernier.)
    const julie = await signUp("Julie_Scan");
    await addMember(w.s.id, julie.id, "staff", ["scan"]);
    const julPhoto = await upload(julie, "incident");
    const wrong = await upload(w.lea, "message");
    const photo = await upload(w.lea, "incident");
    expect(photo.status).toBe(201);
    // Un autre staff ne peut pas y joindre sa photo ; ni utiliser la photo d'un autre.
    expect(
      (await req(julie, "PATCH", `/events/${w.e.id}/incidents/${clientId}`, { photoKey: julPhoto.json.key })).status,
    ).toBe(403);
    expect(
      (await req(w.lea, "PATCH", `/events/${w.e.id}/incidents/${clientId}`, { photoKey: julPhoto.json.key })).status,
    ).toBe(404);
    // Pas le bon usage : un fichier « message » n'est pas une photo de main courante.
    expect(
      (await req(w.lea, "PATCH", `/events/${w.e.id}/incidents/${clientId}`, { photoKey: wrong.json.key })).status,
    ).toBe(404);
    const ok = await req(
      w.lea,
      "PATCH",
      `/events/${w.e.id}/incidents/${clientId}`,
      { photoKey: photo.json.key },
      "bearer",
    );
    expect(ok.json).toMatchObject({ hasPhoto: true, location: "Entrée A" });
    expect(ok.status).toBe(200);
    // Rejouer la même photo : sans effet. Une autre : refusée (pièce d'assurance).
    expect(
      (await req(w.lea, "PATCH", `/events/${w.e.id}/incidents/${clientId}`, { photoKey: photo.json.key })).status,
    ).toBe(200);
    const second = await upload(w.lea, "incident");
    expect(
      (await req(w.lea, "PATCH", `/events/${w.e.id}/incidents/${clientId}`, { photoKey: second.json.key })).status,
    ).toBe(409);
    // Lecture : staff de l'événement et organisation ; jamais le public, ni une autre structure.
    const list = await req(w.damien, "GET", `/events/${w.e.id}/incidents`);
    const incident = list.json.find((i: { hasPhoto: boolean }) => i.hasPhoto);
    expect(incident.hasPhoto).toBe(true);
    for (const mode of MODES) {
      const img = await req(w.damien, "GET", `/events/${w.e.id}/incidents/${incident.id}/photo`, undefined, mode);
      expect(img.status).toBe(200);
      expect(img.res.headers.get("content-type")).toBe("image/webp");
      expect(img.res.headers.get("cache-control")).toContain("no-store");
    }
    expect((await req(w.kenji, "GET", `/events/${w.e.id}/incidents/${incident.id}/photo`)).status).toBe(403);
    const otherOwner = await signUp("Autre_Orga", { twoFactor: true });
    await createStructure(otherOwner.id);
    expect((await req(otherOwner, "GET", `/events/${w.e.id}/incidents/${incident.id}/photo`)).status).toBe(403);
    // Une photo n'est jamais servie par le chemin public des fichiers.
    const row = await db.query.incidents.findFirst({ where: eq(incidents.id, incident.id) });
    expect(row?.photoKey).toMatch(/^private\/incidents\//);
    const direct = await app.request(`/api/files/${row?.photoKey}`);
    expect(direct.status).toBe(404);
  });

  it("alerte avec position : envoyée à l'action, distance à l'entrée, effacée à la clôture et au bout de 24 h", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() + HOUR));
    const first = randomUUID();
    const sent = await req(w.lea, "POST", `/events/${w.e.id}/alerts`, {
      clientId: first,
      message: "Bagarre à l'entrée B",
      lat: 42.5465,
      lng: 3.0245,
    });
    expect(sent.status).toBe(201);
    // Rejeu : même alerte.
    const replay = await req(
      w.lea,
      "POST",
      `/events/${w.e.id}/alerts`,
      { clientId: first, message: "x", lat: 1, lng: 1 },
      "bearer",
    );
    expect(replay.json.id).toBe(sent.json.id);
    // Une moitié de position n'est pas enregistrée.
    const half = await req(w.lea, "POST", `/events/${w.e.id}/alerts`, {
      clientId: randomUUID(),
      message: "Sans GPS",
      lat: 42.5,
    });
    expect(half.json).toMatchObject({ lat: null, lng: null });
    for (const mode of MODES) {
      const list = await req(w.damien, "GET", `/events/${w.e.id}/alerts`, undefined, mode);
      const a = list.json.find((x: { id: string }) => x.id === sent.json.id);
      expect(a).toMatchObject({ lat: 42.5465, lng: 3.0245, pseudo: w.lea.pseudo });
      expect(a.distanceM).toBeGreaterThan(20);
      expect(a.distanceM).toBeLessThan(200);
      expect(list.json.find((x: { id: string }) => x.id === half.json.id).distanceM).toBeNull();
    }
    // Les notifications ne gardent aucune coordonnée.
    await notificationsService.flush();
    const notes = await db.select().from(notifications).where(eq(notifications.userId, w.damien.id));
    const alert = notes.find((n) => n.type === "staff_alert" && n.body.includes("Bagarre"));
    expect(alert?.body).toContain("position partagée");
    expect(alert?.body).not.toContain("42.54");
    expect(alert?.body).not.toContain("3.02");
    // Un visiteur ou un staff d'un autre événement ne lit pas les alertes.
    expect((await req(w.kenji, "GET", `/events/${w.e.id}/alerts`)).status).toBe(403);
    // Clôture : la position disparaît avec l'alerte.
    expect((await req(w.damien, "POST", `/events/${w.e.id}/alerts/${sent.json.id}/resolve`)).status).toBe(200);
    const closed = (await req(w.damien, "GET", `/events/${w.e.id}/alerts`)).json.find(
      (x: { id: string }) => x.id === sent.json.id,
    );
    expect(closed).toMatchObject({ lat: null, lng: null, distanceM: null });
    expect(closed.resolvedAt).not.toBeNull();
    // Alerte laissée ouverte : la tâche efface la position après 24 h.
    const stale = await req(w.lea, "POST", `/events/${w.e.id}/alerts`, {
      clientId: randomUUID(),
      message: "Oubliée",
      lat: 42.54,
      lng: 3.02,
    });
    clock.advance(25 * HOUR);
    expect(await fieldService.sweep()).toMatchObject({ positions: 1 });
    const left = await db.query.staffAlerts.findFirst({ where: eq(staffAlerts.id, stale.json.id) });
    expect(left).toMatchObject({ lat: null, lng: null });
  });

  it("photos de main courante effacées un an après la fin de l'événement", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() + HOUR));
    const clientId = randomUUID();
    await req(w.lea, "POST", `/events/${w.e.id}/incidents`, {
      clientId,
      occurredAt: clock.now.toISOString(),
      description: "Verre brisé",
    });
    const photo = await upload(w.lea, "incident");
    await req(w.lea, "PATCH", `/events/${w.e.id}/incidents/${clientId}`, { photoKey: photo.json.key });
    clock.advance(200 * DAY);
    expect((await fieldService.sweep()).photos).toBe(0);
    clock.advance(200 * DAY);
    expect((await fieldService.sweep()).photos).toBe(1);
    const row = await db.query.incidents.findFirst({ where: eq(incidents.clientId, clientId) });
    expect(row?.photoKey).toBeNull();
    expect(row?.description).toBe("Verre brisé");
  });
});

describe("structure suspendue, relances, appartenances", () => {
  it("structure suspendue : plus de demande, d'invitation ni d'acceptation ; le staff en place garde son accès", async () => {
    const w = await setup();
    const nina = await signUp("Nina_Demande");
    await req(nina, "POST", `/structures/${w.s.id}/staff-requests`, {});
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, w.s.id));
    const other = await signUp("Autre_Fan");
    expect((await req(other, "POST", `/structures/${w.s.id}/staff-requests`, {})).status).toBe(404);
    expect(
      (
        await req(w.damien, "POST", `/structures/${w.s.id}/members`, {
          pseudo: other.pseudo,
          role: "staff",
          staffRoles: [],
          canDecide: false,
        })
      ).status,
    ).toBe(403);
    expect((await req(w.damien, "POST", `/structures/${w.s.id}/members/${nina.id}/accept`, {})).status).toBe(403);
    // Refuser reste possible ; le staff déjà en place n'est pas touché.
    expect((await req(w.damien, "POST", `/structures/${w.s.id}/members/${nina.id}/decline`)).status).toBe(204);
    clock.set(new Date(w.e.startsAt.getTime() - 2 * HOUR));
    expect((await req(w.lea, "GET", `/events/${w.e.id}/staff/sync`)).status).toBe(200);
  });

  it("invitations simultanées : la seconde répond 409, jamais 500 ; le plafond vaut aussi pour une demande promue en co-organisateur", async () => {
    const w = await setup();
    const nina = await signUp("Nina_Double");
    const invite = () =>
      req(w.damien, "POST", `/structures/${w.s.id}/members`, {
        pseudo: nina.pseudo,
        role: "staff",
        staffRoles: [],
        canDecide: false,
      });
    const [a, b] = await Promise.all([invite(), invite()]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    // Plafond atteint : même une personne qui a demandé ne passe pas en invitation de co-organisateur.
    const crowd = [];
    for (let i = 0; i < STAFF_PENDING_MAX; i++) crowd.push(await signUp(`Foule_${i}`));
    for (const u of crowd) {
      await db
        .insert(structureMembers)
        .values({ structureId: w.s.id, userId: u.id, role: "staff", status: "requested" });
    }
    const asked = crowd[0] as TestUser;
    const res = await req(w.damien, "POST", `/structures/${w.s.id}/members`, {
      pseudo: asked.pseudo,
      role: "co_organizer",
      staffRoles: [],
      canDecide: false,
    });
    expect(res.status).toBe(409);
  });

  it("invitation : refusée à accepter par un compte suspendu ou pour une structure suspendue", async () => {
    const w = await setup();
    const nina = await signUp("Nina_Suspendue");
    await req(w.damien, "POST", `/structures/${w.s.id}/members`, {
      pseudo: nina.pseudo,
      role: "staff",
      staffRoles: [],
      canDecide: false,
    });
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, w.s.id));
    expect((await req(nina, "POST", `/me/memberships/${w.s.id}/accept`)).status).toBe(403);
    await db.update(structures).set({ verification: "verified" }).where(eq(structures.id, w.s.id));
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + DAY) })
      .where(eq(profiles.userId, nina.id));
    expect((await req(nina, "POST", `/me/memberships/${w.s.id}/accept`)).status).toBe(403);
    await db.update(profiles).set({ suspendedUntil: null }).where(eq(profiles.userId, nina.id));
    expect((await req(nina, "POST", `/me/memberships/${w.s.id}/accept`)).status).toBe(204);
  });

  it("l'alerte : la position n'est lisible que de l'organisation, pas du staff", async () => {
    const w = await setup();
    clock.set(new Date(w.e.startsAt.getTime() + HOUR));
    const sent = await req(w.lea, "POST", `/events/${w.e.id}/alerts`, {
      clientId: randomUUID(),
      message: "Aide",
      lat: 42.5465,
      lng: 3.0245,
    });
    const org = (await req(w.damien, "GET", `/events/${w.e.id}/alerts`)).json.find(
      (x: { id: string }) => x.id === sent.json.id,
    );
    expect(org.lat).toBe(42.5465);
    const staffView = (await req(w.theo, "GET", `/events/${w.e.id}/alerts`)).json.find(
      (x: { id: string }) => x.id === sent.json.id,
    );
    expect(staffView).toMatchObject({ lat: null, lng: null, distanceM: null, message: "Aide" });
  });

  it("« Relancer » : ceux qui n'ont pas répondu, une fois par jour, jamais après le début ; réservé à l'organisation", async () => {
    const w = await setup();
    // Événement dans 4 jours : ni le jour J ni le début ne ferment encore les relances.
    await db
      .update(events)
      .set({
        startsAt: new Date(clock.now.getTime() + 4 * DAY),
        endsAt: new Date(clock.now.getTime() + 4 * DAY + 8 * HOUR),
      })
      .where(eq(events.id, w.e.id));
    w.e.startsAt = new Date(clock.now.getTime() + 4 * DAY);
    for (const mode of MODES) {
      const first = await req(w.damien, "POST", `/events/${w.e.id}/staff/remind`, {}, mode);
      if (mode === "cookie") {
        expect(first.status).toBe(200);
        expect(first.json.reminded).toBe(2);
      } else {
        // Déjà relancés aujourd'hui.
        expect(first.json.reminded).toBe(0);
      }
    }
    await notificationsService.flush();
    const leaNotes = await db.select().from(notifications).where(eq(notifications.userId, w.lea.id));
    expect(leaNotes.filter((n) => n.type === "staff_presence_reminder")).toHaveLength(1);
    const list = await req(w.damien, "GET", `/events/${w.e.id}/staff`);
    expect(list.json.find((m: { userId: string }) => m.userId === w.lea.id)).toMatchObject({ reminderCount: 1 });
    // Le lendemain : une seule personne.
    clock.advance(20 * HOUR);
    const one = await req(w.damien, "POST", `/events/${w.e.id}/staff/remind`, { userId: w.theo.id });
    expect(one.json.reminded).toBe(1);
    expect((await req(w.damien, "POST", `/events/${w.e.id}/staff/remind`, { userId: "inconnu" })).status).toBe(404);
    // Staff : pas de relance ; le jour J et au début de l'événement : fermé.
    expect((await req(w.lea, "POST", `/events/${w.e.id}/staff/remind`, {})).status).toBe(403);
    clock.set(new Date(w.e.startsAt.getTime() - 2 * HOUR));
    expect((await req(w.damien, "POST", `/events/${w.e.id}/staff/remind`, {})).status).toBe(423);
    clock.set(new Date(w.e.startsAt.getTime() + 1));
    expect((await req(w.damien, "POST", `/events/${w.e.id}/staff/remind`, {})).status).toBe(423);
  });

  it("double clic et alias du lot 22 : une seule relance par jour, même route de fond", async () => {
    const w = await setup();
    await db
      .update(events)
      .set({
        startsAt: new Date(clock.now.getTime() + 4 * DAY),
        endsAt: new Date(clock.now.getTime() + 4 * DAY + 8 * HOUR),
      })
      .where(eq(events.id, w.e.id));
    // Deux envois simultanés : une seule ligne mise à jour par personne, une seule notification.
    const [a, b] = await Promise.all([
      req(w.damien, "POST", `/events/${w.e.id}/staff/remind`, { userId: w.lea.id }),
      req(w.damien, "POST", `/events/${w.e.id}/staff/${w.lea.id}/remind`, undefined, "bearer"),
    ]);
    // La route de fond rend toujours 200 ; l'alias rend 409 s'il perd la course, 200 s'il la gagne : l'ordre d'arrivée
    // des deux requêtes n'est pas garanti (en parallèle sur un PC chargé). L'invariant est la notification unique.
    expect(a.status).toBe(200);
    expect([200, 409]).toContain(b.status);
    await notificationsService.flush();
    const notes = await db.select().from(notifications).where(eq(notifications.userId, w.lea.id));
    expect(notes.filter((n) => n.type === "staff_presence_reminder")).toHaveLength(1);
    // L'alias suit la règle du jour : relancé aujourd'hui → 409 ; le lendemain → 200 avec la forme du lot 22.
    expect((await req(w.damien, "POST", `/events/${w.e.id}/staff/${w.lea.id}/remind`)).status).toBe(409);
    clock.advance(DAY);
    const next = await req(w.damien, "POST", `/events/${w.e.id}/staff/${w.lea.id}/remind`);
    expect(next).toMatchObject({ status: 200, json: { reminded: true } });
  });

  it("GET /me : la demande de staff envoyée apparaît dans les appartenances (« requested »)", async () => {
    const w = await setup();
    const nina = await signUp("Nina_Suivie");
    await req(nina, "POST", `/structures/${w.s.id}/staff-requests`, {});
    for (const mode of MODES) {
      const me = await req(nina, "GET", "/me", undefined, mode);
      expect(me.json.memberships).toEqual([
        expect.objectContaining({ structureSlug: w.s.slug, role: "staff", status: "requested", staffRoles: [] }),
      ]);
    }
    // Un compte qui a demandé n'a aucun accès : pas d'événement de staff, pas de synchro.
    expect((await req(nina, "GET", "/me/staff-events")).json).toEqual([]);
    clock.set(new Date(w.e.startsAt.getTime() - HOUR));
    expect((await req(nina, "GET", `/events/${w.e.id}/staff/sync`)).status).toBe(403);
  });
});

describe("recherche de structures pour devenir staff", () => {
  it("GET /structures?q= filtre sur le nom ou la ville, sans casse", async () => {
    const w = await setup();
    const res = await req(null, "GET", "/structures?q=club");
    expect(res.json.items.map((s: { slug: string }) => s.slug)).toContain(w.s.slug);
    expect((await req(null, "GET", "/structures?q=zzzz")).json.items).toEqual([]);
    expect((await req(null, "GET", "/structures?q=%25")).json.items).toEqual([]);
  });
});
