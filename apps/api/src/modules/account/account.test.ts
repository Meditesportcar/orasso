// Lot 15 : compte et sécurité — réinitialisation et vérification par e-mail, alertes, clés d'accès comme 2FA,
// parrainage, préférences par type, « près de chez toi », suppression du compte par anonymisation.
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { REFERRAL_SEASON_CAP } from "@orasso/shared";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
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
  account,
  adminAuditLog,
  emailOutbox,
  knownLogins,
  notifications,
  passkey,
  pointEntries,
  profileInterests,
  profiles,
  session,
  structureFollows,
  user,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { requireOrganizer, twoFactorRequired } from "../../lib/access";
import { dataDir } from "../../lib/storage";
import { nearbyService } from "../events/nearby";
import { notificationsService } from "../notifications/service";
import { pointsService } from "../points/service";
import { securityService } from "../security/service";
import { accountService } from "./service";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";

let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date());
});

/** Dernier e-mail envoyé à une adresse pour un modèle donné. */
async function lastMail(to: string, template: string) {
  await notificationsService.flush();
  return db.query.emailOutbox.findFirst({
    where: and(eq(emailOutbox.to, to), eq(emailOutbox.template, template)),
    orderBy: desc(emailOutbox.createdAt),
  });
}

/** Le jeton est dans le lien de l'e-mail (fichier du transport « journal » : même contenu). */
async function tokenFromMail(to: string, template: string, path: string) {
  const row = await lastMail(to, template);
  expect(row, `e-mail ${template}`).toBeTruthy();
  const file = await import("node:fs/promises").then((fs) =>
    fs.readdir(join(dataDir, "mail")).then(async (names) => {
      for (const n of names.sort().reverse()) {
        if (n.includes(row!.id)) return fs.readFile(join(dataDir, "mail", n), "utf8");
      }
      return "";
    }),
  );
  const match = new RegExp(`${path}\\?token=([^"&<\\s]+)`).exec(file);
  expect(match, "lien dans l'e-mail").toBeTruthy();
  return decodeURIComponent(match![1]!);
}

async function signIn(email: string, password: string, ua = CHROME_WIN) {
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "user-agent": ua, "x-forwarded-for": "82.64.10.20" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { status: res.status, cookie };
}

describe("réinitialisation du mot de passe et vérification de l'e-mail", () => {
  it("mot de passe oublié → e-mail → nouveau mot de passe → anciennes sessions révoquées, alerte reçue", async () => {
    const u = await signUp("Oubli_01");
    expect((await call(u, "GET", "/me")).status).toBe(200);
    const asked = await app.request("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email: u.email, redirectTo: "/reinitialisation" }),
    });
    expect(asked.status).toBe(200);
    const token = await tokenFromMail(u.email, "password_reset", "/reinitialisation");
    const reset = await app.request("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ token, newPassword: "nouveau-mot-de-passe-42" }),
    });
    expect(reset.status).toBe(200);
    expect((await call(u, "GET", "/me")).status).toBe(401);
    expect((await signIn(u.email, "motdepasse-test-123")).status).toBe(401);
    expect((await signIn(u.email, "nouveau-mot-de-passe-42")).status).toBe(200);
    expect(await lastMail(u.email, "security_password_changed")).toBeTruthy();
  });

  it("inscription → e-mail de vérification → lien → adresse vérifiée", async () => {
    const u = await signUp("Verif_01");
    const token = await tokenFromMail(u.email, "email_verification", "/verification-email");
    const res = await app.request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      headers: { origin: ORIGIN },
    });
    expect(res.status).toBeLessThan(400);
    const row = await db.query.user.findFirst({ where: eq(user.id, u.id) });
    expect(row?.emailVerified).toBe(true);
  });

  it("changement de mot de passe : autres sessions révoquées, alerte par e-mail", async () => {
    const u = await signUp("Change_01");
    const other = await signIn(u.email, "motdepasse-test-123", FIREFOX_LINUX);
    const res = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie: u.cookie },
      body: JSON.stringify({ currentPassword: "motdepasse-test-123", newPassword: "autre-mot-de-passe-77" }),
    });
    expect(res.status).toBe(200);
    expect((await call({ ...u, cookie: other.cookie }, "GET", "/me")).status).toBe(401);
    expect(await lastMail(u.email, "security_password_changed")).toBeTruthy();
  });
});

describe("alerte « nouvelle connexion »", () => {
  it("une seule alerte par empreinte, rien pendant les 10 premières minutes", async () => {
    const u = await signUp("Alerte_01");
    // Compte tout neuf : empreinte enregistrée, pas d'alerte.
    expect(await securityService.onLogin(u.id, "82.64.10.20", CHROME_WIN)).toBe(false);
    clock.advance(15 * 60_000);
    expect(await securityService.onLogin(u.id, "82.64.10.21", CHROME_WIN)).toBe(false); // même /24, même appareil
    expect(await securityService.onLogin(u.id, "90.1.2.3", FIREFOX_LINUX)).toBe(true);
    expect(await securityService.onLogin(u.id, "90.1.2.99", FIREFOX_LINUX)).toBe(false);
    const alerts = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, u.id), eq(notifications.type, "security_new_login")),
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.body).toContain("Firefox · Linux");
    expect(alerts[0]?.family).toBe("account");
    await notificationsService.deliverDue();
    expect(await lastMail(u.email, "security_new_login")).toBeTruthy();
    // L'e-mail rédigé n'est jamais renvoyé dans le Journal.
    const journal = await call(u, "GET", "/me/notifications");
    expect(JSON.stringify(journal.json)).not.toContain("_email");
    const seen = await db.query.knownLogins.findMany({ where: eq(knownLogins.userId, u.id) });
    expect(seen.map((k) => k.label)).toEqual(expect.arrayContaining(["Chrome · Windows", "Firefox · Linux"]));
  });
});

describe("clés d'accès comme double authentification", () => {
  it("une passkey satisfait la règle et ouvre l'espace organisateur sans TOTP", async () => {
    const orga = await signUp("Cle_01");
    const s = await createStructure(orga.id);
    const v = await viewerOf(orga);
    expect(await twoFactorRequired(v)).toBe(true);
    await expect(requireOrganizer(v, s.id)).rejects.toMatchObject({ code: "two_factor_required" });
    await db.insert(passkey).values({
      id: randomBytes(8).toString("hex"),
      name: "Téléphone",
      publicKey: "cle-publique",
      userId: orga.id,
      credentialID: randomBytes(16).toString("base64url"),
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      createdAt: new Date(),
    });
    expect(await twoFactorRequired(v)).toBe(false);
    await expect(requireOrganizer(v, s.id)).resolves.toEqual({ role: "owner" });
    expect((await call(orga, "GET", "/me")).json.twoFactorRequired).toBe(false);
  });
});

describe("parrainage", () => {
  it("lien d'ami : une seule fois par filleul, après vérification de l'e-mail", async () => {
    const parrain = await signUp("Parrain_01");
    const pp = await db.query.profiles.findFirst({ where: eq(profiles.userId, parrain.id) });
    const filleul = await signUp("Filleul_01");
    expect((await call(filleul, "POST", "/me/referral", { token: pp!.inviteToken })).status).toBe(200);
    // Deuxième rattachement refusé ; son propre jeton aussi.
    expect((await call(filleul, "POST", "/me/referral", { token: pp!.inviteToken })).json.error.code).toBe(
      "referral_not_applicable",
    );
    const fp = await db.query.profiles.findFirst({ where: eq(profiles.userId, filleul.id) });
    expect((await call(parrain, "POST", "/me/referral", { token: pp!.inviteToken })).status).toBe(409);
    expect(fp?.invitedByUserId).toBe(parrain.id);
    // Pas encore de points : l'adresse n'est pas vérifiée.
    expect(await db.query.pointEntries.findMany({ where: eq(pointEntries.userId, parrain.id) })).toHaveLength(0);
    const token = await tokenFromMail(filleul.email, "email_verification", "/verification-email");
    await app.request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { headers: { origin: ORIGIN } });
    await accountService.onEmailVerified(filleul.id); // rejoué : sans effet
    const entries = await db.query.pointEntries.findMany({ where: eq(pointEntries.userId, parrain.id) });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "referral", points: 10, subjectUserId: filleul.id });
    const after = await db.query.profiles.findFirst({ where: eq(profiles.userId, parrain.id) });
    expect(after?.pointsSeason).toBe(10);
    expect(
      await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, parrain.id), eq(notifications.type, "referral_confirmed")),
      }),
    ).toBeTruthy();
  });

  it("lien d'ami refusé pour un compte de plus de 24 h", async () => {
    const parrain = await signUp("Parrain_02");
    const pp = await db.query.profiles.findFirst({ where: eq(profiles.userId, parrain.id) });
    const tard = await signUp("Tard_01");
    clock.advance(25 * 3_600_000);
    expect((await call(tard, "POST", "/me/referral", { token: pp!.inviteToken })).status).toBe(409);
  });

  it(`plafond de ${REFERRAL_SEASON_CAP} parrainages par saison`, async () => {
    const parrain = await signUp("Parrain_03");
    const filleuls: TestUser[] = [];
    for (let i = 0; i < REFERRAL_SEASON_CAP + 2; i++) filleuls.push(await signUp(`Fil_${i}`));
    for (const f of filleuls) await pointsService.awardReferral(parrain.id, f.id);
    const entries = await db.query.pointEntries.findMany({ where: eq(pointEntries.userId, parrain.id) });
    expect(entries).toHaveLength(REFERRAL_SEASON_CAP);
  });
});

describe("préférences par type", () => {
  it("un type coupé n'est ni poussé ni envoyé ; la sécurité passe toujours", async () => {
    const u = await signUp("Prefs_01");
    const res = await call(u, "PATCH", "/me/settings", {
      mutedTypes: ["new_event_followed"],
      notificationPrefs: { application: true, event: true, social: true, grade: false },
    });
    expect(res.status).toBe(200);
    expect(res.json.mutedTypes).toEqual(["new_event_followed"]);
    expect(res.json.notificationPrefs.account).toBe(true);
    await db.transaction(async (tx) => {
      await notificationsService.notify(tx, u.id, "new_event_followed", { title: "Nouvel événement", body: "x" });
      await notificationsService.notify(tx, u.id, "points_awarded", { title: "Points", body: "x" });
      await notificationsService.notify(tx, u.id, "security_password_changed", { title: "Sécurité", body: "x" });
    });
    await notificationsService.deliverDue();
    const mails = await db.query.emailOutbox.findMany({ where: eq(emailOutbox.to, u.email) });
    const templates = mails.map((m) => m.template);
    expect(templates).toContain("security_password_changed");
    expect(templates).not.toContain("new_event_followed");
    expect(templates).not.toContain("points_awarded");
    // Elles restent dans le Journal.
    expect((await call(u, "GET", "/me/notifications")).json.items).toHaveLength(3);
  });
});

describe("événement près de chez toi", () => {
  it("centres d'intérêt + rayon, abonnés exclus, une seule fois ; rien sans catégorie", async () => {
    const ref = await seedReference();
    const orga = await signUp("Orga_Pres");
    const s = await createStructure(orga.id);
    const proche = await signUp("Proche_66");
    const loin = await signUp("Loin_59");
    const abonne = await signUp("Abonne_66");
    const autre = await signUp("Autre_66");
    for (const [u, dep, cat] of [
      [proche, "66", ref.jdm.id],
      [loin, "59", ref.jdm.id],
      [abonne, "66", ref.jdm.id],
      [autre, "66", ref.youngtimer.id],
    ] as const) {
      await db
        .update(profiles)
        .set({ departments: [dep], radiusKm: 100 })
        .where(eq(profiles.userId, u.id));
      await db.insert(profileInterests).values({ userId: u.id, categoryId: cat });
    }
    await db.insert(structureFollows).values({ structureId: s.id, userId: abonne.id, source: "manual" });
    const e = await createEvent(s.id, {
      lat: 42.69,
      lng: 2.9,
      city: "Perpignan",
      criteria: { categoryIds: [ref.jdm.id], makeIds: [], countries: [], text: null },
    });
    expect(await nearbyService.notifyNearby(e.id)).toBe(1);
    expect(await nearbyService.notifyNearby(e.id)).toBe(0);
    const sent = await db.query.notifications.findMany({ where: eq(notifications.type, "event_nearby_interest") });
    expect(sent.map((n) => n.userId)).toEqual([proche.id]);

    const sansCategorie = await createEvent(s.id, { lat: 42.69, lng: 2.9, criteria: null });
    expect(await nearbyService.notifyNearby(sansCategorie.id)).toBe(0);
    const invitation = await createEvent(s.id, {
      lat: 42.69,
      lng: 2.9,
      admission: "invite_only",
      criteria: { categoryIds: [ref.jdm.id], makeIds: [], countries: [], text: null },
    });
    expect(await nearbyService.notifyNearby(invitation.id)).toBe(0);
  });
});

describe("suppression du compte", () => {
  it("anonymisation complète, 401 ensuite, e-mail de confirmation, idempotente", async () => {
    const ref = await seedReference();
    const u = await signUp("Partant_01");
    const email = u.email;
    await db
      .update(profiles)
      .set({ firstName: "Jean", lastName: "Dupont", phone: "0600000000", bio: "Salut" })
      .where(eq(profiles.userId, u.id));
    const vehicle = await createVehicle(u.id, ref);
    const orga = await signUp("Orga_Supp");
    const s = await createStructure(orga.id);
    await db.insert(structureFollows).values({ structureId: s.id, userId: u.id, source: "manual" });

    expect((await call(u, "DELETE", "/me", { password: "mauvais" })).status).toBe(403);
    // Propriétaire d'une structure : refus.
    expect((await call(orga, "DELETE", "/me", { password: "motdepasse-test-123" })).json.error.code).toBe(
      "structure_owner",
    );

    const res = await call(u, "DELETE", "/me", { password: "motdepasse-test-123" });
    expect(res.status).toBe(200);
    expect((await call(u, "GET", "/me")).status).toBe(401);
    expect((await signIn(email, "motdepasse-test-123")).status).toBe(401);
    expect(await lastMail(email, "account_deleted")).toBeTruthy();

    const row = await db.query.user.findFirst({ where: eq(user.id, u.id) });
    expect(row?.email).toMatch(/^supprime\+[0-9a-f]{8}@orasso\.invalid$/);
    expect(row?.name).toBe("Compte supprimé");
    const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, u.id) });
    expect(p?.pseudo).toMatch(/^supprime_[0-9a-f]{8}$/);
    expect(p).toMatchObject({ firstName: null, lastName: null, phone: null, bio: null, avatarKey: null });
    expect(p?.deletedAt).toBeTruthy();
    const v = await db.query.vehicles.findFirst({ where: eq(vehicles.id, vehicle.id) });
    expect(v).toMatchObject({ status: "sold", plate: null, plateNormalized: null });
    expect(await db.query.vehiclePhotos.findMany({ where: eq(vehiclePhotos.vehicleId, vehicle.id) })).toHaveLength(0);
    expect(await db.query.session.findMany({ where: eq(session.userId, u.id) })).toHaveLength(0);
    expect(await db.query.account.findMany({ where: eq(account.userId, u.id) })).toHaveLength(0);
    expect(await db.query.structureFollows.findMany({ where: eq(structureFollows.userId, u.id) })).toHaveLength(0);
    const audit = await db.query.adminAuditLog.findFirst({ where: eq(adminAuditLog.targetId, u.id) });
    expect(audit).toMatchObject({ action: "user.self_delete", actorUserId: u.id });
    // Profil introuvable pour les autres.
    expect((await call(orga, "GET", `/users/${p!.pseudo}`)).status).toBe(404);

    // Rejouée : rien ne change.
    await accountService.anonymize(u.id, null);
    const again = await db.query.profiles.findFirst({ where: eq(profiles.userId, u.id) });
    expect(again?.pseudo).toBe(p?.pseudo);
    const audits = await db.query.adminAuditLog.findMany({ where: eq(adminAuditLog.targetId, u.id) });
    expect(audits).toHaveLength(1);
  });
});
