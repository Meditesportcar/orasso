// Lot 15 : compte et sécurité — réinitialisation et vérification par e-mail, alertes, clés d'accès comme 2FA,
// parrainage, préférences par type, « près de chez toi », suppression du compte par anonymisation.
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { REFERRAL_SEASON_CAP } from "@orasso/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createPro,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  signUpExtras,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  accessPasses,
  account,
  adminAuditLog,
  applications,
  emailOutbox,
  eventInvitations,
  expressInvites,
  knownLogins,
  notifications,
  passkey,
  plateTransferRequests,
  pointEntries,
  profileInterests,
  profiles,
  proPhotos,
  proProfiles,
  session,
  structureBans,
  structureFollows,
  structures,
  user,
  vehiclePhotos,
  vehicles,
  verification,
} from "../../db/schema";
import { requireOrganizer, twoFactorRequired } from "../../lib/access";
import { resetRateLimits } from "../../lib/rateLimit";
import { realtime } from "../../lib/realtime";
import { dataDir } from "../../lib/storage";
import { accessService } from "../access/service";
import { nearbyService } from "../events/nearby";
import { notificationsService } from "../notifications/service";
import { pointsService } from "../points/service";
import { secondFactorForPath, userVerified } from "../security/passkey";
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
    // Le lien n'ouvre pas de session (elle contournerait la double authentification).
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token=") && !c.includes("Max-Age=0"))).toBe(
      false,
    );
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

describe("clés d'accès comme double authentification (prouvée par la session)", () => {
  it("passkey sur le compte + connexion par mot de passe → 403 ; session ouverte par la clé → acceptée", async () => {
    const orga = await signUp("Cle_01");
    const s = await createStructure(orga.id);
    const e = await createEvent(s.id);
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
    // Clé enregistrée, mais session ouverte par mot de passe : la double authentification n'est pas prouvée.
    expect(await twoFactorRequired(v)).toBe(true);
    const denied = await call(orga, "GET", `/events/${e.id}`);
    expect(denied.status).toBe(403);
    expect(denied.json.error.code).toBe("two_factor_required");
    const me = (await call(orga, "GET", "/me")).json;
    expect(me).toMatchObject({ twoFactorRequired: true, twoFactorHint: "passkey_sign_in" });
    // Session ouverte par la clé (`second_factor = 'passkey'`, posé par le crochet de création de session).
    await db.update(session).set({ secondFactor: "passkey" }).where(eq(session.userId, orga.id));
    expect((await call(orga, "GET", `/events/${e.id}`)).status).toBe(200);
    expect((await call(orga, "GET", "/me")).json).toMatchObject({ twoFactorRequired: false, twoFactorHint: null });
    await expect(requireOrganizer({ ...v, session: { secondFactor: "passkey" } }, s.id)).resolves.toEqual({
      role: "owner",
    });
  });

  it("seule la connexion par clé (avec vérification de l'utilisateur) porte le second facteur", () => {
    expect(secondFactorForPath("/passkey/verify-authentication")).toBe("passkey");
    expect(secondFactorForPath("/sign-in/email")).toBeNull();
    expect(secondFactorForPath("/verify-email")).toBeNull();
    const authData = (flags: number) => Buffer.concat([Buffer.alloc(32), Buffer.from([flags]), Buffer.alloc(4)]);
    expect(userVerified({ response: { authenticatorData: authData(0x05).toString("base64url") } })).toBe(true);
    expect(userVerified({ response: { authenticatorData: authData(0x01).toString("base64url") } })).toBe(false);
    expect(userVerified(null)).toBe(false);
  });
});

describe("notifications de sécurité", () => {
  it("livrées tout de suite, même pendant les heures calmes", async () => {
    const u = await signUp("Nuit_01");
    clock.set(new Date("2026-11-03T22:30:00Z")); // 23:30 à Paris
    const row = await db.transaction((tx) =>
      notificationsService.notify(tx, u.id, "security_new_login", { title: "Nouvelle connexion", body: "x" }),
    );
    expect(row.deliverAfter.getTime()).toBe(clock.now.getTime());
    const other = await db.transaction((tx) =>
      notificationsService.notify(tx, u.id, "points_awarded", { title: "Points", body: "x" }),
    );
    expect(other.deliverAfter.getTime()).toBeGreaterThan(clock.now.getTime());
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
    // En journée : hors heures calmes, sinon les notifications non urgentes attendent 08:00 (test rouge le soir).
    useClock(new Date("2026-10-17T13:00:00Z"));
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
    const types = ["new_event_followed", "points_awarded", "security_password_changed"];
    const journal = (await call(u, "GET", "/me/notifications")).json.items as { type: string }[];
    expect(journal.filter((n) => types.includes(n.type))).toHaveLength(3);
  });

  it("le temps réel dit si la notification est livrée : un type coupé reste au Journal sans bandeau (lot M6)", async () => {
    useClock(new Date("2026-10-17T13:00:00Z"));
    const u = await signUp("Prefs_Live");
    await call(u, "PATCH", "/me/settings", { mutedTypes: ["new_event_followed"] });
    const messages: { type: string; payload: Record<string, unknown> }[] = [];
    const socket = { send: (data: string) => messages.push(JSON.parse(data)) };
    realtime.subscribe(`user:${u.id}`, socket);
    try {
      await db.transaction(async (tx) => {
        await notificationsService.notify(tx, u.id, "new_event_followed", { title: "Coupé", body: "x" });
        await notificationsService.notify(tx, u.id, "points_awarded", { title: "Reçu", body: "x" });
      });
      await notificationsService.deliverDue();
    } finally {
      realtime.unsubscribeAll(socket);
    }
    const byTitle = (t: string) => messages.find((m) => m.type === "notification" && m.payload.title === t);
    expect(byTitle("Coupé")?.payload.delivered).toBe(false);
    expect(byTitle("Reçu")?.payload.delivered).toBe(true);
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

describe("« près de chez toi » : types d'événements choisis (lot M6)", () => {
  it("les types choisis filtrent ; sans centre d'intérêt, types + distance suffisent ; sans rien, personne", async () => {
    const ref = await seedReference();
    const orga = await signUp("Orga_Fmt");
    const s = await createStructure(orga.id);
    const memeType = await signUp("Meme_Type");
    const autreType = await signUp("Autre_Type");
    const sansFormat = await signUp("Sans_Type");
    const seulFormat = await signUp("Seul_Type");
    const seulLoin = await signUp("Seul_Loin");
    const rien = await signUp("Rien_Du_Tout");
    const prefs: [TestUser, string[], boolean][] = [
      [memeType, ["gathering"], true],
      [autreType, ["night"], true],
      [sansFormat, [], true],
      [seulFormat, ["gathering"], false],
      [seulLoin, ["gathering"], false],
      [rien, [], false],
    ];
    for (const [u, formats, interest] of prefs) {
      await db
        .update(profiles)
        .set({ departments: [u === seulLoin ? "59" : "66"], radiusKm: 100, preferredFormats: formats })
        .where(eq(profiles.userId, u.id));
      if (interest) await db.insert(profileInterests).values({ userId: u.id, categoryId: ref.jdm.id });
    }
    const e = await createEvent(s.id, {
      lat: 42.69,
      lng: 2.9,
      format: "gathering",
      criteria: { categoryIds: [ref.jdm.id], makeIds: [], countries: [], text: null },
    });
    expect(await nearbyService.notifyNearby(e.id)).toBe(3);
    const sent = await db.query.notifications.findMany({ where: eq(notifications.type, "event_nearby_interest") });
    expect(sent.map((n) => n.userId).sort()).toEqual([memeType.id, sansFormat.id, seulFormat.id].sort());
    // Un événement sans catégorie ne prévient que les comptes sans centre d'intérêt qui ont choisi des types.
    const sansCategorie = await createEvent(s.id, { lat: 42.69, lng: 2.9, format: "gathering", criteria: null });
    expect(await nearbyService.notifyNearby(sansCategorie.id)).toBe(1);
  });
});

describe("« près de chez toi » : exclusions", () => {
  it("bannis, structure suspendue ou supprimée, événement passé : personne", async () => {
    const ref = await seedReference();
    const orga = await signUp("Orga_Excl");
    const s = await createStructure(orga.id);
    const fan = await signUp("Fan_66");
    const banni = await signUp("Banni_66");
    for (const u of [fan, banni]) {
      await db
        .update(profiles)
        .set({ departments: ["66"], radiusKm: 100 })
        .where(eq(profiles.userId, u.id));
      await db.insert(profileInterests).values({ userId: u.id, categoryId: ref.jdm.id });
    }
    await db.insert(structureBans).values({ structureId: s.id, userId: banni.id, createdBy: orga.id });
    const criteria = { categoryIds: [ref.jdm.id], makeIds: [], countries: [], text: null };
    const e = await createEvent(s.id, { lat: 42.69, lng: 2.9, criteria });
    expect(await nearbyService.notifyNearby(e.id)).toBe(1);
    const sent = await db.query.notifications.findMany({ where: eq(notifications.type, "event_nearby_interest") });
    expect(sent.map((n) => n.userId)).toEqual([fan.id]);

    const passe = await createEvent(s.id, {
      lat: 42.69,
      lng: 2.9,
      criteria,
      startsAt: new Date(clock.now.getTime() - 86_400_000),
    });
    expect(await nearbyService.notifyNearby(passe.id)).toBe(0);
    const e2 = await createEvent(s.id, { lat: 42.69, lng: 2.9, criteria });
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, s.id));
    expect(await nearbyService.notifyNearby(e2.id)).toBe(0);
  });
});

describe("parrainage et inscription express", () => {
  it("un compte créé par l'inscription express ne compte pas ; l'e-mail de vérification part quand même", async () => {
    const parrain = await signUp("Parrain_Ex");
    const pp = await db.query.profiles.findFirst({ where: eq(profiles.userId, parrain.id) });
    const orga = await signUp("Orga_Ex");
    const s = await createStructure(orga.id);
    const e = await createEvent(s.id);
    const email = `express-${randomBytes(3).toString("hex")}@orasso.test`;
    // Invitation express en cours pour l'adresse : la vérification n'est plus retenue (effet de bord corrigé).
    await db.insert(expressInvites).values({
      eventId: e.id,
      email,
      token: randomBytes(16).toString("base64url"),
      createdBy: orga.id,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({
        email,
        password: "motdepasse-test-123",
        name: "Express_01",
        termsAccepted: true,
        ...signUpExtras,
      }),
    });
    expect(res.status).toBe(200);
    expect(await lastMail(email, "email_verification")).toBeTruthy();
    await db.update(expressInvites).set({ usedAt: new Date() }).where(eq(expressInvites.email, email));
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const u = { id: "", pseudo: "Express_01", email, cookie };
    expect((await call(u, "POST", "/me/referral", { token: pp!.inviteToken })).status).toBe(409);
  });
});

describe("réglages", () => {
  it("widgets de l'accueil bornés (forme {order, hidden} du lot 30)", async () => {
    const u = await signUp("Widgets_01");
    const ok = { order: ["weather", "fuel"], hidden: ["wash"] };
    expect((await call(u, "PATCH", "/me/settings", { homeWidgets: ok })).status).toBe(200);
    const tooMany = { order: Array.from({ length: 31 }, () => "weather"), hidden: [] };
    expect((await call(u, "PATCH", "/me/settings", { homeWidgets: tooMany })).status).toBe(400);
    expect((await call(u, "PATCH", "/me/settings", { homeWidgets: [{ id: "meteo", visible: true }] })).status).toBe(
      400,
    );
    expect(
      (await call(u, "PATCH", "/me/settings", { homeWidgets: { order: ["x".repeat(200)], hidden: [] } })).status,
    ).toBe(400);
  });
});

describe("suppression du compte", () => {
  it("anonymisation complète, 401 ensuite, e-mail de confirmation exact, idempotente", async () => {
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
    // Traces ailleurs : candidature à venir retenue (avec QR), candidature passée, invitation, express, transfert,
    // fiche pro, jeton de réinitialisation.
    const futur = await createEvent(s.id, { startsAt: new Date(Date.now() + 10 * 86_400_000) });
    const passe = await createEvent(s.id, {
      startsAt: new Date(Date.now() - 10 * 86_400_000),
      endsAt: new Date(Date.now() - 9 * 86_400_000),
    });
    const [aFutur] = await db
      .insert(applications)
      .values({
        eventId: futur.id,
        userId: u.id,
        vehicleId: vehicle.id,
        status: "accepted",
        rulesAcceptedAt: new Date(),
        followStructure: false,
        message: "Je viens avec mon frère",
      })
      .returning();
    await db.transaction((tx) => accessService.issue(tx, aFutur!));
    const [aPasse] = await db
      .insert(applications)
      .values({
        eventId: passe.id,
        userId: u.id,
        vehicleId: vehicle.id,
        status: "accepted",
        rulesAcceptedAt: new Date(),
        followStructure: false,
        message: "Merci",
      })
      .returning();
    await db.insert(eventInvitations).values({ eventId: futur.id, email, token: randomBytes(8).toString("hex") });
    await db.insert(expressInvites).values({
      eventId: futur.id,
      email,
      token: randomBytes(16).toString("base64url"),
      createdBy: orga.id,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await db.insert(plateTransferRequests).values({
      plateNormalized: "AB123CD",
      fromVehicleId: vehicle.id,
      toUserId: u.id,
    });
    await createPro(u.id, { phone: "0611111111", email: "pro@exemple.fr" });
    await app.request("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, redirectTo: "/reinitialisation" }),
    });
    expect(await db.query.verification.findMany({ where: eq(verification.value, u.id) })).not.toHaveLength(0);

    // Mauvaise confirmation : un seul message.
    const wrong = await call(u, "DELETE", "/me", { password: "mauvais" });
    expect(wrong.status).toBe(403);
    expect(wrong.json.error.message).toBe("Confirmation incorrecte");
    // Propriétaire d'une structure : refus.
    expect((await call(orga, "DELETE", "/me", { password: "motdepasse-test-123" })).json.error.code).toBe(
      "structure_owner",
    );

    const res = await call(u, "DELETE", "/me", { password: "motdepasse-test-123" });
    expect(res.status).toBe(200);
    expect((await call(u, "GET", "/me")).status).toBe(401);
    expect((await signIn(email, "motdepasse-test-123")).status).toBe(401);

    // E-mail de confirmation, envoyé avant l'anonymisation ; l'adresse ne reste pas dans la file des e-mails.
    const sent = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.template, "account_deleted") });
    expect(sent?.subject).toBe("Ton compte Orasso est supprimé");
    expect(sent?.payload).toEqual({ userId: u.id });
    expect(sent?.to).toMatch(/^supprime\+[0-9a-f]{8}@orasso\.invalid$/);
    expect(await db.query.emailOutbox.findMany({ where: eq(emailOutbox.to, email) })).toHaveLength(0);

    const row = await db.query.user.findFirst({ where: eq(user.id, u.id) });
    expect(row?.email).toBe(sent?.to);
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
    expect(await db.query.verification.findMany({ where: eq(verification.value, u.id) })).toHaveLength(0);
    expect(await db.query.structureFollows.findMany({ where: eq(structureFollows.userId, u.id) })).toHaveLength(0);
    // Candidature à venir : désistée sans malus, QR révoqué ; candidature passée conservée, sans message.
    const af = await db.query.applications.findFirst({ where: eq(applications.id, aFutur!.id) });
    expect(af).toMatchObject({ status: "withdrawn", withdrawnAfterLock: false, message: null });
    const pass = await db.query.accessPasses.findFirst({ where: eq(accessPasses.applicationId, aFutur!.id) });
    expect(pass?.revokedAt).toBeTruthy();
    const ap = await db.query.applications.findFirst({ where: eq(applications.id, aPasse!.id) });
    expect(ap).toMatchObject({ status: "accepted", message: null });
    expect(await db.query.eventInvitations.findMany({ where: eq(eventInvitations.email, email) })).toHaveLength(0);
    expect(await db.query.expressInvites.findMany({ where: eq(expressInvites.email, email) })).toHaveLength(0);
    expect(
      await db.query.plateTransferRequests.findMany({ where: eq(plateTransferRequests.toUserId, u.id) }),
    ).toHaveLength(0);
    const pro = await db.query.proProfiles.findFirst({ where: eq(proProfiles.ownerUserId, u.id) });
    expect(pro).toMatchObject({ phone: null, email: null });
    expect(pro?.deletedAt).toBeTruthy();
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

  it("5 essais par quart d'heure ; code de secours accepté ; session par clé vaut second facteur", async () => {
    const u = await signUp("Partant_02");
    const enabled = await call(u, "POST", "/auth/two-factor/enable", { password: "motdepasse-test-123" });
    expect(enabled.status).toBe(200);
    const backup: string = enabled.json.backupCodes[0];
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, u.id));
    // Sans code : refus (même message) ; le compteur avance.
    for (let i = 0; i < 4; i++) {
      const r = await call(u, "DELETE", "/me", { password: "motdepasse-test-123" });
      expect(r.status).toBe(403);
      expect(r.json.error.message).toBe("Confirmation incorrecte");
    }
    expect((await call(u, "DELETE", "/me", { password: "motdepasse-test-123", totpCode: "000000" })).status).toBe(403);
    expect((await call(u, "DELETE", "/me", { password: "motdepasse-test-123", totpCode: backup })).status).toBe(429);
    resetRateLimits();
    expect((await call(u, "DELETE", "/me", { password: "motdepasse-test-123", totpCode: backup })).status).toBe(200);

    // Compte avec 2FA, session ouverte par clé : pas de code demandé.
    const w = await signUp("Partant_03");
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, w.id));
    expect((await call(w, "DELETE", "/me", { password: "motdepasse-test-123" })).status).toBe(403);
    await db.update(session).set({ secondFactor: "passkey" }).where(eq(session.userId, w.id));
    expect((await call(w, "DELETE", "/me", { password: "motdepasse-test-123" })).status).toBe(200);
    // Une dizaine de vérifications de mot de passe (scrypt) : plus long que la moyenne sur une machine chargée.
  }, 60_000);

  it("un profil supprimé est refusé même si une session subsiste", async () => {
    const u = await signUp("Fantome_01");
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, u.id));
    expect((await call(u, "GET", "/me")).status).toBe(401);
  });
});

describe("suppression du compte : atomicité et données restantes", () => {
  it("échec de la transaction → aucun e-mail, aucun désistement, rien d'anonymisé", async () => {
    const ref = await seedReference();
    const u = await signUp("Atomique_01");
    const vehicle = await createVehicle(u.id, ref);
    const orga = await signUp("Orga_Atom");
    const s = await createStructure(orga.id);
    const futur = await createEvent(s.id, { startsAt: new Date(Date.now() + 10 * 86_400_000) });
    const [app0] = await db
      .insert(applications)
      .values({
        eventId: futur.id,
        userId: u.id,
        vehicleId: vehicle.id,
        status: "accepted",
        rulesAcceptedAt: new Date(),
        followStructure: false,
      })
      .returning();
    // Échec simulé à la fin de la transaction (écriture du journal d'administration).
    await db.execute(sql`
      create or replace function orasso_test_fail() returns trigger language plpgsql as $$
      begin raise exception 'échec simulé'; end $$`);
    await db.execute(sql`
      create trigger orasso_test_fail before insert on admin_audit_log
      for each row when (new.action = 'user.self_delete') execute function orasso_test_fail()`);
    try {
      const res = await call(u, "DELETE", "/me", { password: "motdepasse-test-123" });
      expect(res.status).toBe(500);
    } finally {
      await db.execute(sql`drop trigger if exists orasso_test_fail on admin_audit_log`);
      await db.execute(sql`drop function if exists orasso_test_fail()`);
    }
    await notificationsService.flush();
    expect(await db.query.emailOutbox.findMany({ where: eq(emailOutbox.template, "account_deleted") })).toHaveLength(0);
    expect((await db.query.applications.findFirst({ where: eq(applications.id, app0!.id) }))?.status).toBe("accepted");
    const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, u.id) });
    expect(p?.deletedAt).toBeNull();
    expect((await call(u, "GET", "/me")).status).toBe(200);
  }, 60_000);

  it("fiche pro vidée (nom, coordonnées, photos), Journal effacé", async () => {
    const u = await signUp("ProPartant_01");
    const pro = await createPro(u.id, { phone: "0611111111", email: "pro@exemple.fr", website: "https://exemple.fr" });
    await db.insert(proPhotos).values({ proId: pro.id, storageKey: `test/pro-${pro.id}.webp` });
    await db.transaction((tx) =>
      notificationsService.notify(tx, u.id, "points_awarded", { title: "Points", body: "x" }),
    );
    expect((await call(u, "DELETE", "/me", { password: "motdepasse-test-123" })).status).toBe(200);
    const after = await db.query.proProfiles.findFirst({ where: eq(proProfiles.id, pro.id) });
    expect(after).toMatchObject({
      name: "Fiche supprimée",
      phone: null,
      email: null,
      website: null,
      addressLine: null,
      siret: null,
      publishedAt: null,
    });
    expect(after?.deletedAt).toBeTruthy();
    expect(await db.query.proPhotos.findMany({ where: eq(proPhotos.proId, pro.id) })).toHaveLength(0);
    expect(await db.query.notifications.findMany({ where: eq(notifications.userId, u.id) })).toHaveLength(0);
  }, 60_000);
});
