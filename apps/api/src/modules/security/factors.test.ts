// Lot 15, relectures : la double authentification est prouvée par la session (`passkey` ou `totp`), pas par l'état du
// compte ; ajouter, retirer ou révéler un facteur exige une session qui prouve un facteur existant. Chaque cas est joué
// en cookie (site) **et** en jeton porteur (appli) : le garde est un middleware Hono qui voit les deux.
import { randomBytes } from "node:crypto";
import { createOTP } from "@better-auth/utils/otp";
import { symmetricDecrypt } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createEvent, createStructure, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { auth as betterAuth } from "../../auth";
import { db, pool } from "../../db/client";
import { emailOutbox, passkey, session, twoFactor, user, verification } from "../../db/schema";
import { notificationsService } from "../notifications/service";
import { AUTH_ROUTES, authRouteOf } from "./auth-guard";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(new Date());
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const MODES = ["cookie", "bearer"] as const;
type Mode = (typeof MODES)[number];

/** Identifiants d'une session, en cookie (site) ou en jeton porteur (appli). */
type Cred = { mode: Mode; cookie: string };

const bearerOf = (cookie: string) => {
  const raw = cookie
    .split("; ")
    .find((c) => c.startsWith("better-auth.session_token="))
    ?.slice("better-auth.session_token=".length);
  return raw ? decodeURIComponent(raw) : "";
};

function headersOf(cred: Cred | null, body: boolean): Record<string, string> {
  return {
    origin: ORIGIN,
    ...(cred?.mode === "cookie" ? { cookie: cred.cookie } : {}),
    ...(cred?.mode === "bearer" ? { authorization: `Bearer ${bearerOf(cred.cookie)}` } : {}),
    ...(body ? { "content-type": "application/json" } : {}),
  };
}

/** Appel HTTP : statut, corps, cookies posés (nouvelle session éventuelle). */
async function req(cred: Cred | null, method: string, path: string, body?: unknown, extraCookie?: string) {
  const headers = headersOf(cred, body !== undefined);
  if (extraCookie) headers.cookie = [headers.cookie, extraCookie].filter(Boolean).join("; ");
  const res = await app.request(`/api${path}`, {
    method,
    headers,
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
  return {
    status: res.status,
    json,
    setCookie: set.map((c) => c.split(";")[0]).join("; "),
    authToken: res.headers.get("set-auth-token"),
  };
}

const as = (u: TestUser, mode: Mode): Cred => ({ mode, cookie: u.cookie });

async function addPasskey(userId: string) {
  const id = randomBytes(8).toString("hex");
  await db.insert(passkey).values({
    id,
    name: "Téléphone",
    publicKey: "cle-publique",
    userId,
    credentialID: randomBytes(16).toString("base64url"),
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
    createdAt: new Date(),
  });
  return id;
}

const sessionsOf = (userId: string) => db.query.session.findMany({ where: eq(session.userId, userId) });

async function totpSecretOf(userId: string) {
  const row = await db.query.twoFactor.findFirst({ where: eq(twoFactor.userId, userId) });
  return symmetricDecrypt({ key: (await betterAuth.$context).secretConfig, data: row!.secret });
}

/** Les routes qui ajoutent, retirent ou révèlent un facteur. */
async function factorRoutes(cred: Cred, passkeyId: string) {
  return {
    registerOptions: (await req(cred, "GET", "/auth/passkey/generate-register-options")).status,
    verifyRegistration: (await req(cred, "POST", "/auth/passkey/verify-registration", { response: {} })).status,
    deletePasskey: (await req(cred, "POST", "/auth/passkey/delete-passkey", { id: passkeyId })).status,
    enableTotp: (await req(cred, "POST", "/auth/two-factor/enable", { password: "motdepasse-test-123" })).status,
    disableTotp: (await req(cred, "POST", "/auth/two-factor/disable", { password: "motdepasse-test-123" })).status,
    totpUri: (await req(cred, "POST", "/auth/two-factor/get-totp-uri", { password: "motdepasse-test-123" })).status,
    backupCodes: (
      await req(cred, "POST", "/auth/two-factor/generate-backup-codes", { password: "motdepasse-test-123" })
    ).status,
  };
}

const ALL_403 = {
  registerOptions: 403,
  verifyRegistration: 403,
  deletePasskey: 403,
  enableTotp: 403,
  disableTotp: 403,
  totpUri: 403,
  backupCodes: 403,
};

describe("liste des routes de Better Auth", () => {
  it("chaque route HTTP exposée est classée par le garde (une route nouvelle fait échouer ce test)", () => {
    const exposed = Object.values(betterAuth.api as Record<string, { path?: string }>)
      .map((e) => e?.path)
      .filter((p): p is string => typeof p === "string");
    expect(exposed.length).toBeGreaterThan(40);
    const unclassified = exposed.filter((p) => !(p in AUTH_ROUTES));
    expect(unclassified).toEqual([]);
    expect(authRouteOf("/api/auth/reset-password/abc")).toBe("/reset-password/:token");
    expect(authRouteOf("/api/auth/inconnue")).toBeNull();
  });

  it("routes inutiles et risquées refusées", async () => {
    const u = await signUp("Refus_01");
    for (const mode of MODES) {
      for (const [path, method] of [
        ["/auth/update-session", "POST"],
        ["/auth/list-sessions", "GET"],
        ["/auth/verify-password", "POST"],
        ["/auth/update-user", "POST"],
        ["/auth/change-email", "POST"],
        ["/auth/two-factor/send-otp", "POST"],
      ] as const) {
        const res = await req(as(u, mode), method, path, method === "POST" ? {} : undefined);
        expect(res.status, `${mode} ${path}`).toBe(404);
      }
    }
    expect((await sessionsOf(u.id))[0]?.secondFactor).toBeNull();
  });
});

describe.each(MODES)("ajout, retrait et révélation des facteurs (%s)", (mode) => {
  it("clé existante + session ouverte par mot de passe → 403 sur toutes les routes de facteur", async () => {
    const u = await signUp(`Facteurs_${mode}`);
    const key = await addPasskey(u.id);
    expect(await factorRoutes(as(u, mode), key)).toEqual(ALL_403);
    expect(await db.query.passkey.findFirst({ where: eq(passkey.id, key) })).toBeTruthy();
    // Session ouverte par la clé : le titulaire peut ajouter une clé.
    await db.update(session).set({ secondFactor: "passkey" }).where(eq(session.userId, u.id));
    expect((await req(as(u, mode), "GET", "/auth/passkey/generate-register-options")).status).toBe(200);
    // Mais jamais une session créée par l'enregistrement d'une clé.
    expect(
      (await req(as(u, mode), "POST", "/auth/passkey/verify-registration", { response: {}, createSession: true }))
        .status,
    ).toBe(403);
  });

  it("TOTP actif + session sans code (ouverte avant l'activation) → 403 partout, espace organisateur compris", async () => {
    const u = await signUp(`Totp403_${mode}`);
    const s = await createStructure(u.id);
    const e = await createEvent(s.id);
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, u.id));
    const denied = await req(as(u, mode), "GET", `/events/${e.id}`);
    expect(denied.status).toBe(403);
    expect(denied.json.error.code).toBe("two_factor_required");
    expect((await req(as(u, mode), "GET", "/me")).json).toMatchObject({
      twoFactorRequired: true,
      twoFactorHint: "totp_sign_in",
    });
    expect((await req(as(u, mode), "GET", "/auth/passkey/generate-register-options")).status).toBe(403);
    expect(
      (await req(as(u, mode), "POST", "/auth/two-factor/disable", { password: "motdepasse-test-123" })).status,
    ).toBe(403);
    expect(
      (await req(as(u, mode), "POST", "/auth/two-factor/generate-backup-codes", { password: "motdepasse-test-123" }))
        .status,
    ).toBe(403);
  });

  it("activation commencée puis abandonnée : relire le secret ou confirmer exige la règle d'un nouveau facteur", async () => {
    const u = await signUp(`Abandon_${mode}`);
    expect(
      (await req(as(u, mode), "POST", "/auth/two-factor/enable", { password: "motdepasse-test-123" })).status,
    ).toBe(200);
    // Le compte a entre-temps une clé : la session par mot de passe ne peut ni relire le secret ni confirmer.
    await addPasskey(u.id);
    expect(
      (await req(as(u, mode), "POST", "/auth/two-factor/get-totp-uri", { password: "motdepasse-test-123" })).status,
    ).toBe(403);
    const code = await createOTP(await totpSecretOf(u.id), { digits: 6, period: 30 }).totp();
    expect((await req(as(u, mode), "POST", "/auth/two-factor/verify-totp", { code })).status).toBe(403);
    expect((await db.query.user.findFirst({ where: eq(user.id, u.id) }))?.twoFactorEnabled).toBe(false);
  });

  it("premier facteur (amorçage) : session récente acceptée ; trop ancienne refusée", async () => {
    const u = await signUp(`Amorce_${mode}`);
    expect((await req(as(u, mode), "GET", "/auth/passkey/generate-register-options")).status).toBe(200);
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(session.userId, u.id));
    expect(
      (await req(as(u, mode), "POST", "/auth/two-factor/enable", { password: "motdepasse-test-123" })).status,
    ).toBe(403);
  });

  it("activation : session « totp », autres sessions révoquées, alerte ; codes limités depuis une session", async () => {
    const u = await signUp(`Active_${mode}`);
    const other = await req(null, "POST", "/auth/sign-in/email", { email: u.email, password: "motdepasse-test-123" });
    const enabled = await req(as(u, mode), "POST", "/auth/two-factor/enable", { password: "motdepasse-test-123" });
    expect(enabled.status).toBe(200);
    const code = await createOTP(await totpSecretOf(u.id), { digits: 6, period: 30 }).totp();
    const verified = await req(as(u, mode), "POST", "/auth/two-factor/verify-totp", { code });
    expect(verified.status).toBe(200);
    const sessions = await sessionsOf(u.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.secondFactor).toBe("totp");
    expect((await req({ mode: "cookie", cookie: other.setCookie }, "GET", "/me")).status).toBe(401);
    await notificationsService.flush();
    expect(
      await db.query.emailOutbox.findFirst({
        where: and(eq(emailOutbox.to, u.email), eq(emailOutbox.template, "security_two_factor_enabled")),
      }),
    ).toBeTruthy();
    // Session courante : 5 essais de code par quart d'heure.
    const current: Cred =
      mode === "cookie"
        ? { mode, cookie: verified.setCookie }
        : { mode, cookie: `better-auth.session_token=${encodeURIComponent(verified.authToken ?? "")}` };
    const codes = [];
    for (let i = 0; i < 6; i++)
      codes.push((await req(current, "POST", "/auth/two-factor/verify-totp", { code: "000000" })).status);
    expect(codes.at(-1)).toBe(429);
  });

  it("suppression du compte protégé par une clé : mot de passe seul refusé, session par clé acceptée", async () => {
    const u = await signUp(`SuppCle_${mode}`);
    await addPasskey(u.id);
    const denied = await req(as(u, mode), "DELETE", "/me", { password: "motdepasse-test-123" });
    expect(denied.status).toBe(403);
    expect(denied.json.error.message).toBe("Confirmation incorrecte");
    await db.update(session).set({ secondFactor: "passkey" }).where(eq(session.userId, u.id));
    expect((await req(as(u, mode), "DELETE", "/me", { password: "motdepasse-test-123" })).status).toBe(200);
  }, 60_000);
});

describe("preuve TOTP portée par la session", () => {
  it("connexion : mot de passe → code de secours → session « totp » ; appareil de confiance gardé, oublié à la désactivation", async () => {
    const u = await signUp("Totp_01");
    const enabled = await req(as(u, "cookie"), "POST", "/auth/two-factor/enable", { password: "motdepasse-test-123" });
    const code = await createOTP(await totpSecretOf(u.id), { digits: 6, period: 30 }).totp();
    const activated = await req(as(u, "cookie"), "POST", "/auth/two-factor/verify-totp", { code });
    expect(activated.status).toBe(200);

    const step1 = await req(null, "POST", "/auth/sign-in/email", { email: u.email, password: "motdepasse-test-123" });
    expect(step1.json.twoFactorRedirect).toBe(true);
    const step2 = await req(
      null,
      "POST",
      "/auth/two-factor/verify-backup-code",
      {
        code: enabled.json.backupCodes[0],
        trustDevice: true,
      },
      step1.setCookie,
    );
    expect(step2.status).toBe(200);
    const trust = step2.setCookie
      .split("; ")
      .filter((c) => c.includes("trust_device"))
      .join("; ");
    expect(trust).not.toBe("");
    expect((await db.query.session.findFirst({ where: eq(session.token, step2.json.token) }))?.secondFactor).toBe(
      "totp",
    );
    const trusted = await req(
      null,
      "POST",
      "/auth/sign-in/email",
      { email: u.email, password: "motdepasse-test-123" },
      trust,
    );
    expect(trusted.status).toBe(200);
    expect(trusted.json.twoFactorRedirect).toBeUndefined();
    const kept = await db.query.session.findFirst({ where: eq(session.token, trusted.json.token) });
    expect(kept?.secondFactor).toBe("totp");

    // Désactivation depuis une session qui prouve le code : appareils de confiance oubliés.
    const cred: Cred = { mode: "cookie", cookie: trusted.setCookie };
    expect((await req(cred, "POST", "/auth/two-factor/disable", { password: "motdepasse-test-123" })).status).toBe(200);
    expect(await db.query.verification.findMany({ where: eq(verification.value, u.id) })).toHaveLength(0);
  });

  it("changement de mot de passe : la preuve de la session courante est reportée", async () => {
    const u = await signUp("Report_01");
    await db.update(session).set({ secondFactor: "passkey" }).where(eq(session.userId, u.id));
    await addPasskey(u.id);
    const changed = await req(as(u, "bearer"), "POST", "/auth/change-password", {
      currentPassword: "motdepasse-test-123",
      newPassword: "autre-mot-de-passe-77",
    });
    expect(changed.status).toBe(200);
    const sessions = await sessionsOf(u.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.secondFactor).toBe("passkey");
  });
});

describe("connexion par clé sans vérification de l'utilisateur", () => {
  it("refusée de bout en bout (bit UV à 0)", async () => {
    const authData = Buffer.concat([Buffer.alloc(32), Buffer.from([0x01]), Buffer.alloc(4)]).toString("base64url");
    const res = await req(null, "POST", "/auth/passkey/verify-authentication", {
      response: { id: "x", rawId: "x", type: "public-key", response: { authenticatorData: authData } },
    });
    expect(res.status).toBe(401);
    expect(res.json.code).toBe("USER_VERIFICATION_REQUIRED");
  });
});
