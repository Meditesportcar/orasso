// Administration (lot 33) : droits de toutes les routes `/admin/*` (utilisateur, organisateur, modérateur, super admin
// sans second facteur), accueil et compteurs, registre des utilisateurs (recherche, fiche sans secret), réinitialisation
// de la double authentification (A5), anonymisation par l'équipe et par la personne (un seul service), base véhicules
// et file « Autre », journal filtré et paginé. Routes sensibles jouées en cookie (site) ET en jeton porteur (appli).
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createPro,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  adminAuditLog,
  emailOutbox,
  mediaProfiles,
  notifications,
  passkey,
  profiles,
  session,
  structures,
  twoFactor,
  user,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
  vehicles,
} from "../../db/schema";
import { isProtectedTemplate, withinMailBudget } from "../../lib/mail";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const MODES = ["cookie", "bearer"] as const;
type Mode = (typeof MODES)[number];

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
  return { status: res.status, json, text };
}

let admin: TestUser;
let moderator: TestUser;
let fan: TestUser;
let orga: TestUser;

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
  admin = await signUp("Damien_Admin", { twoFactor: true, role: "super_admin" });
  moderator = await signUp("Modo_66", { twoFactor: true, role: "moderator" });
  fan = await signUp("Kenji_66");
  orga = await signUp("Orga_66", { twoFactor: true });
  await createStructure(orga.id);
});

const UUID = "00000000-0000-4000-8000-000000000000";

/** Chaque route de l'administration du lot 33, avec un corps valide (le refus doit venir des droits). */
const ADMIN_ROUTES: [string, string, unknown?][] = [
  ["GET", "/admin/overview"],
  ["GET", "/admin/audit"],
  ["GET", "/admin/users"],
  ["GET", "/admin/users/x123"],
  ["POST", "/admin/users/x123/reset-two-factor", { reason: "Téléphone perdu" }],
  ["POST", "/admin/users/x123/anonymize", { reason: "Demande écrite reçue" }],
  ["POST", "/admin/users/x123/sanction", { kind: "warning", reason: "insult", note: "Propos insultants" }],
  ["POST", "/admin/users/x123/role", { role: "moderator", reason: "Aide à la modération" }],
  ["GET", "/admin/structure-registry"],
  ["PATCH", `/admin/structures/${UUID}/quota`, { followerMessageQuota: 6, reason: "Club très actif" }],
  ["GET", "/admin/pros"],
  ["POST", `/admin/pros/${UUID}/verify`, { verified: true, note: "Kbis reçu par e-mail" }],
  ["GET", "/admin/vehicle-reference/makes"],
  ["GET", "/admin/vehicle-reference/others"],
  ["POST", "/admin/vehicle-reference/makes", { name: "Alpine", country: "FR" }],
  ["PATCH", `/admin/vehicle-reference/makes/${UUID}`, { name: "Alpine" }],
  ["DELETE", `/admin/vehicle-reference/makes/${UUID}`],
  ["POST", `/admin/vehicles/${UUID}/reassign`, { makeId: UUID, modelId: UUID, generationId: null }],
  ["GET", "/admin/vehicle-reference/proposals"],
  ["POST", `/admin/vehicle-reference/proposals/model.${UUID}.207/accept`, { makeId: UUID, modelName: "207" }],
  ["GET", "/admin/assistance-requests"],
  ["POST", `/admin/assistance-requests/${UUID}/close`],
  ["GET", "/admin/settings"],
  ["PUT", "/admin/settings/points.malus", { value: -15 }],
  ["GET", "/admin/newsletters"],
  ["POST", "/admin/newsletters", { subject: "Bonjour", bodyMd: "Texte" }],
  ["POST", `/admin/newsletters/${UUID}/schedule`, { at: "2026-10-18T10:00:00+02:00" }],
  ["POST", `/admin/newsletters/${UUID}/test`],
  ["GET", "/admin/message-templates"],
  ["POST", "/admin/message-templates", { kind: "message", name: "Bienvenue", body: "Bonjour" }],
  ["DELETE", `/admin/message-templates/${UUID}`],
  // Relecture : routes oubliées du balayage.
  ["PATCH", `/admin/message-templates/${UUID}`, { name: "Bienvenue" }],
  ["GET", `/admin/vehicle-reference/makes/${UUID}/models`],
  ["GET", `/admin/vehicle-reference/models/${UUID}/generations`],
  ["POST", "/admin/vehicle-reference/models", { makeId: UUID, name: "A110", vehicleType: "car" }],
  ["PATCH", `/admin/vehicle-reference/models/${UUID}`, { name: "A110" }],
  ["DELETE", `/admin/vehicle-reference/models/${UUID}`],
  ["POST", "/admin/vehicle-reference/generations", { modelId: UUID, name: "Berlinette" }],
  ["PATCH", `/admin/vehicle-reference/generations/${UUID}`, { name: "Berlinette" }],
  ["DELETE", `/admin/vehicle-reference/generations/${UUID}`],
  ["GET", `/admin/newsletters/${UUID}`],
  ["PUT", `/admin/newsletters/${UUID}`, { subject: "Bonjour", bodyMd: "Texte" }],
  ["DELETE", `/admin/newsletters/${UUID}`],
  ["GET", "/admin/newsletters/audience"],
  ["POST", `/admin/newsletters/${UUID}/unschedule`],
  ["POST", `/admin/newsletters/${UUID}/pause`],
  ["POST", `/admin/newsletters/${UUID}/resume`],
  ["POST", `/admin/newsletters/${UUID}/send-now`, { confirmRecipients: 0 }],
];

describe("droits de l'administration", () => {
  for (const mode of MODES) {
    it(`toutes les routes refusées au passionné, à l'équipe organisatrice, au modérateur, et sans second facteur (${mode})`, async () => {
      const noFactor = await signUp("Admin_Sans_Code", { role: "super_admin" });
      for (const [method, path, body] of ADMIN_ROUTES) {
        expect((await req(null, method, path, body, mode)).status, `${method} ${path} anonyme`).toBe(401);
        for (const who of [fan, orga, moderator]) {
          const res = await req(who, method, path, body, mode);
          expect(res.status, `${method} ${path} ${who.pseudo}`).toBe(403);
        }
        const res = await req(noFactor, method, path, body, mode);
        expect(res.status, `${method} ${path} sans 2FA`).toBe(403);
        expect(res.json.error.code).toBe("two_factor_required");
      }
    });
  }

  it("le modérateur garde la file des signalements, rien d'autre", async () => {
    expect((await req(moderator, "GET", "/admin/reports")).status).toBe(200);
    expect((await req(moderator, "GET", "/admin/overview")).status).toBe(403);
    expect((await req(moderator, "GET", "/admin/users")).status).toBe(403);
  });
});

describe("accueil", () => {
  it("mediaToVerify compte seulement les profils actifs non vérifiés et suit la vérification", async () => {
    const verified = await signUp("Media_Verifie");
    const deleted = await signUp("Media_Supprime");
    const [pending] = await db
      .insert(mediaProfiles)
      .values([
        { userId: fan.id, name: "Média à vérifier" },
        { userId: verified.id, name: "Média vérifié", pressCardVerifiedAt: new Date() },
        { userId: deleted.id, name: "Média supprimé", deletedAt: new Date() },
      ])
      .returning();
    expect((await req(admin, "GET", "/admin/overview")).json.mediaToVerify).toBe(1);
    expect((await req(admin, "POST", `/admin/media/${pending!.id}/verify`, {})).status).toBe(200);
    expect((await req(admin, "GET", "/admin/overview")).json.mediaToVerify).toBe(0);
    expect((await req(admin, "POST", `/admin/media/${pending!.id}/verify`, { verified: false })).status).toBe(200);
    expect((await req(admin, "GET", "/admin/overview")).json.mediaToVerify).toBe(1);
  });

  it("compte les files à traiter", async () => {
    const ref = await seedReference();
    const [other] = await db.insert(vehicleMakes).values({ name: "Autre", slug: "autre", isOther: true }).returning();
    const [otherModel] = await db
      .insert(vehicleModels)
      .values({ makeId: other!.id, name: "Autre", slug: "autre", vehicleType: "car", isOther: true })
      .returning();
    await createVehicle(
      fan.id,
      { makeId: other!.id, modelId: otherModel!.id, generationId: ref.generationId },
      {
        generationId: null,
      },
    );
    await createPro(fan.id);
    const pending = await createStructure(fan.id, false);
    await db.update(structures).set({ verification: "pending" }).where(eq(structures.id, pending.id));
    const res = await req(admin, "GET", "/admin/overview");
    expect(res.status).toBe(200);
    expect(res.json.otherVehicles).toBe(1);
    expect(res.json.prosToVerify).toBe(1);
    expect(res.json.structuresPending).toBe(1);
    expect(res.json).toHaveProperty("reportsPending", 0);
    expect(Object.values(res.json).every((n) => typeof n === "number")).toBe(true);
  });
});

describe("registre des utilisateurs", () => {
  it("recherche par pseudo ou adresse, fiche sans secret, consultation tracée", async () => {
    const byPseudo = await req(admin, "GET", "/admin/users?q=kenji");
    expect(byPseudo.json.items.map((u: { pseudo: string }) => u.pseudo)).toEqual(["Kenji_66"]);
    const byEmail = await req(admin, "GET", `/admin/users?q=${encodeURIComponent(fan.email)}`);
    expect(byEmail.json.items).toHaveLength(1);
    const page = await req(admin, "GET", "/admin/users?limit=2");
    expect(page.json.items).toHaveLength(2);
    expect(page.json.nextCursor).toBeTruthy();
    const next = await req(admin, "GET", `/admin/users?limit=2&cursor=${page.json.nextCursor}`);
    expect(next.json.items.map((u: { id: string }) => u.id)).not.toContain(page.json.items[0].id);

    await db
      .insert(twoFactor)
      .values({ id: "tf-orga", userId: orga.id, secret: "SECRET-TOTP-XYZ", backupCodes: "CODES-XYZ" });
    const detail = await req(admin, "GET", `/admin/users/${orga.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json.structures).toHaveLength(1);
    expect(detail.json.twoFactor.totp).toBe(true);
    const tokens = await db.select({ token: session.token }).from(session).where(eq(session.userId, orga.id));
    for (const secret of ["SECRET-TOTP-XYZ", "CODES-XYZ", "password", ...tokens.map((t) => t.token)]) {
      expect(detail.text).not.toContain(secret);
    }
    const [trace] = await db
      .select()
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.action, "user.view"), eq(adminAuditLog.targetId, orga.id)));
    expect(trace?.actorUserId).toBe(admin.id);
  });
});

describe("réinitialisation de la double authentification (A5)", () => {
  for (const mode of MODES) {
    it(`motif obligatoire, sessions fermées, facteurs retirés, e-mail de sécurité, journal (${mode})`, async () => {
      await db
        .insert(twoFactor)
        .values({ id: `tf-${mode}`, userId: orga.id, secret: "s", backupCodes: "b", verified: true });
      await db.insert(passkey).values({
        id: `pk-${mode}`,
        userId: orga.id,
        publicKey: "k",
        credentialID: `cred-${mode}`,
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
        createdAt: new Date(),
      });
      expect((await req(admin, "POST", `/admin/users/${orga.id}/reset-two-factor`, {}, mode)).status).toBe(400);
      expect((await req(admin, "POST", `/admin/users/${orga.id}/reset-two-factor`, { reason: "x" }, mode)).status).toBe(
        400,
      );
      const res = await req(
        admin,
        "POST",
        `/admin/users/${orga.id}/reset-two-factor`,
        { reason: "Téléphone perdu, pièce d'identité vérifiée" },
        mode,
      );
      expect(res.status).toBe(200);
      expect(await db.query.twoFactor.findFirst({ where: eq(twoFactor.userId, orga.id) })).toBeUndefined();
      expect(await db.query.passkey.findFirst({ where: eq(passkey.userId, orga.id) })).toBeUndefined();
      expect((await db.query.user.findFirst({ where: eq(user.id, orga.id) }))?.twoFactorEnabled).toBe(false);
      expect(await db.query.session.findFirst({ where: eq(session.userId, orga.id) })).toBeUndefined();
      // Ancienne session refusée : la personne se reconnecte puis reconfigure sa double authentification.
      expect((await req(orga, "GET", "/me", undefined, mode)).status).toBe(401);
      await notificationsService.flush();
      const mails = await db.select().from(emailOutbox).where(eq(emailOutbox.to, orga.email));
      expect(mails.map((m) => m.template)).toContain("security_two_factor_reset");
      const [trace] = await db
        .select()
        .from(adminAuditLog)
        .where(and(eq(adminAuditLog.action, "user.reset_two_factor"), eq(adminAuditLog.targetId, orga.id)));
      expect(trace).toMatchObject({ actorUserId: admin.id, reason: "Téléphone perdu, pièce d'identité vérifiée" });
    });
  }

  it("e-mail de sécurité : il passe dans la réserve du budget, pas la newsletter", () => {
    expect(isProtectedTemplate("security_two_factor_reset")).toBe(true);
    expect(withinMailBudget("security_two_factor_reset", 280, 300)).toBe(true);
    expect(withinMailBudget("newsletter", 280, 300)).toBe(false);
  });

  it("refusée sur soi-même et au modérateur, même sur un super admin", async () => {
    const self = await req(admin, "POST", `/admin/users/${admin.id}/reset-two-factor`, { reason: "Je me trompe" });
    expect(self.status).toBe(409);
    expect(self.json.error.code).toBe("self_action");
    const other = await signUp("Autre_Admin", { twoFactor: true, role: "super_admin" });
    expect(
      (await req(moderator, "POST", `/admin/users/${other.id}/reset-two-factor`, { reason: "Pas son rôle" })).status,
    ).toBe(403);
  });
});

describe("anonymisation : un seul service pour l'équipe et pour la personne", () => {
  for (const mode of MODES) {
    it(`par l'équipe : motif, journal, compte effacé ; refusée sur soi et sur l'équipe (${mode})`, async () => {
      expect(
        (await req(admin, "POST", `/admin/users/${admin.id}/anonymize`, { reason: "Essai sur moi" }, mode)).status,
      ).toBe(409);
      expect(
        (
          await req(
            admin,
            "POST",
            `/admin/users/${moderator.id}/anonymize`,
            { reason: "Pas un compte ordinaire" },
            mode,
          )
        ).status,
      ).toBe(409);
      const res = await req(
        admin,
        "POST",
        `/admin/users/${fan.id}/anonymize`,
        { reason: "Demande RGPD reçue par courrier" },
        mode,
      );
      expect(res.status).toBe(200);
      const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, fan.id) });
      expect(p?.deletedAt).not.toBeNull();
      expect(p?.pseudo).toMatch(/^supprime_/);
      expect((await db.query.user.findFirst({ where: eq(user.id, fan.id) }))?.email).toMatch(/@orasso\.invalid$/);
      const [trace] = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "user.anonymize"));
      expect(trace).toMatchObject({
        actorUserId: admin.id,
        targetId: fan.id,
        reason: "Demande RGPD reçue par courrier",
      });
      // Rejouée : rien de plus.
      expect(
        (await req(admin, "POST", `/admin/users/${fan.id}/anonymize`, { reason: "Deuxième fois" }, mode)).status,
      ).toBe(200);
    });
  }

  it("propriétaire d'une structure : refusée (comme DELETE /me)", async () => {
    const res = await req(admin, "POST", `/admin/users/${orga.id}/anonymize`, { reason: "Demande écrite reçue" });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("structure_owner");
  });

  it("par la personne (DELETE /me) : même effacement, trace « self_delete »", async () => {
    const res = await req(fan, "DELETE", "/me", { password: "motdepasse-test-123" });
    expect(res.status).toBe(200);
    expect((await db.query.profiles.findFirst({ where: eq(profiles.userId, fan.id) }))?.deletedAt).not.toBeNull();
    const [trace] = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "user.self_delete"));
    expect(trace).toMatchObject({ actorUserId: fan.id, targetId: fan.id });
  });
});

describe("sanction et rôle depuis la fiche", () => {
  it("sanction directe tracée ; jamais un super admin ni soi-même", async () => {
    const res = await req(admin, "POST", `/admin/users/${fan.id}/sanction`, {
      kind: "suspension_7d",
      reason: "harassment",
      note: "Messages répétés à plusieurs membres",
    });
    expect(res.status).toBe(201);
    expect((await db.query.profiles.findFirst({ where: eq(profiles.userId, fan.id) }))?.suspendedUntil).not.toBeNull();
    const other = await signUp("Autre_Admin2", { twoFactor: true, role: "super_admin" });
    expect(
      (
        await req(admin, "POST", `/admin/users/${other.id}/sanction`, {
          kind: "warning",
          reason: "spam",
          note: "Essai interdit",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await req(admin, "POST", `/admin/users/${admin.id}/sanction`, {
          kind: "warning",
          reason: "spam",
          note: "Essai interdit",
        })
      ).status,
    ).toBe(409);
  });

  it("rôle de modérateur donné puis retiré ; jamais son propre rôle", async () => {
    const give = await req(admin, "POST", `/admin/users/${fan.id}/role`, {
      role: "moderator",
      reason: "Aide à la modération",
    });
    expect(give.json.platformRole).toBe("moderator");
    expect(
      (await req(admin, "POST", `/admin/users/${admin.id}/role`, { role: "user", reason: "Je descends" })).status,
    ).toBe(409);
    const back = await req(admin, "POST", `/admin/users/${fan.id}/role`, { role: "user", reason: "Fin de mission" });
    expect(back.json.platformRole).toBe("user");
    const traces = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "user.role"));
    expect(traces).toHaveLength(2);
  });
});

describe("base véhicules et file « Autre »", () => {
  it("une marque créée a son « Autre » ; un véhicule « Autre » rattaché, propriétaire prévenu ; suppression refusée si utilisée", async () => {
    const ref = await seedReference();
    const [other] = await db.insert(vehicleMakes).values({ name: "Autre", slug: "autre", isOther: true }).returning();
    const [otherModel] = await db
      .insert(vehicleModels)
      .values({ makeId: other!.id, name: "Autre", slug: "autre", vehicleType: "car", isOther: true })
      .returning();
    const vehicle = await createVehicle(
      fan.id,
      { makeId: other!.id, modelId: otherModel!.id, generationId: ref.generationId },
      {
        generationId: null,
        description: "Alpine A110 bleue de 1972",
      },
    );
    const queue = await req(admin, "GET", "/admin/vehicle-reference/others");
    expect(queue.json).toHaveLength(1);
    expect(queue.json[0]).toMatchObject({ level: "make" });
    expect(queue.json[0].vehicles[0]).toMatchObject({ id: vehicle.id, description: "Alpine A110 bleue de 1972" });

    const make = await req(admin, "POST", "/admin/vehicle-reference/makes", { name: "Alpine", country: "FR" });
    expect(make.status).toBe(201);
    expect((await req(admin, "POST", "/admin/vehicle-reference/makes", { name: "Alpine" })).status).toBe(409);
    const models = await req(admin, "GET", `/admin/vehicle-reference/makes/${make.json.id}/models`);
    expect(models.json).toEqual([expect.objectContaining({ name: "Autre", isOther: true })]);
    const model = await req(admin, "POST", "/admin/vehicle-reference/models", {
      makeId: make.json.id,
      name: "A110",
      vehicleType: "car",
    });
    const gen = await req(admin, "POST", "/admin/vehicle-reference/generations", {
      modelId: model.json.id,
      name: "Berlinette",
      yearFrom: 1962,
      yearTo: 1977,
    });
    expect(gen.status).toBe(201);
    // Génération d'un autre modèle : refusée.
    expect(
      (
        await req(admin, "POST", `/admin/vehicles/${vehicle.id}/reassign`, {
          makeId: make.json.id,
          modelId: model.json.id,
          generationId: ref.generationId,
        })
      ).status,
    ).toBe(400);
    const done = await req(admin, "POST", `/admin/vehicles/${vehicle.id}/reassign`, {
      makeId: make.json.id,
      modelId: model.json.id,
      generationId: gen.json.id,
    });
    expect(done.status).toBe(200);
    const row = await db.query.vehicles.findFirst({ where: eq(vehicles.id, vehicle.id) });
    expect(row).toMatchObject({ makeId: make.json.id, modelId: model.json.id, generationId: gen.json.id });
    // Rien n'est perdu : photo et description gardées.
    expect(row?.description).toBe("Alpine A110 bleue de 1972");
    const [notif] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, fan.id), eq(notifications.type, "vehicle_reassigned")));
    expect(notif?.body).toContain("Alpine A110 Berlinette");
    expect((await req(admin, "GET", "/admin/vehicle-reference/others")).json).toHaveLength(0);

    const used = await req(admin, "DELETE", `/admin/vehicle-reference/makes/${make.json.id}`);
    expect(used.status).toBe(409);
    const spare = await req(admin, "POST", "/admin/vehicle-reference/makes", { name: "Venturi", country: "FR" });
    expect((await req(admin, "DELETE", `/admin/vehicle-reference/makes/${spare.json.id}`)).status).toBe(204);
    expect(await db.query.vehicleModels.findFirst({ where: eq(vehicleModels.makeId, spare.json.id) })).toBeUndefined();
    expect((await req(admin, "DELETE", `/admin/vehicle-reference/generations/${gen.json.id}`)).status).toBe(409);
    expect(await db.query.vehicleGenerations.findFirst({ where: eq(vehicleGenerations.id, gen.json.id) })).toBeTruthy();
    const traces = await db.select({ action: adminAuditLog.action }).from(adminAuditLog);
    expect(traces.map((t) => t.action)).toEqual(
      expect.arrayContaining(["reference.make_create", "reference.model_create", "vehicle.reassign"]),
    );
  });
});

describe("modèles proposés (lot R4a, maquette R4.8b)", () => {
  async function peugeotWithOther() {
    const [make] = await db
      .insert(vehicleMakes)
      .values({ name: "Peugeot", slug: "peugeot", country: "FR" })
      .returning();
    const [other] = await db
      .insert(vehicleModels)
      .values({ makeId: make!.id, name: "Autre", slug: "autre", vehicleType: "car", isOther: true })
      .returning();
    const [otherGen] = await db
      .insert(vehicleGenerations)
      .values({ modelId: other!.id, name: "Autre", isOther: true })
      .returning();
    return { makeId: make!.id, modelId: other!.id, generationId: otherGen!.id };
  }

  it("regroupés par texte normalisé, la plus grosse file en tête ; rattachement groupé en une transaction", async () => {
    const peugeot = await peugeotWithOther();
    const lea = await signUp("Lea_66");
    const theo = await signUp("Theo_11");
    const typed = (ownerId: string, proposedModel: string, year = 2008) =>
      createVehicle(ownerId, peugeot, { generationId: null, proposedModel, year });
    const a = await typed(fan.id, "207 CC");
    const b = await typed(lea.id, "207 CC");
    const c = await typed(theo.id, "207cc", 2007);
    await typed(lea.id, "308 GTi");
    // « Autre » sans nom tapé : reste dans la file « Autre ».
    await createVehicle(fan.id, peugeot, { generationId: null });

    const list = await req(admin, "GET", "/admin/vehicle-reference/proposals");
    expect(list.status).toBe(200);
    expect(list.json).toHaveLength(2);
    const [big, small] = list.json;
    expect(big).toMatchObject({ level: "model", make: { name: "Peugeot" }, modelName: "207 CC" });
    expect(big.vehicles).toHaveLength(3);
    expect(big.variants).toEqual(
      expect.arrayContaining([
        { text: "207 CC", count: 2 },
        { text: "207cc", count: 1 },
      ]),
    );
    expect(small.modelName).toBe("308 GTi");
    // Liste blanche : ni plaque ni identifiant de compte dans la file.
    expect(Object.keys(big).sort()).toEqual(
      ["key", "level", "make", "makeName", "modelName", "variants", "vehicleType", "vehicles"].sort(),
    );
    expect(Object.keys(big.vehicles[0]).sort()).toEqual(
      [
        "createdAt",
        "department",
        "id",
        "ownerPseudo",
        "photoUrl",
        "typedMake",
        "typedModel",
        "vehicleType",
        "year",
      ].sort(),
    );
    expect(JSON.stringify(list.json)).not.toMatch(/AA-\d{3}-ZZ|AA\d{3}ZZ/);
    expect(JSON.stringify(list.json)).not.toContain(fan.id);
    const others = await req(admin, "GET", "/admin/vehicle-reference/others");
    expect(others.json.flatMap((g: { vehicles: unknown[] }) => g.vehicles)).toHaveLength(1);

    // « Ajouter à la liste et rattacher les 3 fiches » : le modèle est créé, toutes les fiches rattachées.
    const done = await req(admin, "POST", `/admin/vehicle-reference/proposals/${big.key}/accept`, {
      makeId: peugeot.makeId,
      modelName: "207",
    });
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ label: "Peugeot 207", count: 3 });
    for (const v of [a, b, c]) {
      const row = await db.query.vehicles.findFirst({ where: eq(vehicles.id, v.id) });
      expect(row).toMatchObject({ modelId: done.json.modelId, proposedModel: null, proposedMake: null });
    }
    const notes = await db.select().from(notifications).where(eq(notifications.type, "vehicle_reassigned"));
    expect(notes).toHaveLength(3);
    expect(notes.find((n) => n.userId === fan.id)?.body).toContain("ta Peugeot 207 CC");
    const traces = await db.select({ action: adminAuditLog.action }).from(adminAuditLog);
    expect(traces.map((t) => t.action)).toEqual(
      expect.arrayContaining(["reference.model_create", "vehicle.proposal_accept"]),
    );
    // Le groupe n'existe plus ; « Rattacher à un modèle existant » pour l'autre (faute de frappe).
    expect(
      (
        await req(admin, "POST", `/admin/vehicle-reference/proposals/${big.key}/accept`, {
          makeId: peugeot.makeId,
          modelName: "207",
        })
      ).status,
    ).toBe(404);
    const again = await req(admin, "POST", `/admin/vehicle-reference/proposals/${small.key}/accept`, {
      makeId: peugeot.makeId,
      modelId: done.json.modelId,
    });
    expect(again.json.count).toBe(1);
    expect((await req(admin, "GET", "/admin/vehicle-reference/proposals")).json).toHaveLength(0);
  });

  it("marque tapée : la marque et le modèle sont créés ; un groupe inconnu est refusé", async () => {
    const [other] = await db.insert(vehicleMakes).values({ name: "Autre", slug: "autre", isOther: true }).returning();
    const [otherModel] = await db
      .insert(vehicleModels)
      .values({ makeId: other!.id, name: "Autre", slug: "autre", vehicleType: "car", isOther: true })
      .returning();
    const v = await createVehicle(
      fan.id,
      { makeId: other!.id, modelId: otherModel!.id, generationId: "" },
      { generationId: null, proposedMake: "Lotus", proposedModel: "Exige" },
    );
    const [group] = (await req(admin, "GET", "/admin/vehicle-reference/proposals")).json;
    expect(group).toMatchObject({ level: "make", makeName: "Lotus", modelName: "Exige", key: "make.lotus.exige" });
    expect(
      (await req(admin, "POST", "/admin/vehicle-reference/proposals/xx/accept", { makeName: "L", modelName: "E" }))
        .status,
    ).toBe(400);
    const done = await req(admin, "POST", `/admin/vehicle-reference/proposals/${group.key}/accept`, {
      makeName: "Lotus",
      country: "GB",
      modelName: "Exige",
    });
    expect(done.status).toBe(200);
    const row = await db.query.vehicles.findFirst({ where: eq(vehicles.id, v.id) });
    expect(row).toMatchObject({ makeId: done.json.makeId, proposedMake: null, proposedModel: null });
    const models = await req(admin, "GET", `/admin/vehicle-reference/makes/${done.json.makeId}/models`);
    expect(models.json.map((m: { name: string }) => m.name).sort()).toEqual(["Autre", "Exige"]);
  });
});

describe("journal des accès", () => {
  it("filtré par action et par acteur, paginé", async () => {
    for (let i = 0; i < 3; i++) await req(admin, "GET", `/admin/users/${fan.id}`);
    const all = await req(admin, "GET", "/admin/audit?action=user.view&limit=2");
    expect(all.json.items).toHaveLength(2);
    expect(all.json.items[0]).toMatchObject({ action: "user.view", actorPseudo: admin.pseudo });
    const next = await req(admin, "GET", `/admin/audit?action=user.view&limit=2&cursor=${all.json.nextCursor}`);
    expect(next.json.items).toHaveLength(1);
    expect((await req(admin, "GET", "/admin/audit?action=user.")).json.items).toHaveLength(3);
    expect((await req(admin, "GET", `/admin/audit?actor=${moderator.pseudo}`)).json.items).toHaveLength(0);
    expect((await req(admin, "GET", `/admin/audit?actor=${admin.pseudo}`)).json.items.length).toBeGreaterThanOrEqual(3);
  });
});
