// Lot 14, corrections après relecture : propriétaire seul pour Stripe, format de billet distinct, retour OAuth lié à
// la session, annulation d'événement, clé compromise, interrupteur des paiements de démonstration, webhook.
import { createHash } from "node:crypto";
import {
  decodePassPayload,
  decodeTicketPayload,
  encodePassMessage,
  encodePassPayload,
  fromWallTime,
  verifyTicketPayload,
} from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createEvent,
  createStructure,
  resetDb,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { adminAuditLog, notifications, orders, platformSettings, signingKeys, tickets } from "../../db/schema";
import { ed25519Verify, signing } from "../../lib/signing";
import { setStripeConfig, setStripeFetch, signWebhookPayload } from "../../lib/stripe";
import { accessService } from "../access/service";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let fan: TestUser;
let staff: TestUser;
let structure: Awaited<ReturnType<typeof createStructure>>;

const KEYS = { secretKey: "sk_test_abc123", webhookSecret: "whsec_test_secret", connectClientId: "ca_test_123" };

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 16, hour: 11, minute: 0 }));
  orga = await signUp("Orga_66", { twoFactor: true });
  fan = await signUp("Kenji_66");
  staff = await signUp("Julie_Staff");
  structure = await createStructure(orga.id);
  await addMember(structure.id, staff.id, "staff", ["scan"]);
});

afterEach(() => {
  setStripeConfig(null);
  setStripeFetch(null);
});

const freeEvent = () =>
  createEvent(structure.id, {
    publicAccess: "free_reservation",
    startsAt: new Date(clock.now.getTime() + 10 * 86_400_000),
  });
const open = (eventId: string) => call(orga, "PUT", `/events/${eventId}/ticketing`, { enabled: true, capacity: 10 });
const reserve = async (u: TestUser, eventId: string) =>
  (await call(u, "POST", `/events/${eventId}/tickets/reserve`, { quantity: 1 })).json[0] as {
    id: string;
    payload: string;
  };
const check = (u: TestUser, eventId: string, payload: string) =>
  call(u, "POST", `/events/${eventId}/tickets/check`, { payload });

/** Stripe simulé : le compte renvoyé dépend du code (acct_<code>). */
function fakeStripe() {
  setStripeFetch((async (url: string, init: RequestInit) => {
    const body = new URLSearchParams(String(init.body ?? ""));
    if (String(url).endsWith("/oauth/token")) {
      return Response.json({ stripe_user_id: `acct_${body.get("code")}`, livemode: false });
    }
    if (String(url).endsWith("/oauth/deauthorize")) return Response.json({});
    return Response.json({ id: "cs_test_1", url: "https://checkout.stripe.com/x", payment_intent: "pi_1" });
  }) as unknown as typeof fetch);
}
const startConnect = async (u: TestUser) => {
  const r = await call(u, "POST", `/structures/${structure.id}/stripe/connect`);
  return r.status === 200 ? (new URL(r.json.url).searchParams.get("state") ?? "") : "";
};
const callback = (query: string, u: TestUser | null) =>
  app.request(`/api/stripe/connect/callback?${query}`, { headers: u ? { cookie: u.cookie } : {} });

describe("B1 : connexion Stripe réservée au propriétaire", () => {
  it("un super admin n'est pas propriétaire : 403 pour connecter et déconnecter", async () => {
    setStripeConfig(KEYS);
    fakeStripe();
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    expect((await call(admin, "POST", `/structures/${structure.id}/stripe/connect`)).status).toBe(403);
    expect((await call(admin, "DELETE", `/structures/${structure.id}/stripe`)).status).toBe(403);
    expect((await call(orga, "POST", `/structures/${structure.id}/stripe/connect`)).status).toBe(200);
  });
});

describe("B2 : le QR de billet n'est pas un QR d'inscription", () => {
  it("préfixe et version propres ; refusé comme inscription, et réciproquement", async () => {
    const e = await freeEvent();
    await open(e.id);
    const t = await reserve(fan, e.id);
    expect(t.payload).toMatch(/^OB1[A-Z2-7]{138}$/);
    // Le décodage « inscription » (scanner véhicules) refuse un billet, même avec le préfixe changé à la main.
    expect(decodePassPayload(t.payload)).toBeNull();
    expect(decodePassPayload(`OR1${t.payload.slice(3)}`)).toBeNull();
    // Le billet est lisible comme billet, avec une signature valide.
    expect(decodeTicketPayload(t.payload)?.passId).toBe(t.id);
    expect(verifyTicketPayload(t.payload, await signing.trustedKeys(), ed25519Verify).ok).toBe(true);

    // Une inscription (OR1, même clé, même événement) n'est pas un billet : le contrôle la refuse.
    await signing.ensureSynced();
    const row = await db.query.events.findFirst({ where: (x, { eq: same }) => same(x.id, e.id) });
    const message = encodePassMessage({ kid: signing.activeKid, eventNo: row?.eventNo ?? 0, passId: t.id });
    const pass = encodePassPayload(message, signing.sign(message).signature);
    expect(decodeTicketPayload(pass)).toBeNull();
    expect(decodeTicketPayload(`OB1${pass.slice(3)}`)).toBeNull();
    expect((await check(staff, e.id, pass)).json).toEqual({ result: "refused", reason: "malformed" });
    expect((await check(staff, e.id, `OB1${pass.slice(3)}`)).json).toEqual({ result: "refused", reason: "malformed" });
    expect((await check(staff, e.id, t.payload)).json.result).toBe("ok");
  });
});

describe("I1 : retour OAuth lié à la session, à usage unique", () => {
  it("session du lanceur exigée, state consommé, autre utilisateur refusé", async () => {
    setStripeConfig(KEYS);
    fakeStripe();
    const state = await startConnect(orga);
    // Pas de session, ou session d'un autre utilisateur : refusé, et le state est brûlé.
    expect((await callback(`code=a1&state=${state}`, null)).headers.get("location")).toBe(`${process.env.PUBLIC_URL}/`);
    const second = await startConnect(orga);
    expect((await callback(`code=a2&state=${second}`, fan)).headers.get("location")).toBe(`${process.env.PUBLIC_URL}/`);
    expect((await callback(`code=a2&state=${second}`, orga)).headers.get("location")).toBe(
      `${process.env.PUBLIC_URL}/`,
    );
    const none = await db.query.structures.findFirst();
    expect(none?.stripeAccountId).toBeNull();
    // Le propriétaire qui revient avec sa session : connecté ; rejouer le state ne remplace rien.
    const third = await startConnect(orga);
    expect((await callback(`code=a3&state=${third}`, orga)).headers.get("location")).toContain("stripe=connecte");
    expect((await callback(`code=zzz&state=${third}`, orga)).headers.get("location")).toBe(
      `${process.env.PUBLIC_URL}/`,
    );
    expect((await db.query.structures.findFirst())?.stripeAccountId).toBe("acct_a3");
  });

  it("un compte remplacé est journalisé et notifié au propriétaire", async () => {
    setStripeConfig(KEYS);
    fakeStripe();
    await callback(`code=b1&state=${await startConnect(orga)}`, orga);
    expect(
      await db.query.notifications.findMany({ where: eq(notifications.type, "stripe_account_changed") }),
    ).toHaveLength(0);
    await callback(`code=b2&state=${await startConnect(orga)}`, orga);
    expect((await db.query.structures.findFirst())?.stripeAccountId).toBe("acct_b2");
    const notes = await db.query.notifications.findMany({ where: eq(notifications.type, "stripe_account_changed") });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.userId).toBe(orga.id);
    const log = await db.query.adminAuditLog.findMany({ where: eq(adminAuditLog.action, "structure.stripe_replaced") });
    expect(log).toHaveLength(1);
  });
});

describe("I2 : annulation d'un événement", () => {
  it("les billets valables sont annulés, les titulaires prévenus, le contrôle refuse", async () => {
    const e = await freeEvent();
    await open(e.id);
    const t = await reserve(fan, e.id);
    expect((await call(orga, "POST", `/events/${e.id}/cancel`)).status).toBe(200);
    expect((await db.query.tickets.findFirst({ where: eq(tickets.id, t.id) }))?.status).toBe("cancelled");
    const notes = await db.query.notifications.findMany({ where: eq(notifications.userId, fan.id) });
    expect(notes.some((n) => n.type === "event_cancelled")).toBe(true);
    expect((await check(staff, e.id, t.payload)).json).toEqual({ result: "refused", reason: "cancelled" });
    expect((await call(fan, "GET", "/me/tickets")).json).toEqual([]);
  });
});

describe("I3 : clé compromise", () => {
  it("les billets valables du kid révoqué sont re-signés avec la clé active", async () => {
    const e = await freeEvent();
    await open(e.id);
    const t = await reserve(fan, e.id);
    const demo = JSON.stringify([
      { kid: 0, privateKey: createHash("sha256").update("orasso-dev-qr-key-not-secret").digest().toString("base64") },
    ]);
    signing.configureForTests(
      JSON.stringify([
        { kid: 7, privateKey: Buffer.alloc(32, 7).toString("base64") },
        { kid: 0, privateKey: createHash("sha256").update("orasso-dev-qr-key-not-secret").digest().toString("base64") },
      ]),
      "7",
    );
    try {
      expect(await accessService.revokeSigningKey(0)).toEqual({ reissued: 1 });
      const fresh = (await call(fan, "GET", "/me/tickets")).json[0] as { id: string; payload: string };
      expect(fresh.id).toBe(t.id);
      expect(fresh.payload).not.toBe(t.payload);
      const keys = await signing.trustedKeys();
      expect(verifyTicketPayload(t.payload, keys, ed25519Verify)).toMatchObject({ ok: false, reason: "unknown_key" });
      expect(verifyTicketPayload(fresh.payload, keys, ed25519Verify)).toMatchObject({ ok: true, ticket: { kid: 7 } });
      expect((await check(staff, e.id, fresh.payload)).json.result).toBe("ok");
    } finally {
      await db.update(signingKeys).set({ revokedAt: null }).where(eq(signingKeys.kid, 0));
      signing.configureForTests(demo, "0");
    }
  });
});

describe("I5 et I6 : paiements de démonstration, webhook", () => {
  async function paid() {
    setStripeConfig(KEYS);
    fakeStripe();
    await callback(`code=ok1&state=${await startConnect(orga)}`, orga);
    const e = await createEvent(structure.id, {
      publicAccess: "paid_orasso",
      startsAt: new Date(clock.now.getTime() + 10 * 86_400_000),
    });
    await call(orga, "PUT", `/events/${e.id}/ticketing`, { enabled: true, capacity: 10, priceCents: 1500 });
    return e;
  }
  const webhook = (event: Record<string, unknown>) => {
    const raw = JSON.stringify({ id: `evt_${Math.random()}`, livemode: false, ...event });
    return app.request("/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": signWebhookPayload(raw, KEYS.webhookSecret, Math.floor(clock.now.getTime() / 1000)),
      },
      body: raw,
    });
  };

  it("fermés par défaut, ouverts et coupés par l'administration à tout moment", async () => {
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    const e = await paid();
    const offer = async () => (await call(fan, "GET", `/events/by-slug/${e.slug}/tickets`)).json.offer;
    expect((await offer()).block).toBe("payments_soon");
    expect((await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 1 })).status).toBe(409);
    expect((await call(admin, "GET", "/admin/settings")).json["ticketing.paid_demo_enabled"]).toBe(false);
    await call(admin, "PUT", "/admin/settings/ticketing.paid_demo_enabled", { value: true });
    expect((await offer()).block).toBeNull();
    expect((await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 1 })).status).toBe(201);
    await call(admin, "PUT", "/admin/settings/ticketing.paid_demo_enabled", { value: false });
    expect((await offer()).block).toBe("payments_soon");
  });

  it("webhook : commande retrouvée par metadata.order_id, compte exigé, session incohérente refusée", async () => {
    const e = await paid();
    await db.insert(platformSettings).values({ key: "ticketing.paid_demo_enabled", value: true });
    await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 1 });
    const order = await db.query.orders.findFirst();
    // L'identifiant de session n'a jamais été enregistré : le webhook retrouve la commande par metadata.order_id.
    await db
      .update(orders)
      .set({ stripeSessionId: null })
      .where(eq(orders.id, order?.id ?? ""));
    const object = { id: "cs_test_1", payment_status: "paid", amount_total: 1500, metadata: { order_id: order?.id } };
    // Sans compte, ou avec un autre compte : ignoré.
    expect(await (await webhook({ type: "checkout.session.completed", data: { object } })).json()).toEqual({
      handled: false,
    });
    expect(
      await (await webhook({ type: "checkout.session.completed", account: "acct_autre", data: { object } })).json(),
    ).toEqual({ handled: false });
    // Référence vers une autre commande que celle de la métadonnée : ignoré.
    const mismatch = {
      ...object,
      client_reference_id: order?.id,
      metadata: { order_id: "00000000-0000-4000-8000-000000000000" },
    };
    expect(
      await (
        await webhook({ type: "checkout.session.completed", account: "acct_ok1", data: { object: mismatch } })
      ).json(),
    ).toEqual({ handled: false });
    const res = await webhook({ type: "checkout.session.completed", account: "acct_ok1", data: { object } });
    expect(await res.json()).toEqual({ handled: true });
    expect((await db.query.orders.findFirst({ where: and(eq(orders.id, order?.id ?? "")) }))?.status).toBe("paid");
    expect(await db.query.tickets.findMany()).toHaveLength(1);
  });

  it("une commande dont la session Stripe existe n'est pas annulée si l'écriture de la session échoue", async () => {
    const e = await paid();
    await db.insert(platformSettings).values({ key: "ticketing.paid_demo_enabled", value: true });
    const res = await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 1 });
    expect(res.status).toBe(201);
    const order = await db.query.orders.findFirst();
    expect(order?.status).toBe("pending");
    expect(order?.stripeSessionId).toBe("cs_test_1");
  });
});
