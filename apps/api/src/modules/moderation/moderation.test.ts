// Modération (lot 32) : signalements (unicité, limite, visibilité, capture privée), suspension automatique et protections
// contre les meutes (S39, S40), droits du modérateur et du super administrateur, bannissement, compte suspendu en lecture
// seule, contestation unique, levée, retrait de contenu, copie d'une conversation signalée, conservation d'un an.
// Routes sensibles jouées en cookie (site) ET en jeton porteur (appli).
import { randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createEvent,
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
  messages,
  notifications,
  profiles,
  reports,
  reviews,
  sanctions,
  session,
  user,
  vehiclePhotos,
} from "../../db/schema";
import { storage } from "../../lib/storage";
import { accountService } from "../account/service";
import { moderationService } from "./service";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const MODES = ["cookie", "bearer"] as const;
type Mode = (typeof MODES)[number];
const DAY = 86_400_000;
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
});

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
  return { status: res.status, json, headers: res.headers };
}

async function uploadCapture(u: TestUser, mode: Mode = "cookie") {
  const data = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 90, g: 90, b: 90 } } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("purpose", "report");
  form.append("file", new File([new Uint8Array(data)], "capture.jpg", { type: "image/jpeg" }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: {
      origin: ORIGIN,
      ...(mode === "cookie" ? { cookie: u.cookie } : { authorization: `Bearer ${bearerOf(u.cookie)}` }),
    },
    body: form,
  });
  return { status: res.status, json: (await res.json()) as { key: string } };
}

/** Compte créé il y a `days` jours (S39 : moins de 7 jours ne compte pas). */
async function age(u: TestUser, days: number) {
  await db
    .update(user)
    .set({ createdAt: new Date(clock.now.getTime() - days * DAY) })
    .where(eq(user.id, u.id));
}

async function oldUsers<const N extends readonly string[]>(...names: N): Promise<{ [K in keyof N]: TestUser }> {
  const out: TestUser[] = [];
  for (const n of names) {
    const u = await signUp(n);
    await age(u, 30);
    out.push(u);
  }
  return out as { [K in keyof N]: TestUser };
}

const reportProfile = (by: TestUser, target: TestUser, mode: Mode = "cookie", reason = "harassment") =>
  req(by, "POST", "/reports", { targetType: "profile", targetId: target.id, reason }, mode);

async function team() {
  const damien = await signUp("Damien", { twoFactor: true, role: "super_admin" });
  const moderatrice = await signUp("Moderatrice_66", { twoFactor: true, role: "moderator" });
  return { damien, moderatrice };
}

const profileOf = async (u: TestUser) => (await db.select().from(profiles).where(eq(profiles.userId, u.id)))[0]!;
const sanctionsOf = (u: TestUser) => db.select().from(sanctions).where(eq(sanctions.userId, u.id));
const notesOf = (u: TestUser, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, u.id), eq(notifications.type, type)));

describe("signaler", () => {
  it.each(MODES)(
    "unicité par signaleur, pas soi-même, contenu invisible introuvable, motif « Autre » précisé (%s)",
    async (mode) => {
      const [a, x] = await oldUsers("Alice", "Xavier");
      expect((await reportProfile(a, x, mode)).status).toBe(201);
      const again = await reportProfile(a, x, mode);
      expect(again.status).toBe(409);
      expect(again.json.error.code).toBe("already_reported");
      expect((await reportProfile(a, a, mode)).status).toBe(400);
      const other = await req(a, "POST", "/reports", { targetType: "profile", targetId: x.id, reason: "other" }, mode);
      expect(other.status).toBe(400); // « Autre » sans détails : refusé avant tout
      const ghost = await req(
        a,
        "POST",
        "/reports",
        { targetType: "vehicle", targetId: randomUUID(), reason: "spam" },
        mode,
      );
      expect(ghost.status).toBe(404);
      const y = await signUp("Yvette");
      const noDetails = await req(
        a,
        "POST",
        "/reports",
        { targetType: "profile", targetId: y.id, reason: "other" },
        mode,
      );
      expect(noDetails.status).toBe(400);
      expect(
        (await req(null, "POST", "/reports", { targetType: "profile", targetId: y.id, reason: "spam" })).status,
      ).toBe(401);
    },
  );

  it("10 signalements par 24 heures, comptés en base", async () => {
    const [a] = await oldUsers("Alice");
    const targets: TestUser[] = [];
    for (let i = 0; i < 11; i += 1) targets.push(await signUp(`Cible${i}`));
    for (let i = 0; i < 10; i += 1) expect((await reportProfile(a, targets[i]!)).status).toBe(201);
    const over = await reportProfile(a, targets[10]!);
    expect(over.status).toBe(429);
    clock.advance(DAY + 1000);
    expect((await reportProfile(a, targets[10]!)).status).toBe(201);
  });

  it.each(MODES)(
    "capture privée : rattachée une fois par son auteur, jamais servie publiquement (%s)",
    async (mode) => {
      const { moderatrice } = await team();
      const [a, b, x] = await oldUsers("Alice", "Bruno", "Xavier");
      const up = await uploadCapture(a, mode);
      expect(up.status).toBe(201);
      expect(up.json.key).toMatch(/^private\/reports\//);
      expect((await app.request(`/api/files/${up.json.key}`)).status).toBe(404);
      // La capture d'un autre ne se rattache pas.
      const stolen = await req(
        b,
        "POST",
        "/reports",
        { targetType: "profile", targetId: x.id, reason: "insult", screenshotKey: up.json.key },
        mode,
      );
      expect(stolen.status).toBe(400);
      const r = await req(
        a,
        "POST",
        "/reports",
        { targetType: "profile", targetId: x.id, reason: "insult", screenshotKey: up.json.key },
        mode,
      );
      expect(r.status).toBe(201);
      const detail = await req(moderatrice, "GET", `/admin/reports/${r.json.id}`, undefined, mode);
      expect(detail.json.screenshotUrl).toBe(`/api/admin/reports/${r.json.id}/screenshot`);
      expect((await req(moderatrice, "GET", `/admin/reports/${r.json.id}/screenshot`, undefined, mode)).status).toBe(
        200,
      );
      expect((await req(b, "GET", `/admin/reports/${r.json.id}/screenshot`, undefined, mode)).status).toBe(403);
    },
  );
});

describe("suspension automatique (S39, S40)", () => {
  it.each(MODES)(
    "3 comptes anciens en 2 heures → 7 jours, alerte immédiate même la nuit, motif visible, lecture seule, contestation (%s)",
    async (mode) => {
      clock.set(fromWallTime({ year: 2026, month: 10, day: 17, hour: 23, minute: 10 }));
      const { damien, moderatrice } = await team();
      const [a, b, c, x] = await oldUsers("Alice", "Bruno", "Carla", "Xavier");
      await reportProfile(a, x, mode, "harassment");
      clock.advance(3_600_000);
      await reportProfile(b, x, mode, "harassment");
      clock.advance(3_600_000);
      const third = await reportProfile(c, x, mode, "insult");
      expect(third.json.autoSuspended).toBe(true);

      const [s] = await sanctionsOf(x);
      expect(s).toMatchObject({ kind: "suspension_7d", auto: true, reason: "harassment", issuedBy: null });
      expect((await profileOf(x)).suspendedUntil?.getTime()).toBe(clock.now.getTime() + 7 * DAY);
      for (const u of [damien, moderatrice]) {
        const [alert] = await notesOf(u, "moderation_priority_alert");
        expect(alert?.deliverAfter.getTime()).toBe(clock.now.getTime()); // heures calmes ignorées
      }
      expect(await notesOf(x, "sanction_received")).toHaveLength(1);

      const me = await req(x, "GET", "/me", undefined, mode);
      expect(me.json.suspension).toMatchObject({ kind: "suspension_7d", reason: "harassment", canContest: true });
      const write = await req(x, "PATCH", "/me/profile", { bio: "Je suis suspendu" }, mode);
      expect(write.status).toBe(403);
      expect(write.json.error.code).toBe("suspended");
      expect(
        (await req(x, "POST", "/reports", { targetType: "profile", targetId: a.id, reason: "spam" }, mode)).status,
      ).toBe(403);
      expect((await req(x, "GET", "/me/sanctions", undefined, mode)).status).toBe(200);
      expect((await req(x, "POST", "/me/notifications/read", { all: true }, mode)).status).toBe(204);
      const contest = await req(x, "POST", `/sanctions/${s!.id}/contest`, { message: "C'est une erreur" }, mode);
      expect(contest.status).toBe(200);
      expect(contest.json.contestStatus).toBe("pending");
      expect((await req(x, "POST", `/sanctions/${s!.id}/contest`, { message: "Encore" }, mode)).status).toBe(409);
      // Le signalé ne voit jamais qui l'a signalé.
      const mine = JSON.stringify((await req(x, "GET", "/me/sanctions", undefined, mode)).json);
      for (const r of [a, b, c]) {
        expect(mine).not.toContain(r.pseudo);
        expect(mine).not.toContain(r.id);
      }
      expect(mine).not.toContain("reportIds");

      // Le super administrateur lève la sanction : X écrit à nouveau.
      expect(
        (await req(damien, "POST", `/admin/sanctions/${s!.id}/decide`, { decision: "lift", note: "Meute" }, mode))
          .status,
      ).toBe(204);
      expect((await profileOf(x)).suspendedUntil).toBeNull();
      expect((await req(x, "PATCH", "/me/profile", { bio: "Libre" }, mode)).status).toBe(200);
      expect(await notesOf(x, "sanction_contest_decided")).toHaveLength(1);
      expect((await req(damien, "POST", `/admin/sanctions/${s!.id}/decide`, { decision: "uphold" }, mode)).status).toBe(
        409,
      );
    },
  );

  it("2 anciens + 1 récent → pas de suspension ; un signaleur abusif (2 rejets) ne compte pas", async () => {
    const [a, b, x, y] = await oldUsers("Alice", "Bruno", "Xavier", "Yann");
    const recent = await signUp("Nouveau");
    await age(recent, 3);
    await reportProfile(a, x);
    await reportProfile(b, x);
    expect((await reportProfile(recent, x)).json.autoSuspended).toBe(false);
    expect(await sanctionsOf(x)).toHaveLength(0);

    const [abusive] = await oldUsers("Abusif");
    for (let i = 0; i < 2; i += 1) {
      const t = await signUp(`Victime${i}`);
      await reportProfile(abusive!, t);
    }
    await db.update(reports).set({ status: "dismissed_abusive" }).where(eq(reports.reporterId, abusive!.id));
    await reportProfile(a, y);
    await reportProfile(b, y);
    expect((await reportProfile(abusive!, y)).json.autoSuspended).toBe(false);
  });

  it("déjà suspendu : pas de seconde sanction automatique ; signalements de plus de 24 heures ignorés", async () => {
    const [a, b, c, d, x, z] = await oldUsers("Alice", "Bruno", "Carla", "Dora", "Xavier", "Zoe");
    for (const u of [a, b, c]) await reportProfile(u!, x!);
    expect((await reportProfile(d!, x!)).json.autoSuspended).toBe(false);
    expect(await sanctionsOf(x!)).toHaveLength(1);

    await reportProfile(a!, z!);
    await reportProfile(b!, z!);
    clock.advance(DAY + 1000);
    expect((await reportProfile(c!, z!)).json.autoSuspended).toBe(false);
  });

  it("un compte de l'équipe n'est jamais suspendu automatiquement (alerte seulement)", async () => {
    const { damien, moderatrice } = await team();
    const [a, b, c] = await oldUsers("Alice", "Bruno", "Carla");
    for (const u of [a, b, c]) await reportProfile(u!, moderatrice);
    expect(await sanctionsOf(moderatrice)).toHaveLength(0);
    expect(await notesOf(damien, "moderation_priority_alert")).toHaveLength(1);
  });
});

describe("file du modérateur et décisions", () => {
  it.each(MODES)("accès : équipe seulement, double authentification de session exigée (%s)", async (mode) => {
    const [a, x] = await oldUsers("Alice", "Xavier");
    const r = await reportProfile(a, x, mode);
    const lambda = await signUp("Lambda");
    expect((await req(lambda, "GET", "/admin/reports", undefined, mode)).status).toBe(403);
    expect((await req(lambda, "GET", `/admin/reports/${r.json.id}`, undefined, mode)).status).toBe(403);
    expect(
      (await req(x, "POST", `/admin/reports/${r.json.id}/status`, { status: "resolved_no_action" }, mode)).status,
    ).toBe(403);
    const noTotp = await signUp("ModoSansCode", { role: "moderator" });
    const refused = await req(noTotp, "GET", "/admin/reports", undefined, mode);
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("two_factor_required");
    const { moderatrice } = await team();
    const list = await req(moderatrice, "GET", "/admin/reports?status=pending", undefined, mode);
    expect(list.status).toBe(200);
    expect(list.json.items).toHaveLength(1);
    expect((await req(moderatrice, "GET", "/admin/sanctions", undefined, mode)).status).toBe(403);
  });

  it.each(MODES)(
    "modérateur : 7 jours autorisé, 30 jours, bannissement et retrait refusés ; le super admin décide ensuite (%s)",
    async (mode) => {
      const { damien, moderatrice } = await team();
      const [a, x] = await oldUsers("Alice", "Xavier");
      const r = await reportProfile(a, x, mode);
      const id = r.json.id;
      for (const kind of ["suspension_30d", "ban", "warning"]) {
        expect((await req(moderatrice, "POST", `/admin/reports/${id}/sanction`, { kind }, mode)).status).toBe(403);
      }
      expect(
        (await req(moderatrice, "POST", `/admin/reports/${id}/status`, { status: "dismissed_abusive" }, mode)).status,
      ).toBe(403);
      const seven = await req(
        moderatrice,
        "POST",
        `/admin/reports/${id}/sanction`,
        { kind: "suspension_7d", note: "Insultes" },
        mode,
      );
      expect(seven.status).toBe(200);
      expect(seven.json.status).toBe("reviewing");
      expect((await profileOf(x)).suspendedUntil?.getTime()).toBe(clock.now.getTime() + 7 * DAY);
      expect(await notesOf(a, "report_handled")).toHaveLength(0);
      // Le super administrateur confirme : le signaleur est prévenu.
      const done = await req(damien, "POST", `/admin/reports/${id}/status`, { status: "resolved_action" }, mode);
      expect(done.status).toBe(200);
      expect(await notesOf(a, "report_handled")).toHaveLength(1);
      expect(
        (await req(damien, "POST", `/admin/reports/${id}/status`, { status: "resolved_no_action" }, mode)).status,
      ).toBe(409);
      const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, x.id));
      expect(audit.map((l) => l.action)).toContain("moderation.sanction");
    },
  );

  it("levée : `suspended_until` recalculé à partir des sanctions restantes ; le modérateur ne lève qu'une suspension automatique", async () => {
    const { damien, moderatrice } = await team();
    const [a, b, c, d, x] = await oldUsers("Alice", "Bruno", "Carla", "Dora", "Xavier");
    for (const u of [a, b, c]) await reportProfile(u!, x!);
    const [auto] = await sanctionsOf(x!);
    const r = await reportProfile(d!, x!);
    expect((await req(damien, "POST", `/admin/reports/${r.json.id}/sanction`, { kind: "suspension_30d" })).status).toBe(
      200,
    );
    expect((await profileOf(x!)).suspendedUntil?.getTime()).toBe(clock.now.getTime() + 30 * DAY);
    const thirty = (await sanctionsOf(x!)).find((s) => s.kind === "suspension_30d")!;
    expect((await req(moderatrice, "POST", `/admin/sanctions/${thirty.id}/lift`, {})).status).toBe(403);
    expect((await req(damien, "POST", `/admin/sanctions/${thirty.id}/lift`, { note: "Erreur" })).status).toBe(204);
    expect((await profileOf(x!)).suspendedUntil?.getTime()).toBe(clock.now.getTime() + 7 * DAY);
    expect((await req(moderatrice, "POST", `/admin/sanctions/${auto!.id}/lift`, {})).status).toBe(204);
    expect((await profileOf(x!)).suspendedUntil).toBeNull();
    expect((await req(moderatrice, "POST", `/admin/sanctions/${auto!.id}/lift`, {})).status).toBe(409);
  });

  it.each(MODES)("bannissement : sessions révoquées, connexion refusée, absent des recherches (%s)", async (mode) => {
    const { damien } = await team();
    const [a, x] = await oldUsers("Alice", "Xbanni");
    const r = await reportProfile(a, x, mode);
    const ban = await req(
      damien,
      "POST",
      `/admin/reports/${r.json.id}/sanction`,
      { kind: "ban", note: "Arnaque" },
      mode,
    );
    expect(ban.status).toBe(200);
    expect((await profileOf(x)).bannedAt).not.toBeNull();
    expect(await db.select().from(session).where(eq(session.userId, x.id))).toHaveLength(0);
    expect((await req(x, "GET", "/me", undefined, mode)).status).toBe(401);
    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email: x.email, password: "motdepasse-test-123" }),
    });
    expect(signIn.status).toBe(403);
    expect(((await signIn.json()) as { code?: string }).code).toBe("BANNED");
    const search = await req(a, "GET", `/users/search?q=${x.pseudo.slice(0, 5)}`, undefined, mode);
    expect(JSON.stringify(search.json)).not.toContain(x.pseudo);
  });

  it("suspendu : supprimer son compte reste possible", async () => {
    const [a, b, c, x] = await oldUsers("Alice", "Bruno", "Carla", "Xavier");
    for (const u of [a, b, c]) await reportProfile(u!, x!);
    const del = await req(x!, "DELETE", "/me", { password: "motdepasse-test-123" });
    expect(del.status).toBe(200);
    expect((await profileOf(x!)).deletedAt).not.toBeNull();
    // Conservation : la sanction reste (docs/01), elle n'est pas effacée par l'anonymisation.
    expect(await sanctionsOf(x!)).toHaveLength(1);
  });

  it("IDOR : contester la sanction d'un autre, lire le signalement d'un autre", async () => {
    const [a, b, c, x, y] = await oldUsers("Alice", "Bruno", "Carla", "Xavier", "Yann");
    for (const u of [a, b, c]) await reportProfile(u!, x!);
    const [s] = await sanctionsOf(x!);
    expect((await req(y!, "POST", `/sanctions/${s!.id}/contest`, { message: "Pas moi" })).status).toBe(404);
    expect((await req(a!, "GET", `/admin/reports/${randomUUID()}`)).status).toBe(403);
  });
});

describe("retrait du contenu", () => {
  it.each(MODES)(
    "message signalé : copie de 11 messages, lue par l'équipe (tracé), message retiré, signaleur prévenu (%s)",
    async (mode) => {
      const { damien, moderatrice } = await team();
      const [a, b] = await oldUsers("Alice", "Bruno");
      const fr = await req(a, "POST", "/friends/requests", { pseudo: b.pseudo }, mode);
      await req(b, "POST", `/friends/requests/${fr.json.id}/accept`, undefined, mode);
      const conv = (await req(a, "POST", "/conversations/direct", { userId: b.id }, mode)).json.id as string;
      const ids: string[] = [];
      for (let i = 0; i < 13; i += 1) {
        clock.advance(60_000);
        const who = i % 2 ? a : b;
        const sent = await req(
          who,
          "POST",
          `/conversations/${conv}/messages`,
          { clientId: randomUUID(), body: `Message ${i}` },
          mode,
        );
        ids.push(sent.json.id);
      }
      const intrus = (await oldUsers("Intrus"))[0]!;
      expect(
        (await req(intrus, "POST", "/reports", { targetType: "message", targetId: ids[6], reason: "insult" }, mode))
          .status,
      ).toBe(404);
      expect(
        (await req(b, "POST", "/reports", { targetType: "message", targetId: ids[6], reason: "insult" }, mode)).status,
      ).toBe(400); // son propre message
      const r = await req(a, "POST", "/reports", { targetType: "message", targetId: ids[6], reason: "insult" }, mode);
      expect(r.status).toBe(201);

      const detail = await req(moderatrice, "GET", `/admin/reports/${r.json.id}`, undefined, mode);
      expect(detail.json.context).toHaveLength(11);
      expect(detail.json.context[5]).toMatchObject({ id: ids[6], body: "Message 6", reported: true, pseudo: b.pseudo });
      expect(detail.json.context[0].body).toBe("Message 1");
      expect(detail.json.can.hideContent).toBe(false); // le modérateur ne retire pas
      const views = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "moderation.report_view"));
      expect(views[0]?.reason).toContain("conversation");

      const hidden = await req(damien, "POST", `/admin/reports/${r.json.id}/sanction`, { hideContent: true }, mode);
      expect(hidden.status).toBe(200);
      expect(hidden.json.status).toBe("resolved_action");
      const [m] = await db.select().from(messages).where(eq(messages.id, ids[6]!));
      expect(m?.moderatedAt).not.toBeNull();
      expect(m?.body).toBeNull();
      const page = await req(a, "GET", `/conversations/${conv}/messages`, undefined, mode);
      const shown = page.json.items.find((x: { id: string }) => x.id === ids[6]);
      expect(shown).toMatchObject({ deleted: true, moderated: true, body: null });
      expect(await notesOf(a, "report_handled")).toHaveLength(1);
    },
  );

  it("avis masqué, photo supprimée", async () => {
    const { damien } = await team();
    const ref = await seedReference();
    const [a, x] = await oldUsers("Alice", "Xavier");
    const s = await createStructure(x!.id);
    const e = await createEvent(s.id, { startsAt: new Date(clock.now.getTime() - 3 * DAY) });
    const author = (await oldUsers("Auteur"))[0]!;
    const [rv] = await db
      .insert(reviews)
      .values({ eventId: e.id, userId: author.id, rating: 1, comment: "Nul et insultant" })
      .returning();
    const rr = await req(a!, "POST", "/reports", { targetType: "review", targetId: rv!.id, reason: "insult" });
    expect(rr.status).toBe(201);
    expect(
      (await req(damien, "POST", `/admin/reports/${rr.json.id}/sanction`, { hideContent: true, kind: "warning" }))
        .status,
    ).toBe(200);
    expect((await db.select().from(reviews).where(eq(reviews.id, rv!.id)))[0]?.hiddenAt).not.toBeNull();
    expect((await sanctionsOf(author))[0]?.kind).toBe("warning");
    expect((await profileOf(author)).suspendedUntil).toBeNull(); // un avertissement ne suspend pas

    const v = await createVehicle(x!.id, ref);
    const [photo] = await db.select().from(vehiclePhotos).where(eq(vehiclePhotos.vehicleId, v.id));
    const pr = await req(a!, "POST", "/reports", { targetType: "photo", targetId: photo!.id, reason: "shocking" });
    expect(pr.status).toBe(201);
    expect((await req(damien, "POST", `/admin/reports/${pr.json.id}/sanction`, { hideContent: true })).status).toBe(
      200,
    );
    expect(await db.select().from(vehiclePhotos).where(eq(vehiclePhotos.id, photo!.id))).toHaveLength(0);
    // Profil : pas de retrait possible (on sanctionne le propriétaire).
    const prof = await reportProfile(a!, x!);
    expect((await req(damien, "POST", `/admin/reports/${prof.json.id}/sanction`, { hideContent: true })).status).toBe(
      400,
    );
  });
});

describe("conservation (moderation.purge)", () => {
  it("un an après la décision : signalement et capture purgés, sauf bannissement ou contestation en cours ; idempotent", async () => {
    const { damien } = await team();
    const [a, b, x, y, z] = await oldUsers("Alice", "Bruno", "Xavier", "Yann", "Zoe");
    const up = await uploadCapture(a!);
    const plain = await req(a!, "POST", "/reports", {
      targetType: "profile",
      targetId: x!.id,
      reason: "spam",
      screenshotKey: up.json.key,
    });
    await req(damien, "POST", `/admin/reports/${plain.json.id}/status`, { status: "resolved_no_action" });
    const banned = await reportProfile(a!, y!);
    await req(damien, "POST", `/admin/reports/${banned.json.id}/sanction`, { kind: "ban" });
    const contested = await reportProfile(b!, z!);
    await req(damien, "POST", `/admin/reports/${contested.json.id}/sanction`, { kind: "suspension_7d" });
    const [zs] = await sanctionsOf(z!);
    await req(z!, "POST", `/sanctions/${zs!.id}/contest`, { message: "Injuste" });
    expect(await storage.get(up.json.key)).not.toBeNull();

    clock.advance(364 * DAY);
    expect((await moderationService.purge()).reports).toBe(0);
    clock.advance(2 * DAY);
    const first = await moderationService.purge();
    expect(first.reports).toBe(1);
    const left = await db.select({ id: reports.id }).from(reports);
    expect(left.map((r) => r.id).sort()).toEqual([banned.json.id, contested.json.id].sort());
    expect(await storage.get(up.json.key)).toBeNull();
    expect(await sanctionsOf(y!)).toHaveLength(1); // bannissement gardé
    expect(await sanctionsOf(z!)).toHaveLength(1); // contestation en cours
    expect(await moderationService.purge()).toEqual({ reports: 0, sanctions: 0 });
    // Contestation décidée : purgée au passage suivant.
    await req(damien, "POST", `/admin/sanctions/${zs!.id}/decide`, { decision: "uphold" });
    clock.advance(10 * DAY); // la sanction de 7 jours est finie depuis plus d'un an
    const second = await moderationService.purge();
    expect(second).toEqual({ reports: 1, sanctions: 1 });
  });

  it("compte supprimé : la contestation en cours est close, rien n'est effacé avant l'échéance", async () => {
    const [a, b, c, x] = await oldUsers("Alice", "Bruno", "Carla", "Xavier");
    for (const u of [a, b, c]) await reportProfile(u!, x!);
    const [s] = await sanctionsOf(x!);
    await req(x!, "POST", `/sanctions/${s!.id}/contest`, { message: "Non" });
    await accountService.anonymize(x!.id, null);
    expect((await sanctionsOf(x!))[0]?.contestStatus).toBe("upheld");
    expect(await db.select().from(reports)).toHaveLength(3);
  });
});
