// Lot 15, relecture de contrôle : la double authentification est prouvée par la session (`passkey` ou `totp`), pas par
// l'état du compte ; ajouter ou retirer un facteur exige une session qui prouve un facteur existant.
import { randomBytes } from "node:crypto";
import { createOTP } from "@better-auth/utils/otp";
import { symmetricDecrypt } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createEvent, createStructure, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { emailOutbox, passkey, session, twoFactor, user } from "../../db/schema";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(new Date());
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";

/** Appel de Better Auth : statut, corps, cookies posés (nouvelle session éventuelle). */
async function auth(cookie: string | null, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api/auth${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(cookie ? { cookie } : {}),
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
  const set = res.headers.getSetCookie().filter((c) => !c.includes("Max-Age=0"));
  return { status: res.status, json, setCookie: set.map((c) => c.split(";")[0]).join("; ") };
}

/** Cookies d'origine remplacés par ceux posés par la réponse (même nom). */
function merge(base: string, next: string): string {
  const jar = new Map<string, string>();
  for (const part of [...base.split("; "), ...next.split("; ")].filter(Boolean)) {
    const i = part.indexOf("=");
    jar.set(part.slice(0, i), part.slice(i + 1));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function addPasskey(userId: string) {
  await db.insert(passkey).values({
    id: randomBytes(8).toString("hex"),
    name: "Téléphone",
    publicKey: "cle-publique",
    userId,
    credentialID: randomBytes(16).toString("base64url"),
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
    createdAt: new Date(),
  });
  return (await db.query.passkey.findFirst({ where: eq(passkey.userId, userId) }))!;
}

async function sessionsOf(userId: string) {
  return db.query.session.findMany({ where: eq(session.userId, userId) });
}

/** Les cinq routes qui ajoutent, retirent ou changent un facteur. */
async function factorRoutes(u: TestUser, passkeyId: string) {
  return {
    registerOptions: (await auth(u.cookie, "GET", "/passkey/generate-register-options")).status,
    verifyRegistration: (await auth(u.cookie, "POST", "/passkey/verify-registration", { response: {} })).status,
    deletePasskey: (await auth(u.cookie, "POST", "/passkey/delete-passkey", { id: passkeyId })).status,
    enableTotp: (await auth(u.cookie, "POST", "/two-factor/enable", { password: "motdepasse-test-123" })).status,
    disableTotp: (await auth(u.cookie, "POST", "/two-factor/disable", { password: "motdepasse-test-123" })).status,
  };
}

describe("ajout et retrait des facteurs", () => {
  it("clé existante + session ouverte par mot de passe → 403 sur les cinq routes", async () => {
    const u = await signUp("Facteurs_01");
    const key = await addPasskey(u.id);
    expect(await factorRoutes(u, key.id)).toEqual({
      registerOptions: 403,
      verifyRegistration: 403,
      deletePasskey: 403,
      enableTotp: 403,
      disableTotp: 403,
    });
    expect(await db.query.passkey.findFirst({ where: eq(passkey.id, key.id) })).toBeTruthy();
    // Session ouverte par la clé : le titulaire peut ajouter une clé.
    await db.update(session).set({ secondFactor: "passkey" }).where(eq(session.userId, u.id));
    expect((await auth(u.cookie, "GET", "/passkey/generate-register-options")).status).toBe(200);
  });

  it("TOTP actif + session ouverte avant l'activation (sans code) → 403 partout, espace organisateur compris", async () => {
    const u = await signUp("Facteurs_02");
    const s = await createStructure(u.id);
    const e = await createEvent(s.id);
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, u.id));
    const denied = await call(u, "GET", `/events/${e.id}`);
    expect(denied.status).toBe(403);
    expect(denied.json.error.code).toBe("two_factor_required");
    expect((await call(u, "GET", "/me")).json).toMatchObject({
      twoFactorRequired: true,
      twoFactorHint: "totp_sign_in",
    });
    expect((await auth(u.cookie, "GET", "/passkey/generate-register-options")).status).toBe(403);
    expect((await auth(u.cookie, "POST", "/two-factor/disable", { password: "motdepasse-test-123" })).status).toBe(403);
  });

  it("premier facteur (amorçage) : session récente acceptée ; trop ancienne refusée", async () => {
    const u = await signUp("Facteurs_03");
    expect((await auth(u.cookie, "GET", "/passkey/generate-register-options")).status).toBe(200);
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(session.userId, u.id));
    expect((await auth(u.cookie, "POST", "/two-factor/enable", { password: "motdepasse-test-123" })).status).toBe(403);
  });
});

describe("preuve TOTP portée par la session", () => {
  it("activation : la session qui a donné le code prouve le TOTP, les autres sont déconnectées, alerte envoyée", async () => {
    const u = await signUp("Totp_01");
    const other = await auth(null, "POST", "/sign-in/email", { email: u.email, password: "motdepasse-test-123" });
    const enabled = await auth(u.cookie, "POST", "/two-factor/enable", { password: "motdepasse-test-123" });
    expect(enabled.status).toBe(200);
    // Secret brut (l'URI porte son encodage base32) : relu chiffré en base comme le fait le plugin.
    const row = await db.query.twoFactor.findFirst({ where: eq(twoFactor.userId, u.id) });
    const { auth: betterAuth } = await import("../../auth");
    const secret = await symmetricDecrypt({ key: (await betterAuth.$context).secretConfig, data: row!.secret });
    const code = await createOTP(secret, { digits: 6, period: 30 }).totp();
    const verified = await auth(u.cookie, "POST", "/two-factor/verify-totp", { code });
    expect(verified.status).toBe(200);
    const cookie = merge(u.cookie, verified.setCookie);
    const sessions = await sessionsOf(u.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.secondFactor).toBe("totp");
    expect((await call({ ...u, cookie }, "GET", "/me")).json.twoFactorRequired).toBe(false);
    expect((await call({ ...u, cookie: other.setCookie }, "GET", "/me")).status).toBe(401);
    await notificationsService.flush();
    expect(
      await db.query.emailOutbox.findFirst({
        where: and(eq(emailOutbox.to, u.email), eq(emailOutbox.template, "security_two_factor_enabled")),
      }),
    ).toBeTruthy();

    // Connexion suivante : mot de passe → code → session « totp » ; avec « appareil de confiance », la connexion
    // suivante par mot de passe seul est gardée et porte la preuve.
    const step1 = await auth(null, "POST", "/sign-in/email", { email: u.email, password: "motdepasse-test-123" });
    expect(step1.json.twoFactorRedirect).toBe(true);
    // Le même code TOTP ne sert qu'une fois dans sa période : code de secours ici.
    const backup: string = enabled.json.backupCodes[0];
    const step2 = await auth(step1.setCookie, "POST", "/two-factor/verify-backup-code", {
      code: backup,
      trustDevice: true,
    });
    expect(step2.status).toBe(200);
    const trust = step2.setCookie
      .split("; ")
      .filter((c) => c.includes("trust_device"))
      .join("; ");
    expect(trust).not.toBe("");
    const signed = await db.query.session.findFirst({ where: eq(session.token, step2.json.token) });
    expect(signed?.secondFactor).toBe("totp");
    const trusted = await auth(trust, "POST", "/sign-in/email", { email: u.email, password: "motdepasse-test-123" });
    expect(trusted.status).toBe(200);
    expect(trusted.json.twoFactorRedirect).toBeUndefined();
    const kept = await db.query.session.findFirst({ where: eq(session.token, trusted.json.token) });
    expect(kept?.secondFactor).toBe("totp");
  });

  it("changement de mot de passe et désactivation du TOTP : la preuve de la session courante est reportée", async () => {
    const u = await signUp("Report_01");
    await db.update(session).set({ secondFactor: "passkey" }).where(eq(session.userId, u.id));
    await addPasskey(u.id);
    const changed = await auth(u.cookie, "POST", "/change-password", {
      currentPassword: "motdepasse-test-123",
      newPassword: "autre-mot-de-passe-77",
    });
    expect(changed.status).toBe(200);
    const sessions = await sessionsOf(u.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.secondFactor).toBe("passkey");
  });

  it("la preuve ne se pose pas par /update-session", async () => {
    const u = await signUp("Update_01");
    const res = await auth(u.cookie, "POST", "/update-session", { secondFactor: "passkey" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const sessions = await sessionsOf(u.id);
    expect(sessions[0]?.secondFactor).toBeNull();
  });
});

describe("connexion par clé sans vérification de l'utilisateur", () => {
  it("refusée de bout en bout (bit UV à 0)", async () => {
    const authData = Buffer.concat([Buffer.alloc(32), Buffer.from([0x01]), Buffer.alloc(4)]).toString("base64url");
    const res = await auth(null, "POST", "/passkey/verify-authentication", {
      response: { id: "x", rawId: "x", type: "public-key", response: { authenticatorData: authData } },
    });
    expect(res.status).toBe(401);
    expect(res.json.code).toBe("USER_VERIFICATION_REQUIRED");
  });
});
