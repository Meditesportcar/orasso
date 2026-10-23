// Jetons push (lot M6, tour 3, vie privée) : retirés à la déconnexion, repris par le dernier compte connecté, supprimés
// avec le compte ; le push porte un destinataire opaque. Route de déconnexion permise à un compte suspendu.
import { fromWallTime, pushRecipientId } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { devices, profiles } from "../../db/schema";
import { push } from "../../lib/push";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";

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
