// Lot 14 : billets gratuits (deux interrupteurs, réservation, QR, contrôle à l'entrée) et billets payants en mode
// présentation (Stripe Connect simulé : aucune clé réelle, aucun appel réseau).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fromWallTime, PLATFORM_FEE_BASIS_POINTS, platformFeeCents } from "@orasso/shared";
import { eq } from "drizzle-orm";
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
import { type events, orders, platformSettings, structures, tickets } from "../../db/schema";
import { type StripeConfig, setStripeConfig, setStripeFetch, signWebhookPayload } from "../../lib/stripe";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let fan: TestUser;
let staff: TestUser;
let structure: Awaited<ReturnType<typeof createStructure>>;

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

const TEST_KEYS: StripeConfig = {
  secretKey: "sk_test_abc123",
  webhookSecret: "whsec_test_secret",
  connectClientId: "ca_test_123",
};

async function freeEvent(overrides: Partial<typeof events.$inferInsert> = {}) {
  return createEvent(structure.id, {
    publicAccess: "free_reservation",
    startsAt: new Date(clock.now.getTime() + 10 * 86_400_000),
    ...overrides,
  });
}
const setup = (eventId: string, body: Record<string, unknown> = {}) =>
  call(orga, "PUT", `/events/${eventId}/ticketing`, { enabled: true, capacity: 5, ...body });
const reserve = (u: TestUser, eventId: string, quantity = 1) =>
  call(u, "POST", `/events/${eventId}/tickets/reserve`, { quantity });
const check = (u: TestUser, eventId: string, payload: string) =>
  call(u, "POST", `/events/${eventId}/tickets/check`, { payload });

describe("billets gratuits : interrupteurs", () => {
  it("fermée tant que l'organisateur n'a pas activé l'événement ; le public voit pourquoi", async () => {
    const e = await freeEvent();
    const before = await call(fan, "GET", `/events/by-slug/${e.slug}/tickets`);
    expect(before.json.offer).toMatchObject({ kind: "free", block: "event_off", testMode: false });
    expect((await reserve(fan, e.id)).status).toBe(409);
    await setup(e.id);
    const after = await call(fan, "GET", `/events/by-slug/${e.slug}/tickets`);
    expect(after.json.offer).toMatchObject({ block: null, remaining: 5, priceCents: null });
    expect((await reserve(fan, e.id)).status).toBe(201);
  });

  it("interrupteur général de l'administration éteint : aucune réservation, même si l'événement est ouvert", async () => {
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    const e = await freeEvent();
    await setup(e.id);
    expect((await call(orga, "PUT", "/admin/settings/ticketing.free_enabled", { value: false })).status).toBe(403);
    const off = await call(admin, "PUT", "/admin/settings/ticketing.free_enabled", { value: false });
    expect(off.status).toBe(200);
    expect(off.json["ticketing.free_enabled"]).toBe(false);
    const offer = await call(fan, "GET", `/events/by-slug/${e.slug}/tickets`);
    expect(offer.json.offer.block).toBe("general_off");
    expect((await reserve(fan, e.id)).status).toBe(409);
    await call(admin, "PUT", "/admin/settings/ticketing.free_enabled", { value: true });
    expect((await reserve(fan, e.id)).status).toBe(201);
    // Le changement est tracé.
    expect(
      await db.query.adminAuditLog.findMany({ where: (l, { eq: same }) => same(l.action, "settings.update") }),
    ).toHaveLength(2);
  });

  it("le mode présentation ne se coupe pas avant le 21 juin 2027", async () => {
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    const res = await call(admin, "PUT", "/admin/settings/ticketing.presentation_mode", { value: false });
    expect(res.status).toBe(409);
    const settings = await call(admin, "GET", "/admin/settings");
    expect(settings.json).toMatchObject({
      "ticketing.presentation_mode": true,
      presentationForced: true,
      stripe: { configured: false, mode: "off" },
    });
    expect((await call(admin, "PUT", "/admin/settings/inconnu", { value: true })).status).toBe(400);
  });

  it("seulement pour un événement « gratuite sur réservation » et publié", async () => {
    const free = await createEvent(structure.id, { publicAccess: "free" });
    expect((await setup(free.id)).status).toBe(400);
    expect((await call(fan, "GET", `/events/by-slug/${free.slug}/tickets`)).json.offer).toBeNull();
    const draft = await freeEvent({ status: "draft" });
    expect((await call(fan, "GET", `/events/by-slug/${draft.slug}/tickets`)).status).toBe(404);
    expect((await call(fan, "PUT", `/events/${free.id}/ticketing`, { enabled: true, capacity: 1 })).status).toBe(403);
  });
});

describe("billets gratuits : réservation", () => {
  it("réserve, reçoit un QR signé, limite par personne et capacité", async () => {
    const e = await freeEvent();
    await setup(e.id, { capacity: 3 });
    expect((await call(null, "POST", `/events/${e.id}/tickets/reserve`, { quantity: 1 })).status).toBe(401);
    const res = await reserve(fan, e.id, 2);
    expect(res.status).toBe(201);
    expect(res.json).toHaveLength(2);
    expect(res.json[0].payload).toMatch(/^OR1[A-Z2-7]{138}$/);
    expect(res.json[0]).toMatchObject({ status: "valid", priceCents: null, event: { slug: e.slug } });
    expect((await call(fan, "GET", "/me/tickets")).json).toHaveLength(2);
    // Capacité 3 : il reste 1 place.
    const other = await signUp("Autre_66");
    expect((await reserve(other, e.id, 2)).status).toBe(409);
    expect((await reserve(other, e.id, 1)).status).toBe(201);
    expect((await call(null, "GET", `/events/by-slug/${e.slug}/tickets`)).json.offer).toMatchObject({
      block: "sold_out",
      remaining: 0,
    });
    expect((await reserve(await signUp("Dernier_66"), e.id)).status).toBe(409);
  });

  it("4 billets au plus par personne et par événement", async () => {
    const e = await freeEvent();
    await setup(e.id, { capacity: null });
    expect((await reserve(fan, e.id, 4)).status).toBe(201);
    expect((await reserve(fan, e.id, 1)).status).toBe(409);
    expect((await reserve(fan, e.id, 5)).status).toBe(400);
  });

  it("rendre un billet libère la place ; événement terminé : plus de réservation", async () => {
    const e = await freeEvent();
    await setup(e.id, { capacity: 1 });
    const mine = await reserve(fan, e.id);
    expect((await reserve(await signUp("Autre_66"), e.id)).status).toBe(409);
    expect((await call(await signUp("Intrus_66"), "DELETE", `/tickets/${mine.json[0].id}`)).status).toBe(404);
    expect((await call(fan, "DELETE", `/tickets/${mine.json[0].id}`)).status).toBe(204);
    expect((await call(fan, "GET", "/me/tickets")).json).toHaveLength(0);
    expect((await reserve(await signUp("Autre_67"), e.id)).status).toBe(201);
    clock.advance(11 * 86_400_000);
    expect((await call(fan, "GET", `/events/by-slug/${e.slug}/tickets`)).json.offer.block).toBe("finished");
  });

  it("deux demandes simultanées pour la dernière place : une seule passe", async () => {
    const e = await freeEvent();
    await setup(e.id, { capacity: 1 });
    const rivals = await Promise.all(Array.from({ length: 4 }, (_, i) => signUp(`Rival_${i}`)));
    const results = await Promise.all(rivals.map((u) => reserve(u, e.id)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await db.query.tickets.findMany({ where: eq(tickets.eventId, e.id) })).toHaveLength(1);
  });

  it("la capacité ne peut pas passer sous les billets déjà pris", async () => {
    const e = await freeEvent();
    await setup(e.id, { capacity: 5 });
    await reserve(fan, e.id, 3);
    expect((await setup(e.id, { capacity: 2 })).status).toBe(409);
    const view = await call(orga, "GET", `/events/${e.id}/ticketing`);
    expect(view.json).toMatchObject({ enabled: true, capacity: 5, sold: 3, used: 0, block: null });
  });
});

describe("contrôle à l'entrée", () => {
  it("le staff « scan » valide un billet une fois ; le QR est refusé s'il est falsifié ou d'un autre événement", async () => {
    const e = await freeEvent();
    const other = await freeEvent({ title: "Autre événement" });
    await setup(e.id);
    await setup(other.id);
    const t = (await reserve(fan, e.id)).json[0];
    const foreign = (await reserve(fan, other.id)).json[0];

    expect((await check(fan, e.id, t.payload)).status).toBe(403);
    const ok = await check(staff, e.id, t.payload);
    expect(ok.json).toMatchObject({ result: "ok", pseudo: "Kenji_66", ticketName: "Entrée" });
    expect((await check(orga, e.id, t.payload)).json).toMatchObject({ result: "already", pseudo: "Kenji_66" });
    expect((await check(staff, e.id, foreign.payload)).json).toEqual({ result: "refused", reason: "other_event" });
    const forged = `${t.payload.slice(0, -3)}AAA`;
    expect((await check(staff, e.id, forged)).json).toEqual({ result: "refused", reason: "forged" });
    expect((await check(staff, e.id, "bonjour")).json).toEqual({ result: "refused", reason: "malformed" });

    const list = await call(staff, "GET", `/events/${e.id}/tickets`);
    expect(list.json).toMatchObject({ sold: 1, used: 1 });
    expect(list.json.items[0]).toMatchObject({ pseudo: "Kenji_66", status: "used" });
  });

  it("billet rendu : refusé à l'entrée ; un staff sans rôle d'accueil n'a pas accès", async () => {
    const e = await freeEvent();
    await setup(e.id);
    const t = (await reserve(fan, e.id)).json[0];
    const placement = await signUp("Placement_66");
    await addMember(structure.id, placement.id, "staff", ["placement"]);
    expect((await check(placement, e.id, t.payload)).status).toBe(403);
    await call(fan, "DELETE", `/tickets/${t.id}`);
    expect((await check(staff, e.id, t.payload)).json).toEqual({ result: "refused", reason: "cancelled" });
  });

  it("deux lecteurs sur le même billet au même instant : un seul « ok »", async () => {
    const e = await freeEvent();
    await setup(e.id);
    const t = (await reserve(fan, e.id)).json[0];
    const results = await Promise.all([check(staff, e.id, t.payload), check(orga, e.id, t.payload)]);
    expect(results.map((r) => r.json.result).sort()).toEqual(["already", "ok"]);
  });
});

describe("billets payants : bientôt, sans clé Stripe", () => {
  it("variables vides : l'offre est « bientôt », sans erreur ; aucune session de paiement", async () => {
    const e = await createEvent(structure.id, {
      publicAccess: "paid_orasso",
      startsAt: new Date(clock.now.getTime() + 10 * 86_400_000),
    });
    const set = await setup(e.id, { priceCents: 1500 });
    expect(set.status).toBe(200);
    expect(set.json).toMatchObject({
      block: "payments_soon",
      stripe: { configured: false, mode: "off", connected: false },
    });
    const offer = await call(fan, "GET", `/events/by-slug/${e.slug}/tickets`);
    expect(offer.status).toBe(200);
    expect(offer.json.offer).toMatchObject({ kind: "paid", block: "payments_soon", priceCents: 1500, testMode: true });
    const co = await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 1 });
    expect(co.status).toBe(409);
    expect((await call(orga, "POST", `/structures/${structure.id}/stripe/connect`)).status).toBe(409);
    expect((await call(orga, "GET", `/structures/${structure.id}/stripe`)).json).toEqual({
      configured: false,
      mode: "off",
      connected: false,
      accountHint: null,
    });
  });

  it("le prix est obligatoire pour activer un billet payant", async () => {
    const e = await createEvent(structure.id, { publicAccess: "paid_orasso" });
    expect((await setup(e.id)).status).toBe(400);
    expect((await setup(e.id, { priceCents: 50 })).status).toBe(400);
  });
});

/** Stripe simulé : enregistre les appels et répond comme le ferait Stripe (OAuth Connect et Checkout). */
function fakeStripe(opts: { livemode?: boolean; failCheckout?: boolean } = {}) {
  const calls: { url: string; headers: Record<string, string>; body: URLSearchParams }[] = [];
  setStripeFetch((async (url: string, init: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const body = new URLSearchParams(String(init.body ?? ""));
    calls.push({ url: String(url), headers, body });
    if (String(url).endsWith("/oauth/token")) {
      return Response.json({ stripe_user_id: "acct_TEST123456", livemode: opts.livemode ?? false });
    }
    if (String(url).endsWith("/oauth/deauthorize")) return Response.json({ stripe_user_id: "acct_TEST123456" });
    if (String(url).endsWith("/checkout/sessions")) {
      if (opts.failCheckout) return Response.json({ error: { message: "boom" } }, { status: 400 });
      const n = calls.filter((c) => c.url.endsWith("/checkout/sessions")).length;
      return Response.json({
        id: `cs_test_${n}`,
        url: `https://checkout.stripe.com/c/pay/cs_test_${n}`,
        payment_intent: `pi_test_${n}`,
      });
    }
    return Response.json({ error: { message: "inattendu" } }, { status: 404 });
  }) as unknown as typeof fetch);
  return calls;
}

async function connectStripe() {
  const start = await call(orga, "POST", `/structures/${structure.id}/stripe/connect`);
  expect(start.status).toBe(200);
  const url = new URL(start.json.url);
  expect(url.origin + url.pathname).toBe("https://connect.stripe.com/oauth/authorize");
  expect(url.searchParams.get("client_id")).toBe("ca_test_123");
  expect(url.searchParams.get("scope")).toBe("read_write");
  const state = url.searchParams.get("state") ?? "";
  const back = await app.request(`/api/stripe/connect/callback?code=ac_test_1&state=${encodeURIComponent(state)}`);
  return { back, state };
}

describe("billets payants : Stripe Connect en mode test (simulé)", () => {
  it("connexion du compte de l'organisateur : seul le propriétaire, identifiant du compte uniquement", async () => {
    setStripeConfig(TEST_KEYS);
    const calls = fakeStripe();
    const co = await signUp("Co_Orga", { twoFactor: true });
    await addMember(structure.id, co.id, "co_organizer");
    expect((await call(co, "POST", `/structures/${structure.id}/stripe/connect`)).status).toBe(403);
    expect((await call(fan, "POST", `/structures/${structure.id}/stripe/connect`)).status).toBe(403);

    const { back } = await connectStripe();
    expect(back.status).toBe(302);
    expect(back.headers.get("location")).toBe(
      `${process.env.PUBLIC_URL}/orga/${structure.slug}/structure?stripe=connecte`,
    );
    const exchange = calls.find((c) => c.url.endsWith("/oauth/token"));
    expect(exchange?.body.get("grant_type")).toBe("authorization_code");
    expect(exchange?.body.get("code")).toBe("ac_test_1");
    expect(exchange?.headers.authorization).toBe("Bearer sk_test_abc123");
    const row = await db.query.structures.findFirst({ where: eq(structures.id, structure.id) });
    expect(row?.stripeAccountId).toBe("acct_TEST123456");
    const state = await call(orga, "GET", `/structures/${structure.id}/stripe`);
    expect(state.json).toEqual({ configured: true, mode: "test", connected: true, accountHint: "acct_…3456" });
    expect(JSON.stringify(state.json)).not.toContain("acct_TEST123456");
  });

  it("state falsifié ou expiré, compte réel, refus de l'organisateur : rien n'est enregistré", async () => {
    setStripeConfig(TEST_KEYS);
    fakeStripe({ livemode: true });
    const forged = await app.request("/api/stripe/connect/callback?code=ac_1&state=truc.faux");
    expect(forged.headers.get("location")).toBe(`${process.env.PUBLIC_URL}/`);
    const live = await connectStripe();
    expect(live.back.headers.get("location")).toContain("stripe=erreur");
    expect(
      (await db.query.structures.findFirst({ where: eq(structures.id, structure.id) }))?.stripeAccountId,
    ).toBeNull();
    const denied = await app.request(
      `/api/stripe/connect/callback?error=access_denied&state=${encodeURIComponent(live.state)}`,
    );
    expect(denied.headers.get("location")).toContain("stripe=erreur");
    clock.advance(20 * 60_000);
    const expired = await app.request(`/api/stripe/connect/callback?code=x&state=${encodeURIComponent(live.state)}`);
    expect(expired.headers.get("location")).toBe(`${process.env.PUBLIC_URL}/`);
  });

  async function paidEvent() {
    const e = await createEvent(structure.id, {
      publicAccess: "paid_orasso",
      startsAt: new Date(clock.now.getTime() + 10 * 86_400_000),
    });
    await setup(e.id, { priceCents: 1500, capacity: 10 });
    return e;
  }

  it("paiement d'un billet : session sur le compte connecté, commission de la plateforme, jamais de clé de l'organisateur", async () => {
    setStripeConfig(TEST_KEYS);
    const calls = fakeStripe();
    await connectStripe();
    const e = await paidEvent();
    const offer = await call(fan, "GET", `/events/by-slug/${e.slug}/tickets`);
    expect(offer.json.offer).toMatchObject({ kind: "paid", block: null, priceCents: 1500, testMode: true });

    const res = await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.json.url).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    const session = calls.find((c) => c.url.endsWith("/checkout/sessions"));
    expect(session?.headers["stripe-account"]).toBe("acct_TEST123456");
    expect(session?.headers.authorization).toBe("Bearer sk_test_abc123");
    expect(session?.body.get("mode")).toBe("payment");
    expect(session?.body.get("line_items[0][quantity]")).toBe("2");
    expect(session?.body.get("line_items[0][price_data][unit_amount]")).toBe("1500");
    expect(session?.body.get("line_items[0][price_data][currency]")).toBe("eur");
    expect(session?.body.get("payment_intent_data[application_fee_amount]")).toBe(String(platformFeeCents(3000)));
    expect(PLATFORM_FEE_BASIS_POINTS).toBe(500);
    expect(session?.body.get("payment_intent_data[application_fee_amount]")).toBe("150");
    expect(session?.body.get("metadata[order_id]")).toBeTruthy();
    expect(session?.headers["idempotency-key"]).toMatch(/^order-/);

    const order = await db.query.orders.findFirst();
    expect(order).toMatchObject({
      status: "pending",
      amountCents: 3000,
      feeCents: 150,
      testMode: true,
      stripeAccountId: "acct_TEST123456",
      stripeSessionId: "cs_test_1",
    });
    // Les places sont retenues pendant le paiement ; pas de billet avant le webhook.
    expect((await call(fan, "GET", "/me/tickets")).json).toHaveLength(0);
    expect((await call(null, "GET", `/events/by-slug/${e.slug}/tickets`)).json.offer.remaining).toBe(8);
  });

  const webhook = (event: Record<string, unknown>, opts: { secret?: string; at?: number } = {}) => {
    const raw = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, livemode: false, ...event });
    const sig = signWebhookPayload(
      raw,
      opts.secret ?? TEST_KEYS.webhookSecret ?? "",
      opts.at ?? Math.floor(clock.now.getTime() / 1000),
    );
    return app.request("/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": sig }, body: raw });
  };
  const completed = (sessionId: string, extra: Record<string, unknown> = {}) => ({
    type: "checkout.session.completed",
    account: "acct_TEST123456",
    data: {
      object: { id: sessionId, payment_status: "paid", amount_total: 3000, payment_intent: "pi_test_1", ...extra },
    },
  });

  it("webhook signé : la commande est payée et les billets émis une seule fois (rejeu sans effet)", async () => {
    setStripeConfig(TEST_KEYS);
    fakeStripe();
    await connectStripe();
    const e = await paidEvent();
    await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 2 });

    const res = await webhook(completed("cs_test_1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ handled: true });
    expect((await webhook(completed("cs_test_1"))).status).toBe(200);
    const mine = (await call(fan, "GET", "/me/tickets")).json;
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ priceCents: 1500, testMode: true, status: "valid" });
    expect((await db.query.orders.findFirst())?.status).toBe("paid");
    expect(await db.query.tickets.findMany()).toHaveLength(2);
    // Le billet payé passe le contrôle comme un billet gratuit, et ne se rend pas.
    expect((await check(staff, e.id, mine[0].payload)).json.result).toBe("ok");
    expect((await call(fan, "DELETE", `/tickets/${mine[0].id}`)).status).toBe(409);
  });

  it("webhook : signature invalide, ancienne, mauvais secret, montant ou compte inattendu, événement réel : rien ne se passe", async () => {
    setStripeConfig(TEST_KEYS);
    fakeStripe();
    await connectStripe();
    const e = await paidEvent();
    await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 2 });

    expect((await app.request("/api/stripe/webhook", { method: "POST", body: "{}" })).status).toBe(400);
    expect((await webhook(completed("cs_test_1"), { secret: "whsec_autre" })).status).toBe(400);
    expect((await webhook(completed("cs_test_1"), { at: Math.floor(clock.now.getTime() / 1000) - 3600 })).status).toBe(
      400,
    );
    expect((await webhook({ ...completed("cs_test_1"), livemode: true })).status).toBe(400);
    expect(await (await webhook(completed("cs_test_1", { amount_total: 100 }))).json()).toEqual({ handled: false });
    expect(await (await webhook(completed("cs_test_1", { payment_status: "unpaid" }))).json()).toEqual({
      handled: false,
    });
    expect(await (await webhook({ ...completed("cs_test_1"), account: "acct_AUTRE" })).json()).toEqual({
      handled: false,
    });
    expect(await (await webhook(completed("cs_inconnue"))).json()).toEqual({ handled: false });
    expect(await db.query.tickets.findMany()).toHaveLength(0);
    expect((await db.query.orders.findFirst())?.status).toBe("pending");
  });

  it("session expirée : la commande est abandonnée et les places rendues", async () => {
    setStripeConfig(TEST_KEYS);
    fakeStripe();
    await connectStripe();
    const e = await paidEvent();
    await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 4 });
    expect((await call(null, "GET", `/events/by-slug/${e.slug}/tickets`)).json.offer.remaining).toBe(6);
    const res = await webhook({
      type: "checkout.session.expired",
      account: "acct_TEST123456",
      data: { object: { id: "cs_test_1" } },
    });
    expect(await res.json()).toEqual({ handled: true });
    expect((await db.query.orders.findFirst())?.status).toBe("expired");
    expect((await call(null, "GET", `/events/by-slug/${e.slug}/tickets`)).json.offer.remaining).toBe(10);
  });

  it("une commande non réglée libère ses places à l'expiration", async () => {
    setStripeConfig(TEST_KEYS);
    fakeStripe();
    await connectStripe();
    const e = await paidEvent();
    await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 4 });
    clock.advance(40 * 60_000);
    expect((await call(null, "GET", `/events/by-slug/${e.slug}/tickets`)).json.offer.remaining).toBe(10);
  });

  it("Stripe refuse la session : la commande est annulée, la place rendue, erreur propre", async () => {
    setStripeConfig(TEST_KEYS);
    fakeStripe({ failCheckout: true });
    await connectStripe();
    const e = await paidEvent();
    const res = await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 1 });
    expect(res.status).toBe(502);
    expect(res.json.error.message).not.toContain("boom");
    expect((await db.query.orders.findFirst())?.status).toBe("cancelled");
    expect((await call(null, "GET", `/events/by-slug/${e.slug}/tickets`)).json.offer.remaining).toBe(10);
  });

  it("mode présentation éteint ou compte déconnecté : plus de paiement", async () => {
    setStripeConfig(TEST_KEYS);
    fakeStripe();
    await connectStripe();
    const e = await paidEvent();
    await db.insert(platformSettings).values({ key: "ticketing.presentation_mode", value: false });
    expect((await call(fan, "GET", `/events/by-slug/${e.slug}/tickets`)).json.offer.block).toBe("payments_soon");
    expect((await call(fan, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 1 })).status).toBe(409);
    await db.delete(platformSettings);
    expect((await call(orga, "DELETE", `/structures/${structure.id}/stripe`)).json.connected).toBe(false);
    expect((await call(fan, "GET", `/events/by-slug/${e.slug}/tickets`)).json.offer.block).toBe("payments_soon");
  });

  it("Stripe signale la déconnexion du compte : la structure est déconnectée", async () => {
    setStripeConfig(TEST_KEYS);
    fakeStripe();
    await connectStripe();
    const res = await webhook({
      type: "account.application.deauthorized",
      account: "acct_TEST123456",
      data: { object: {} },
    });
    expect(await res.json()).toEqual({ handled: true });
    expect(
      (await db.query.structures.findFirst({ where: eq(structures.id, structure.id) }))?.stripeAccountId,
    ).toBeNull();
  });

  it("deux commandes simultanées pour les dernières places : une seule passe", async () => {
    setStripeConfig(TEST_KEYS);
    fakeStripe();
    await connectStripe();
    const e = await paidEvent();
    await setup(e.id, { priceCents: 1500, capacity: 4 });
    const rivals = await Promise.all(Array.from({ length: 3 }, (_, i) => signUp(`Rival_${i}`)));
    const results = await Promise.all(
      rivals.map((u) => call(u, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 3 })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await db.query.orders.findMany({ where: eq(orders.status, "pending") })).toHaveLength(1);
  });
});

describe("garde de la clé Stripe", () => {
  it("une clé sk_live_ est refusée par la configuration", () => {
    expect(() => setStripeConfig({ ...TEST_KEYS, secretKey: "sk_live_abc123" })).toThrow(/sk_live_/);
    expect(() => setStripeConfig({ ...TEST_KEYS, secretKey: "pk_test_abc" })).toThrow(/clé de test/);
    expect(() => setStripeConfig({ ...TEST_KEYS, secretKey: "rk_live_abc" })).toThrow();
  });

  const boot = (env: Record<string, string>) =>
    spawnSync(process.execPath, ["--import", "tsx", "-e", "await import('./src/env.ts')"], {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      env: {
        ...process.env,
        NODE_ENV: "production",
        QR_SIGNING_KEYS: '[{"kid":1,"privateKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}]',
        QR_SIGNING_ACTIVE_KID: "1",
        DEV_SKIP_2FA: "",
        STRIPE_SECRET_KEY: "",
        STRIPE_WEBHOOK_SECRET: "",
        STRIPE_CONNECT_CLIENT_ID: "",
        ...env,
      },
      encoding: "utf8",
      timeout: 60_000,
    });

  it("l'API ne démarre pas en production avec une clé sk_live_", () => {
    const live = boot({ STRIPE_SECRET_KEY: "sk_live_51Abcdef" });
    expect(live.status).toBe(1);
    expect(live.stderr).toContain("sk_live_");
    expect(live.stderr).not.toContain("51Abcdef");
  });

  it("variables vides ou clé de test : démarrage normal (la billetterie payante est « bientôt »)", () => {
    expect(boot({}).status).toBe(0);
    expect(boot({ STRIPE_SECRET_KEY: "sk_test_51Abcdef" }).status).toBe(0);
  });
});
