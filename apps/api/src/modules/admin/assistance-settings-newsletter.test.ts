// Administration (lot 33), suite : mode assistance (S41 : survol en lecture seule, écriture sur demande ouverte tracée,
// clôture par la structure, l'équipe ou la tâche à 7 jours), réglages (validation par clé, cache de 60 s invalidé à
// l'écriture, barème appliqué au règlement de J+2, interrupteurs lus par les vrais services), newsletter (destinataires
// consentants et confirmés, lots idempotents, budget, désinscription signée sans session), démarrage en production.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { type Decide, fromWallTime, NEWSLETTER_BATCH_SIZE } from "@orasso/shared";
import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
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
  adminAuditLog,
  assistanceRequests,
  emailOutbox,
  newsletterDeliveries,
  newsletters,
  platformSettings,
  pointEntries,
  profiles,
  user,
} from "../../db/schema";
import * as mailModule from "../../lib/mail";
import { getPointsConfig } from "../../lib/settings";
import { unsubscribeToken } from "../../lib/unsubscribe";
import { applicationsService } from "../applications/service";
import { notificationsService } from "../notifications/service";
import { pointsService } from "../points/service";
import { assistanceService } from "./assistance";
import { newsletterService } from "./newsletter";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const MODES = ["cookie", "bearer"] as const;
type Mode = (typeof MODES)[number];
const DAY = 86_400_000;

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

let clock: ReturnType<typeof useClock>;
let admin: TestUser;
let orga: TestUser;
let fan: TestUser;
let structureId: string;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 10, hour: 12, minute: 0 }));
  admin = await signUp("Damien_Admin", { twoFactor: true, role: "super_admin" });
  orga = await signUp("Orga_66", { twoFactor: true });
  fan = await signUp("Kenji_66");
  structureId = (await createStructure(orga.id)).id;
});

describe("mode assistance", () => {
  for (const mode of MODES) {
    it(`survol en lecture seule, écriture sur demande ouverte, tracée avec la demande, close par la structure (${mode})`, async () => {
      // Survol : lecture permise et tracée.
      const look = await req(admin, "GET", `/structures/${structureId}/assistance`, undefined, mode);
      expect(look.status).toBe(200);
      expect(look.json.mode).toBe("read_only");
      expect((await req(admin, "GET", `/structures/${structureId}`, undefined, mode)).status).toBe(200);
      // Écriture sans demande : refusée.
      const denied = await req(admin, "PATCH", `/structures/${structureId}`, { description: "Par l'équipe" }, mode);
      expect(denied.status).toBe(403);
      expect(denied.json.error.code).toBe("assistance_required");
      // Ni le passionné ni le super admin ne demandent l'aide à la place de la structure.
      expect(
        (
          await req(
            fan,
            "POST",
            `/structures/${structureId}/assistance-requests`,
            { message: "Aidez-moi s'il vous plaît" },
            mode,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await req(
            admin,
            "POST",
            `/structures/${structureId}/assistance-requests`,
            { message: "Je m'ouvre la porte" },
            mode,
          )
        ).status,
      ).toBe(403);
      const ask = await req(
        orga,
        "POST",
        `/structures/${structureId}/assistance-requests`,
        { message: "Je n'arrive pas à corriger la description" },
        mode,
      );
      expect(ask.status).toBe(201);
      expect(
        (
          await req(
            orga,
            "POST",
            `/structures/${structureId}/assistance-requests`,
            { message: "Une deuxième demande" },
            mode,
          )
        ).status,
      ).toBe(409);
      // La structure voit sa demande ; le super admin passe en « intervention ».
      expect((await req(orga, "GET", `/structures/${structureId}/assistance`, undefined, mode)).json.current.id).toBe(
        ask.json.id,
      );
      expect((await req(admin, "GET", `/structures/${structureId}/assistance`, undefined, mode)).json.mode).toBe(
        "intervention",
      );
      const write = await req(
        admin,
        "PATCH",
        `/structures/${structureId}`,
        { description: "Corrigée par l'équipe" },
        mode,
      );
      expect(write.status).toBe(200);
      const [trace] = await db
        .select()
        .from(adminAuditLog)
        .where(and(eq(adminAuditLog.action, "structure.assist"), eq(adminAuditLog.structureId, structureId)));
      expect(trace).toMatchObject({ actorUserId: admin.id, assistanceRequestId: ask.json.id });
      expect(trace?.reason).toContain(`PATCH /api/structures/${structureId}`);
      // La structure ferme : l'écriture est de nouveau refusée.
      expect((await req(fan, "POST", `/assistance-requests/${ask.json.id}/close`, undefined, mode)).status).toBe(403);
      const closed = await req(orga, "POST", `/assistance-requests/${ask.json.id}/close`, undefined, mode);
      expect(closed.json).toMatchObject({ status: "closed", closeReason: "organizer", interventions: 1 });
      expect((await req(admin, "PATCH", `/structures/${structureId}`, { description: "Encore" }, mode)).status).toBe(
        403,
      );
      const listed = await req(admin, "GET", "/admin/assistance-requests?status=closed", undefined, mode);
      expect(listed.json[0]).toMatchObject({ id: ask.json.id, closeReason: "organizer" });
    });
  }

  it("clôture automatique à 7 jours, tâche idempotente ; échue = plus d'écriture avant même la tâche", async () => {
    const ask = await req(orga, "POST", `/structures/${structureId}/assistance-requests`, {
      message: "Besoin d'aide sur le tri",
    });
    clock.advance(7 * DAY + 60_000);
    expect((await req(admin, "PATCH", `/structures/${structureId}`, { description: "Trop tard" })).status).toBe(403);
    expect(await assistanceService.autoClose()).toBe(1);
    expect(await assistanceService.autoClose()).toBe(0);
    const row = await db.query.assistanceRequests.findFirst({ where: eq(assistanceRequests.id, ask.json.id) });
    expect(row).toMatchObject({ status: "closed", closeReason: "expired" });
    // Une nouvelle demande peut être ouverte.
    expect(
      (
        await req(orga, "POST", `/structures/${structureId}/assistance-requests`, {
          message: "Nouvelle demande d'aide",
        })
      ).status,
    ).toBe(201);
  });

  it("IDOR : l'équipe organisatrice d'une autre structure ne voit, ne demande ni ne ferme rien", async () => {
    const other = await signUp("Autre_Orga", { twoFactor: true });
    await createStructure(other.id);
    const ask = await req(orga, "POST", `/structures/${structureId}/assistance-requests`, {
      message: "Aide pour le tri svp",
    });
    for (const mode of MODES) {
      expect((await req(other, "GET", `/structures/${structureId}/assistance`, undefined, mode)).status).toBe(403);
      expect(
        (
          await req(
            other,
            "POST",
            `/structures/${structureId}/assistance-requests`,
            { message: "Je me fais passer" },
            mode,
          )
        ).status,
      ).toBe(403);
      expect((await req(other, "POST", `/assistance-requests/${ask.json.id}/close`, undefined, mode)).status).toBe(403);
      expect(
        (await req(other, "POST", `/admin/assistance-requests/${ask.json.id}/close`, undefined, mode)).status,
      ).toBe(403);
    }
    expect(
      (await db.query.assistanceRequests.findFirst({ where: eq(assistanceRequests.id, ask.json.id) }))?.status,
    ).toBe("open");
  });

  it("l'équipe peut clore ; la structure est prévenue", async () => {
    const ask = await req(orga, "POST", `/structures/${structureId}/assistance-requests`, {
      message: "Besoin d'aide sur le staff",
    });
    const res = await req(admin, "POST", `/admin/assistance-requests/${ask.json.id}/close`);
    expect(res.json).toMatchObject({ status: "closed", closeReason: "admin" });
    const notes = await db.execute(sql`select type from notifications where user_id = ${orga.id}`);
    expect(notes.rows.map((r) => r.type)).toContain("assistance_closed");
  });
});

describe("réglages", () => {
  it("valeur invalide refusée par clé ; écriture tracée ; cache invalidé à l'écriture", async () => {
    for (const [key, value] of [
      ["points.malus", 5],
      ["points.participation", "vingt"],
      ["grades.thresholds", { rodage: 0, route: 100, sport: 50, circuit: 400, legende: 800 }],
      ["lists.refusal_reasons", ["full"]],
      ["signup.enabled", "non"],
    ] as const) {
      const res = await req(admin, "PUT", `/admin/settings/${key}`, { value });
      expect(res.status, key).toBe(400);
    }
    expect((await req(admin, "PUT", "/admin/settings/inconnu.cle", { value: 1 })).status).toBe(400);
    const ok = await req(admin, "PUT", "/admin/settings/points.malus", { value: -15 });
    expect(ok.status).toBe(200);
    expect(ok.json.entries.find((e: { key: string }) => e.key === "points.malus").value).toBe(-15);
    expect((await getPointsConfig()).malus).toBe(-15);
    const [trace] = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "settings.update"));
    expect(trace).toMatchObject({ targetId: "points.malus", reason: "-15", actorUserId: admin.id });
    // Écriture directe en base (hors administration) : vue seulement après 60 s.
    await db.update(platformSettings).set({ value: -20 }).where(eq(platformSettings.key, "points.malus"));
    expect((await getPointsConfig()).malus).toBe(-15);
    clock.advance(61_000);
    expect((await getPointsConfig()).malus).toBe(-20);
  });

  it("le règlement de J+2 applique le barème en vigueur (malus −15, participation 25)", async () => {
    const ref = await seedReference();
    const STARTS = fromWallTime({ year: 2026, month: 10, day: 17, hour: 10, minute: 0 });
    const eventId = (
      await createEvent(structureId, {
        startsAt: STARTS,
        endsAt: new Date(STARTS.getTime() + 8 * 3_600_000),
        capacity: 10,
      })
    ).id;
    const absent = await signUp("Absent_66");
    const v = await viewerOf(absent);
    const vehicle = await createVehicle(absent.id, ref);
    const [application] = await applicationsService.apply(v, eventId, {
      vehicleIds: [vehicle.id],
      rulesAccepted: true,
      followStructure: false,
      newsletterOptIn: false,
      companions: 0,
      message: null,
    });
    const accept: Decide = { decision: "accept", sendReasons: true, note: null };
    await applicationsService.decide(await viewerOf(orga), eventId, application!.id, accept);
    await req(admin, "PUT", "/admin/settings/points.malus", { value: -15 });
    clock.set(new Date(STARTS.getTime() + 8 * 3_600_000 + 2 * DAY + 60_000));
    expect(await pointsService.settleEvent(eventId)).toBe(true);
    const [entry] = await db.select().from(pointEntries).where(eq(pointEntries.userId, absent.id));
    expect(entry).toMatchObject({ kind: "malus", points: -15 });
    // Les seuils de grades administrables servent au calcul du grade.
    await req(admin, "PUT", "/admin/settings/grades.thresholds", {
      value: { rodage: 0, route: 5, sport: 300, circuit: 400, legende: 800 },
    });
    await req(admin, "POST", `/admin/users/${fan.id}/points-adjust`, { points: 10, note: "Bénévolat au salon" });
    expect((await db.query.profiles.findFirst({ where: eq(profiles.userId, fan.id) }))?.grade).toBe("route");
  });

  it("interrupteurs lus par les vrais services : inscriptions, prestataires ; listes publiques", async () => {
    const pub = await req(null, "GET", "/settings/public");
    expect(pub.status).toBe(200);
    expect(pub.json.refusalReasons).toContain("other");
    await req(admin, "PUT", "/admin/settings/lists.refusal_reasons", { value: ["full", "off_theme", "other"] });
    expect((await req(null, "GET", "/settings/public")).json.refusalReasons).toEqual(["full", "off_theme", "other"]);

    await req(admin, "PUT", "/admin/settings/signup.enabled", { value: false });
    const closed = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({
        email: "nouveau@orasso.test",
        password: "motdepasse-test-123",
        name: "Nouveau_1",
        termsAccepted: true,
      }),
    });
    expect(closed.status).toBe(403);
    expect(((await closed.json()) as { error: { code: string } }).error.code).toBe("signup_closed");
    await req(admin, "PUT", "/admin/settings/signup.enabled", { value: true });
    expect((await signUp("Nouveau_2")).id).toBeTruthy();

    await req(admin, "PUT", "/admin/settings/providers.enabled", { value: false });
    const provider = await req(fan, "PUT", "/me/provider-profile", {});
    expect(provider.status).toBe(403);
    expect(provider.json.error.code).toBe("providers_disabled");
  });
});

describe("newsletter", () => {
  async function optIn(u: TestUser, verified = true) {
    await db.update(profiles).set({ newsletterOptIn: true }).where(eq(profiles.userId, u.id));
    await db.update(user).set({ emailVerified: verified }).where(eq(user.id, u.id));
  }

  it("test à soi, destinataires consentants et confirmés seulement, second déclenchement sans renvoi", async () => {
    await optIn(fan);
    const unverified = await signUp("Pas_Confirme");
    await optIn(unverified, false);
    const refused = await signUp("Sans_Newsletter");
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, refused.id));

    const draft = await req(admin, "POST", "/admin/newsletters", {
      subject: "Saison 2027",
      bodyMd: "# Bonjour\n\n**Nouveautés** à venir.",
    });
    expect(draft.status).toBe(201);
    expect((await req(admin, "GET", "/admin/newsletters/audience")).json.recipients).toBe(1);
    const test = await req(admin, "POST", `/admin/newsletters/${draft.json.id}/test`);
    expect(test.json.outcome).toBe("sent");
    const [mine] = await db.select().from(emailOutbox).where(eq(emailOutbox.template, "newsletter_test"));
    expect(mine?.to).toBe(admin.email);
    expect(mine?.subject).toBe("[Test] Saison 2027");

    await req(admin, "POST", `/admin/newsletters/${draft.json.id}/schedule`, {
      at: new Date(clock.now.getTime() + 3_600_000).toISOString(),
    });
    expect(await newsletterService.runDue()).toBe(0); // pas encore l'heure
    clock.advance(3_600_000);
    expect(await newsletterService.runDue()).toBe(1);
    expect(await newsletterService.runDue()).toBe(0); // fin : statut « envoyée »
    expect(await newsletterService.runBatch(draft.json.id)).toBe(0); // second déclenchement : rien
    const sentTo = await db
      .select({ to: emailOutbox.to })
      .from(emailOutbox)
      .where(eq(emailOutbox.template, "newsletter"));
    expect(sentTo.map((m) => m.to)).toEqual([fan.email]);
    const row = await db.query.newsletters.findFirst({ where: eq(newsletters.id, draft.json.id) });
    expect(row).toMatchObject({ status: "sent", recipientsCount: 1 });
    expect(
      (await req(admin, "PUT", `/admin/newsletters/${draft.json.id}`, { subject: "Changée", bodyMd: "x" })).status,
    ).toBe(409);
    const traces = await db.select({ action: adminAuditLog.action }).from(adminAuditLog);
    expect(traces.map((t) => t.action)).toEqual(
      expect.arrayContaining(["newsletter.create", "newsletter.test", "newsletter.schedule"]),
    );
  });

  it("par lots de 200, budget atteint = arrêt puis reprise sans doublon", async () => {
    // 205 comptes consentants insérés directement (inscription trop lente pour ce volume).
    await db.execute(sql`
      with u as (
        insert into "user" (id, name, email, email_verified, created_at, updated_at)
        select 'nl' || g, 'nl' || g, 'nl' || g || '@orasso.test', true, now(), now() from generate_series(1, 205) g
        returning id
      )
      insert into profiles (user_id, pseudo, newsletter_opt_in, account_qr_secret, account_qr_short_id, invite_token)
      select id, id, true, decode(md5(id), 'hex'), decode(substr(md5('s' || id), 1, 16), 'hex'), md5('i' || id) from u`);
    const draft = await req(admin, "POST", "/admin/newsletters", { subject: "Grand envoi", bodyMd: "Texte" });
    const aud = await req(admin, "GET", "/admin/newsletters/audience");
    // Envoi immédiat confirmé avec le nombre de destinataires ; un nombre périmé est refusé.
    expect(
      (await req(admin, "POST", `/admin/newsletters/${draft.json.id}/send-now`, { confirmRecipients: 3 })).status,
    ).toBe(409);
    expect(
      (
        await req(admin, "POST", `/admin/newsletters/${draft.json.id}/send-now`, {
          confirmRecipients: aud.json.recipients,
        })
      ).status,
    ).toBe(200);
    expect(await newsletterService.runBatch(draft.json.id)).toBe(NEWSLETTER_BATCH_SIZE);
    // Budget du jour atteint au 3e e-mail du lot suivant : arrêt, réservations rendues.
    const real = mailModule.mail.send.bind(mailModule.mail);
    let calls = 0;
    const spy = vi.spyOn(mailModule.mail, "send").mockImplementation(async (...args) => {
      calls++;
      return calls >= 3 ? "skipped_quota" : real(...args);
    });
    expect(await newsletterService.runBatch(draft.json.id)).toBe(2);
    spy.mockRestore();
    const [pendingRows] = await db
      .select({ n: count() })
      .from(newsletterDeliveries)
      .where(and(eq(newsletterDeliveries.newsletterId, draft.json.id), sql`sent_at is null`));
    expect(pendingRows?.n).toBe(0);
    // Budget pris par d'autres e-mails : reprise après minuit, aucun passage à vide d'ici là.
    expect(
      (await db.query.newsletters.findFirst({ where: eq(newsletters.id, draft.json.id) }))?.resumeAfter,
    ).not.toBeNull();
    expect(await newsletterService.runDue()).toBe(0);
    clock.advance(DAY);
    expect(await newsletterService.runBatch(draft.json.id)).toBe(3);
    expect(await newsletterService.runBatch(draft.json.id)).toBe(0);
    const [sent] = await db
      .select({ n: count() })
      .from(newsletterDeliveries)
      .where(and(eq(newsletterDeliveries.newsletterId, draft.json.id), isNotNull(newsletterDeliveries.sentAt)));
    expect(sent?.n).toBe(205);
    const [mails] = await db.select({ n: count() }).from(emailOutbox).where(eq(emailOutbox.template, "newsletter"));
    expect(mails?.n).toBe(205);
    expect((await db.query.newsletters.findFirst({ where: eq(newsletters.id, draft.json.id) }))?.status).toBe("sent");
  });

  it("désinscription signée, sans session, idempotente ; lien falsifié refusé", async () => {
    await optIn(fan);
    const token = unsubscribeToken(fan.id);
    const check = await req(null, "GET", `/desinscription/${token}`);
    expect(check.json).toEqual({ valid: true, subscribed: true });
    // Un GET ne désinscrit pas (aperçus de liens des messageries).
    expect((await db.query.profiles.findFirst({ where: eq(profiles.userId, fan.id) }))?.newsletterOptIn).toBe(true);
    expect((await req(null, "POST", `/desinscription/${token}`)).status).toBe(200);
    expect((await req(null, "POST", `/desinscription/${token}`)).status).toBe(200);
    expect((await db.query.profiles.findFirst({ where: eq(profiles.userId, fan.id) }))?.newsletterOptIn).toBe(false);
    const forged = `${token.split(".")[0]}.${"A".repeat(32)}`;
    expect((await req(null, "POST", `/desinscription/${forged}`)).status).toBe(404);
    // Dernier caractère de la signature changé (toujours différent de l'original).
    const real = unsubscribeToken(orga.id);
    const altered = `${real.slice(0, -1)}${real.endsWith("x") ? "y" : "x"}`;
    expect((await req(null, "GET", `/desinscription/${altered}`)).json.valid).toBe(false);
    // L'e-mail porte le lien et l'en-tête de désinscription.
    const { newsletterMail } = await import("./newsletter");
    const content = newsletterMail("Objet", "Texte", {
      page: "https://orasso.fr/desinscription/abc",
      oneClick: "https://orasso.fr/api/desinscription/abc",
    });
    expect(content.html).toContain("https://orasso.fr/desinscription/abc");
    expect(content.headers?.["List-Unsubscribe"]).toBe("<https://orasso.fr/api/desinscription/abc>");
  });

  it("budget : le gabarit de la newsletter n'entame jamais la réserve de sécurité", () => {
    expect(mailModule.isProtectedTemplate("newsletter")).toBe(false);
    expect(mailModule.withinMailBudget("newsletter", 249, 300)).toBe(true);
    expect(mailModule.withinMailBudget("newsletter", 250, 300)).toBe(false);
  });
});

describe("démarrage en production", () => {
  it("refusé sans UNSUBSCRIBE_SECRET", () => {
    const boot = (extra: Record<string, string>) =>
      spawnSync(process.execPath, ["--import", "tsx", "-e", "await import('./src/env.ts')"], {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        env: {
          ...process.env,
          NODE_ENV: "production",
          QR_SIGNING_KEYS: '[{"kid":1,"privateKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}]',
          QR_SIGNING_ACTIVE_KID: "1",
          DEV_SKIP_2FA: "",
          STRIPE_SECRET_KEY: "",
          UNSUBSCRIBE_SECRET: "",
          ...extra,
        },
        encoding: "utf8",
        timeout: 60_000,
      });
    const missing = boot({});
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("UNSUBSCRIBE_SECRET");
    expect(boot({ UNSUBSCRIBE_SECRET: "change-me-secret-de-desinscription-32-caracteres" }).status).toBe(1);
    expect(boot({ UNSUBSCRIBE_SECRET: "un-secret-de-test-assez-long-0123456789" }).status).toBe(0);
  });
});
