// Lot R3d (Damien, 24/10 : « sessions comme Instagram ») : un an glissant pour tout le monde, prolongé au plus une fois
// par jour d'usage ; 30 jours sans usage pour les comptes à rôle de plateforme, révoqués à la lecture. Horloge de test :
// Better Auth compare les échéances à `Date`, simulée ici (avec l'horloge métier de `useClock`).
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { call, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { session } from "../../db/schema";
import { PLATFORM_SESSION_IDLE_S, SESSION_EXPIRES_IN_S, SESSION_UPDATE_AGE_S } from "./session-life";

const DAY = 24 * 3600 * 1000;
const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  const start = new Date();
  vi.setSystemTime(start);
  clock = useClock(start);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Avance l'heure de Better Auth et l'horloge métier ensemble. */
function advance(ms: number) {
  const next = new Date(Date.now() + ms);
  vi.setSystemTime(next);
  clock.set(next);
}

const sessionsOf = (u: TestUser) => db.select().from(session).where(eq(session.userId, u.id));

/** Le jeton porteur de l'appli, tiré du cookie de session. */
const bearerOf = (u: TestUser) =>
  decodeURIComponent(
    u.cookie
      .split("; ")
      .find((c) => c.startsWith("better-auth.session_token="))
      ?.slice("better-auth.session_token=".length) ?? "",
  );

async function meWithBearer(u: TestUser) {
  const res = await app.request("/api/me", { headers: { origin: ORIGIN, authorization: `Bearer ${bearerOf(u)}` } });
  return res.status;
}

describe("durée des sessions", () => {
  it("réglage : un an glissant, prolongé au plus une fois par jour ; 30 jours pour la plateforme", () => {
    expect(SESSION_EXPIRES_IN_S).toBe(365 * 24 * 3600);
    expect(SESSION_UPDATE_AGE_S).toBe(24 * 3600);
    expect(PLATFORM_SESSION_IDLE_S).toBe(30 * 24 * 3600);
  });

  it("passionné inactif 300 jours : toujours connecté, et la session repart pour un an", async () => {
    const fan = await signUp("Fan_R3d");
    const [created] = await sessionsOf(fan);
    expect(created?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 364 * DAY);
    advance(300 * DAY);
    expect((await call(fan, "GET", "/me")).status).toBe(200);
    expect(await meWithBearer(fan)).toBe(200);
    const [after] = await sessionsOf(fan);
    expect(after?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 364 * DAY);
  });

  it("prolongée au plus une fois par jour d'usage", async () => {
    const fan = await signUp("Fan_Jour");
    advance(2 * DAY);
    expect((await call(fan, "GET", "/me")).status).toBe(200);
    const [first] = await sessionsOf(fan);
    advance(3600 * 1000);
    expect((await call(fan, "GET", "/me")).status).toBe(200);
    const [second] = await sessionsOf(fan);
    expect(second?.updatedAt.getTime()).toBe(first?.updatedAt.getTime());
  });

  it("administrateur inactif 31 jours : déconnecté (session supprimée), même si le rôle est venu après la connexion", async () => {
    const admin = await signUp("Admin_R3d", { role: "super_admin" });
    advance(31 * DAY);
    expect((await call(admin, "GET", "/me")).status).toBe(401);
    expect(await sessionsOf(admin)).toHaveLength(0);
    expect(await meWithBearer(admin)).toBe(401);
  });

  it("modérateur inactif 31 jours, en jeton porteur (appli) : déconnecté", async () => {
    const moderator = await signUp("Modo_R3d", { role: "moderator" });
    advance(31 * DAY);
    expect(await meWithBearer(moderator)).toBe(401);
    expect(await sessionsOf(moderator)).toHaveLength(0);
  });

  it("administrateur actif tous les 10 jours : jamais déconnecté", async () => {
    const admin = await signUp("Admin_Actif", { role: "super_admin" });
    for (let i = 0; i < 12; i++) {
      advance(10 * DAY);
      expect((await call(admin, "GET", "/me")).status, `jour ${(i + 1) * 10}`).toBe(200);
    }
    expect(await sessionsOf(admin)).toHaveLength(1);
  });

  it("tour 2 : administrateur, prolongée au plus une fois par jour comme pour tout le monde (aucune écriture par requête)", async () => {
    const admin = await signUp("Admin_Jour", { role: "super_admin" });
    const [created] = await sessionsOf(admin);
    for (let i = 0; i < 5; i++) {
      advance(3600 * 1000);
      expect((await call(admin, "GET", "/me")).status).toBe(200);
    }
    const [same] = await sessionsOf(admin);
    expect(same?.updatedAt.getTime()).toBe(created?.updatedAt.getTime());
    expect(same?.expiresAt.getTime()).toBe(created?.expiresAt.getTime());
    advance(DAY);
    expect((await call(admin, "GET", "/me")).status).toBe(200);
    const [prolonged] = await sessionsOf(admin);
    expect(prolonged?.updatedAt.getTime()).toBeGreaterThan(created?.updatedAt.getTime() ?? 0);
  });

  it("administrateur qui se connecte puis reste 31 jours sans usage : déconnecté", async () => {
    const admin = await signUp("Admin_Login", { role: "super_admin" });
    await db.delete(session).where(eq(session.userId, admin.id));
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email: admin.email, password: "motdepasse-test-123" }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    advance(31 * DAY);
    expect((await call({ ...admin, cookie }, "GET", "/me")).status).toBe(401);
  });

  it("tour 2 : la prolongation renouvelle aussi le cookie du navigateur (un an de plus), une fois par jour", async () => {
    const fan = await signUp("Fan_Cookie");
    advance(2 * DAY);
    const res = await app.request("/api/me", { headers: { origin: ORIGIN, cookie: fan.cookie } });
    expect(res.status).toBe(200);
    const renewed = res.headers.getSetCookie().find((c) => c.includes("better-auth.session_token="));
    expect(renewed, "cookie de session renouvelé").toBeTruthy();
    expect(renewed).toMatch(new RegExp(`Max-Age=${SESSION_EXPIRES_IN_S}\\b`));
    // Même jeton : le cookie garde la session, seule sa durée repart.
    expect(renewed?.split(";")[0]).toBe(fan.cookie.split("; ").find((c) => c.startsWith("better-auth.session_token=")));
    // Une heure plus tard, rien à renouveler.
    advance(3600 * 1000);
    const again = await app.request("/api/me", { headers: { origin: ORIGIN, cookie: fan.cookie } });
    expect(again.headers.getSetCookie().some((c) => c.includes("better-auth.session_token="))).toBe(false);
  });
});
