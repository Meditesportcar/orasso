// Jetons push (lot M6, tour 3, vie privée) : retirés à la déconnexion, repris par le dernier compte connecté, supprimés
// avec le compte ; le push porte un destinataire opaque. Route de déconnexion permise à un compte suspendu.
import { fromWallTime, pushRecipientId } from "@orasso/shared";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { devices, profiles, session } from "../../db/schema";
import { now } from "../../lib/deps";
import { push } from "../../lib/push";
import { resetRateLimits } from "../../lib/rateLimit";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";
import { securityService } from "../security/service";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const TOKEN = "ExponentPushToken[m6b-tour3]";

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 10, day: 23, hour: 15, minute: 0 }));
});

async function req(u: TestUser, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      cookie: u.cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

const register = (u: TestUser, expoPushToken = TOKEN) =>
  req(u, "POST", "/me/devices", { platform: "android", expoPushToken });
const tokensOf = async (u: TestUser) =>
  (await db.select().from(devices).where(eq(devices.userId, u.id))).map((d) => d.expoPushToken).filter(Boolean);

describe("jetons push et vie privée", () => {
  it("déconnexion : le jeton de l'appareil est retiré du compte (réponse 204, idempotent)", async () => {
    const a = await signUp("Alice");
    expect((await register(a)).status).toBe(201);
    expect(await tokensOf(a)).toEqual([TOKEN]);
    const out = await req(a, "POST", "/me/devices/unregister", { expoPushToken: TOKEN });
    expect(out.status).toBe(204);
    expect(await tokensOf(a)).toEqual([]);
    const [row] = await db.select().from(devices).where(eq(devices.userId, a.id));
    expect(row?.revokedAt).not.toBeNull();
    expect((await req(a, "POST", "/me/devices/unregister", { expoPushToken: TOKEN })).status).toBe(204);
    expect((await req(a, "POST", "/me/devices/unregister", { expoPushToken: "n-importe-quoi" })).status).toBe(400);
  });

  it("ne retire que le jeton du compte connecté", async () => {
    const a = await signUp("Alice");
    const b = await signUp("Bruno");
    await register(a);
    await req(b, "POST", "/me/devices/unregister", { expoPushToken: TOKEN });
    expect(await tokensOf(a)).toEqual([TOKEN]);
  });

  it("un compte suspendu peut retirer le jeton de son téléphone", async () => {
    const a = await signUp("Alice");
    await register(a);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(profiles.userId, a.id));
    expect((await req(a, "POST", "/me/devices/unregister", { expoPushToken: TOKEN })).status).toBe(204);
    expect(await tokensOf(a)).toEqual([]);
  });

  it("deux comptes successifs sur le même téléphone : le jeton repris par B n'est plus chez A", async () => {
    const a = await signUp("Alice");
    const b = await signUp("Bruno");
    await register(a);
    await register(b);
    expect(await tokensOf(a)).toEqual([]);
    expect(await tokensOf(b)).toEqual([TOKEN]);
  });

  it("suppression du compte : plus aucun appareil ni jeton", async () => {
    const a = await signUp("Alice");
    await register(a);
    await accountService.anonymize(a.id, null, {});
    expect(await db.select().from(devices).where(eq(devices.userId, a.id))).toHaveLength(0);
  });

  it("le push porte un destinataire opaque (haché du compte), jamais l'e-mail ni l'identifiant", async () => {
    const a = await signUp("Alice");
    await register(a);
    await notificationsService.flush();
    const spy = vi.spyOn(push, "send").mockResolvedValue(1);
    await notificationsService.notify(db, a.id, "message_received", { title: "Bob", body: "Bob : coucou" });
    await notificationsService.deliverDue();
    const sent = spy.mock.calls.flatMap((call) => call[0]);
    spy.mockRestore();
    expect(sent).toHaveLength(1);
    const recipient = sent[0]?.data?.recipient;
    expect(recipient).toBe(pushRecipientId(a.id));
    expect(recipient).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(sent[0]?.data)).not.toContain(a.id);
    expect(JSON.stringify(sent[0]?.data)).not.toContain("@");
  });
});

// Lot M6, tour 4 : l'inscription push suit la session qui l'a faite ; retrait sans session sur preuve du jeton.
describe("inscription push rattachée à la session", () => {
  beforeEach(() => resetRateLimits());

  const sessionOf = async (u: TestUser) => {
    const [row] = await db.select().from(session).where(eq(session.userId, u.id));
    if (!row) throw new Error("session absente");
    return row;
  };
  /** Push envoyés pendant une notification « message reçu » à `u`. */
  const pushesTo = async (u: TestUser) => {
    await notificationsService.flush();
    const spy = vi.spyOn(push, "send").mockResolvedValue(1);
    await notificationsService.notify(db, u.id, "message_received", { title: "Bob", body: "Bob : coucou" });
    await notificationsService.deliverDue();
    const sent = spy.mock.calls.flatMap((call) => call[0]);
    spy.mockRestore();
    return sent;
  };
  const anonymous = (path: string, body: unknown) =>
    app.request(`/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify(body),
    });

  it("l'appareil garde la session qui l'a inscrit", async () => {
    const a = await signUp("Alice");
    await register(a);
    const [row] = await db.select().from(devices).where(eq(devices.userId, a.id));
    expect(row?.sessionId).toBe((await sessionOf(a)).id);
    expect(await pushesTo(a)).toHaveLength(1);
  });

  it("session révoquée (« déconnecter cet appareil ») : inscription supprimée, plus aucun push", async () => {
    const a = await signUp("Alice");
    await register(a);
    await securityService.revokeSession(a.id, (await sessionOf(a)).id);
    expect(await tokensOf(a)).toEqual([]);
    const [row] = await db.select().from(devices).where(eq(devices.userId, a.id));
    expect(row?.revokedAt).not.toBeNull();
    expect(row?.sessionId).toBeNull();
    expect(await pushesTo(a)).toHaveLength(0);
  });

  it("mot de passe changé (autres sessions révoquées) : inscription supprimée", async () => {
    const a = await signUp("Alice");
    await register(a);
    await securityService.revokeOtherSessions(a.id, null);
    expect(await tokensOf(a)).toEqual([]);
  });

  it("session supprimée par un autre chemin (Better Auth, administration) : aucun push, jeton effacé à l'envoi", async () => {
    const a = await signUp("Alice");
    await register(a);
    await db.delete(session).where(eq(session.userId, a.id));
    expect(await pushesTo(a)).toHaveLength(0);
    expect(await tokensOf(a)).toEqual([]);
  });

  it("session expirée : aucun push, inscription supprimée (à l'envoi et par la tâche hebdomadaire)", async () => {
    const a = await signUp("Alice");
    const b = await signUp("Bruno");
    await register(a);
    await register(b, "ExponentPushToken[m6c-bruno]");
    await db
      .update(session)
      .set({ expiresAt: new Date(now().getTime() - 1000) })
      .where(inArray(session.userId, [a.id, b.id]));
    expect(await pushesTo(a)).toHaveLength(0);
    expect(await tokensOf(a)).toEqual([]);
    // B ne reçoit rien : seule la tâche hebdomadaire passe sur son appareil.
    expect(await tokensOf(b)).toEqual(["ExponentPushToken[m6c-bruno]"]);
    await securityService.purgeKnownLogins();
    expect(await tokensOf(b)).toEqual([]);
  });

  it("un appareil sans jeton (celui du staff) reste valable quand sa session se termine", async () => {
    const a = await signUp("Alice");
    const res = await req(a, "POST", "/me/devices", { platform: "android", name: "Pixel" });
    const staffDevice = JSON.parse(res.text) as { id: string };
    await securityService.revokeSession(a.id, (await sessionOf(a)).id);
    const [row] = await db.select().from(devices).where(eq(devices.id, staffDevice.id));
    expect(row?.revokedAt).toBeNull();
  });

  it("retrait sans session sur preuve du jeton : 204 connu ou non, 400 mal formé, limité par adresse", async () => {
    const a = await signUp("Alice");
    await register(a);
    expect((await anonymous("/devices/unregister", { expoPushToken: TOKEN })).status).toBe(204);
    expect(await tokensOf(a)).toEqual([]);
    expect((await anonymous("/devices/unregister", { expoPushToken: "ExponentPushToken[inconnu]" })).status).toBe(204);
    expect((await anonymous("/devices/unregister", { expoPushToken: "n-importe-quoi" })).status).toBe(400);
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) {
      statuses.push((await anonymous("/devices/unregister", { expoPushToken: `ExponentPushToken[x${i}]` })).status);
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.filter((s) => s === 204)).toHaveLength(27);
  });

  it("le retrait sans session n'ouvre pas les routes du compte", async () => {
    const res = await app.request("/api/me/devices/unregister", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expoPushToken: TOKEN }),
    });
    expect(res.status).toBe(401);
  });
});
