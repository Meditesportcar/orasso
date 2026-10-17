// Après l'événement et badge de structure (lot 27) : bilan automatique (calculé une fois, rafraîchi à J+8), remerciement
// (une seule fois, lien d'avis propre à chaque présent), export tracé (motif, journal, CSV sûr), consultation des
// coordonnées tracée après J+7, notes internes (privées de la structure), badge (rappels, suspension, levée,
// renouvellement, transfert de propriétaire), droits (2FA de session, super admin exclu, IDOR). Routes sensibles jouées
// en cookie ET en jeton porteur ; heure simulée.
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
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
  applications,
  checkins,
  emailOutbox,
  eventReports,
  events,
  groupMessageRecipients,
  groupMessages,
  messages,
  notifications,
  participantContactViews,
  participantExports,
  profiles,
  reviews,
  structureMembers,
  structureNotes,
  structures,
  structureVerificationDocuments,
  vehicleCategories,
} from "../../db/schema";
import { env } from "../../env";
import { rateRules } from "../../lib/rateLimit";
import { accountService } from "../account/service";
import { groupMessagesService } from "../communication/group-messages";
import { notificationsService } from "../notifications/service";
import { pointsService } from "../points/service";
import { badgeService } from "./badge";
import { reportService } from "./report";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const MODES = ["cookie", "bearer"] as const;
type Mode = (typeof MODES)[number];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let clock: ReturnType<typeof useClock>;

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
  // `ignoreBOM` : le CSV commence par un BOM que `res.text()` retirerait.
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text, headers: res.headers };
}

const END = fromWallTime({ year: 2026, month: 10, day: 10, hour: 23, minute: 0 });
const START = new Date(END.getTime() + 59 * HOUR);

beforeEach(async () => {
  await resetDb();
  // Deux jours après la fin, en milieu de matinée (hors heures calmes) : les points peuvent être réglés.
  clock = useClock(START);
});

/**
 * « Nocturne de rentrée » terminée : Damien (propriétaire, 2FA), Camille (co-organisatrice), un membre du staff ;
 * Kenji et Lea entrés, Max retenu mais absent, Nina refusée, Zoe entrée mais compte supprimé ensuite (jamais exportée).
 */
async function setup() {
  const ref = await seedReference();
  const damien = await signUp("Damien", { twoFactor: true });
  const camille = await signUp("Camille", { twoFactor: true });
  const staff = await signUp("Equipier", { twoFactor: true });
  const s = await createStructure(damien.id);
  await addMember(s.id, camille.id, "co_organizer");
  await addMember(s.id, staff.id, "staff", ["filtering"]);
  const e = await createEvent(s.id, {
    title: "Nocturne de rentrée",
    city: "Canet",
    startsAt: new Date(END.getTime() - 5 * HOUR),
    endsAt: END,
  });
  const make = async (pseudo: string, status: "accepted" | "refused", entered: boolean) => {
    const u = await signUp(pseudo);
    await db
      .update(profiles)
      .set({ departments: ["66"], firstName: `Prénom${pseudo}`, lastName: `Nom${pseudo}`, phone: "+33612345678" })
      .where(eq(profiles.userId, u.id));
    const vehicle = await createVehicle(u.id, ref);
    await db.insert(vehicleCategories).values({ vehicleId: vehicle.id, categoryId: ref.youngtimer.id });
    const [application] = await db
      .insert(applications)
      .values({
        eventId: e.id,
        userId: u.id,
        vehicleId: vehicle.id,
        status,
        rulesAcceptedAt: new Date(),
        followStructure: false,
      })
      .returning();
    if (entered) {
      await db.insert(checkins).values({
        applicationId: application!.id,
        eventId: e.id,
        method: "scan",
        checkedInAt: new Date(e.startsAt.getTime() + HOUR),
      });
    }
    return { u, application: application! };
  };
  const kenji = await make("Kenji", "accepted", true);
  const lea = await make("Lea", "accepted", true);
  const max = await make("Max", "accepted", false);
  const nina = await make("Nina", "refused", false);
  const zoe = await make("Zoe", "accepted", true);
  return { ref, damien, camille, staff, s, e, kenji, lea, max, nina, zoe };
}

type World = Awaited<ReturnType<typeof setup>>;

async function settle(w: World) {
  expect(await pointsService.settleEvent(w.e.id)).toBe(true);
  await notificationsService.flush();
}

const notificationsOf = (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));

describe("bilan automatique", () => {
  it("calculé au règlement, cohérent avec les points, une seule fois, sans personne", async () => {
    const w = await setup();
    await settle(w);
    const [row] = await db.select().from(eventReports).where(eq(eventReports.eventId, w.e.id));
    expect(row).toBeTruthy();
    const d = row!.data;
    expect(d).toMatchObject({ registered: 5, accepted: 4, present: 3, absent: 1 });
    expect(d.presenceRate).toBe(0.75);
    expect(d.byCategory).toEqual([{ label: "Youngtimer", count: 3 }]);
    expect(d.byMake).toEqual([{ label: "BMW", count: 3 }]);
    expect(d.byDepartment).toEqual([{ label: "66", count: 3 }]);
    // Pas de double comptage : une participation par présent, un malus pour l'absent.
    expect(d.points).toEqual({ participations: d.present, malus: 1 });
    // Aucun identifiant ni pseudo dans le bilan stocké.
    const json = JSON.stringify(d);
    for (const word of ["Kenji", "Lea", "Max", "Nina", "Zoe", w.kenji.u.id]) expect(json).not.toContain(word);
    // Rejoué : rien ne change, rien n'est renvoyé aux organisateurs.
    expect(await pointsService.settleEvent(w.e.id)).toBe(false);
    const [again] = await db.select().from(eventReports).where(eq(eventReports.eventId, w.e.id));
    expect(again?.generatedAt.getTime()).toBe(row!.generatedAt.getTime());
    // Les organisateurs sont prévenus une fois (bilan prêt + remerciement à envoyer), pas le staff.
    for (const o of [w.damien, w.camille]) {
      expect(await notificationsOf(o.id, "event_report_ready")).toHaveLength(1);
      expect(await notificationsOf(o.id, "event_thanks_suggested")).toHaveLength(1);
    }
    expect(await notificationsOf(w.staff.id, "event_report_ready")).toHaveLength(0);
    // La tâche de rafraîchissement est planifiée à J+8.
    const job = clock.jobs.jobs.find((j) => j.name === "event.report-refresh");
    expect(job?.startAfter?.toISOString()).toBe(new Date(END.getTime() + 8 * DAY).toISOString());
  });

  for (const mode of MODES) {
    it(`rafraîchi une fois à J+8 avec les avis (${mode})`, async () => {
      const w = await setup();
      await settle(w);
      // Deux avis avant J+7 ; un troisième après la fermeture est refusé.
      for (const [who, rating] of [
        [w.kenji, 3],
        [w.lea, 2],
        [w.zoe, 3],
      ] as const) {
        const r = await req(
          who.u,
          "POST",
          `/applications/${who.application.id}/review`,
          { rating, comment: "Top" },
          mode,
        );
        expect([200, 201]).toContain(r.status);
      }
      const before = await req(w.damien, "GET", `/events/${w.e.id}/report`, undefined, mode);
      expect(before.status).toBe(200);
      expect(before.json.report.data.reviews).toEqual({ count: 0, average: null });
      expect(before.json.report.refreshedAt).toBeNull();
      // Trop tôt : la tâche ne fait rien.
      expect(await reportService.refresh(w.e.id)).toBe(false);
      clock.set(new Date(END.getTime() + 8 * DAY + 60_000));
      expect(await reportService.refresh(w.e.id)).toBe(true);
      expect(await reportService.refresh(w.e.id)).toBe(false);
      const after = await req(w.damien, "GET", `/events/${w.e.id}/report`, undefined, mode);
      expect(after.json.report.data.reviews).toEqual({ count: 3, average: 2.7 });
      expect(after.json.report.refreshedAt).not.toBeNull();
      // Le balayage de secours ne refait rien.
      expect(await reportService.sweep()).toBe(0);
    });
  }

  for (const mode of MODES) {
    it(`réservé aux organisateurs actifs de la structure, 2FA de session (${mode})`, async () => {
      const w = await setup();
      await settle(w);
      const path = `/events/${w.e.id}/report`;
      expect((await req(w.camille, "GET", path, undefined, mode)).status).toBe(200);
      // Staff, participant, inconnu, anonyme, super admin non membre : jamais de bilan.
      const admin = await signUp("Admin", { twoFactor: true, role: "super_admin" });
      const other = await signUp("Autre", { twoFactor: true });
      await createStructure(other.id);
      for (const who of [w.staff, w.kenji.u, other, admin]) {
        expect((await req(who, "GET", path, undefined, mode)).status).toBe(403);
      }
      expect((await req(null, "GET", path, undefined, mode)).status).toBe(401);
      // Propriétaire sans second facteur prouvé par la session.
      const noFactor = await signUp("SansFacteur");
      await db
        .update(structureMembers)
        .set({ userId: noFactor.id })
        .where(and(eq(structureMembers.structureId, w.s.id), eq(structureMembers.userId, w.camille.id)));
      const refused = await req(noFactor, "GET", path, undefined, mode);
      expect(refused.status).toBe(403);
      expect(refused.json.error.code).toBe("two_factor_required");
    });
  }

  it("structure suspendue : le bilan reste lisible", async () => {
    const w = await setup();
    await settle(w);
    await db
      .update(structures)
      .set({ verification: "suspended", suspendedReason: "badge_expired" })
      .where(eq(structures.id, w.s.id));
    expect((await req(w.damien, "GET", `/events/${w.e.id}/report`)).status).toBe(200);
  });
});

describe("remerciement", () => {
  it("avant la fin de l'événement : refusé", async () => {
    const w = await setup();
    clock.set(new Date(END.getTime() - HOUR));
    const r = await req(w.damien, "POST", `/events/${w.e.id}/thanks`, {});
    expect(r.status).toBe(409);
    expect(r.json.error.details.reason).toBe("not_ended");
  });

  for (const mode of MODES) {
    it(`un message par présent avec son lien d'avis, une seule fois (${mode})`, async () => {
      const w = await setup();
      await settle(w);
      const state = await req(w.damien, "GET", `/events/${w.e.id}/report`, undefined, mode);
      expect(state.json.thanks).toMatchObject({ sentAt: null, blockedReason: null, recipients: 3 });
      expect(state.json.thanks.template.body).toContain("{{review_link}}");
      const sent = await req(w.damien, "POST", `/events/${w.e.id}/thanks`, {}, mode);
      expect(sent.status).toBe(201);
      expect(sent.json.recipientsCount).toBe(3);
      await groupMessagesService.drain(sent.json.groupMessageId);
      await notificationsService.flush();

      const [event] = await db.select().from(events).where(eq(events.id, w.e.id));
      expect(event?.thanksSentAt).not.toBeNull();
      const [gm] = await db.select().from(groupMessages).where(eq(groupMessages.id, sent.json.groupMessageId));
      expect(gm).toMatchObject({ segment: "checked_in", thanks: true, status: "sent" });

      // Chaque présent a son message, avec SON lien (unique par candidature).
      const links = new Set<string>();
      for (const who of [w.kenji, w.lea, w.zoe]) {
        const [rec] = await db
          .select()
          .from(groupMessageRecipients)
          .where(and(eq(groupMessageRecipients.groupMessageId, gm!.id), eq(groupMessageRecipients.userId, who.u.id)));
        const [msg] = await db.select().from(messages).where(eq(messages.id, rec!.messageId!));
        const link = `${env.PUBLIC_URL}/app/acces?avis=${who.application.id}`;
        expect(msg?.body).toContain(link);
        expect(msg?.body).toContain(who.u.pseudo);
        links.add(link);
        // Une ligne du Journal avec le même lien, pas d'e-mail.
        const [journal] = await notificationsOf(who.u.id, "event_thanks");
        expect(journal?.data).toMatchObject({ link: `/app/acces?avis=${who.application.id}` });
      }
      expect(links.size).toBe(3);
      // L'absent, la refusée et le staff n'ont rien reçu.
      for (const who of [w.max, w.nina]) {
        expect(await notificationsOf(who.u.id, "event_thanks")).toHaveLength(0);
        const rows = await db.select().from(groupMessageRecipients).where(eq(groupMessageRecipients.userId, who.u.id));
        expect(rows).toHaveLength(0);
      }
      expect((await db.select().from(emailOutbox).where(eq(emailOutbox.template, "event_thanks"))).length).toBe(0);

      // Une seule fois.
      const again = await req(w.damien, "POST", `/events/${w.e.id}/thanks`, {}, mode);
      expect(again.status).toBe(409);
      expect(again.json.error.details.reason).toBe("sent");
      expect(await db.select().from(groupMessages).where(eq(groupMessages.eventId, w.e.id))).toHaveLength(1);

      // Un présent laisse son avis par le lien : le bilan le compte à J+8.
      const review = await req(w.kenji.u, "POST", `/applications/${w.kenji.application.id}/review`, {
        rating: 3,
        comment: "Merci à vous",
      });
      expect([200, 201]).toContain(review.status);
    });
  }

  it("deux envois simultanés : un seul message groupé, un seul `thanks_sent_at`", async () => {
    const w = await setup();
    await settle(w);
    const results = await Promise.all([
      req(w.damien, "POST", `/events/${w.e.id}/thanks`, {}),
      req(w.camille, "POST", `/events/${w.e.id}/thanks`, {}),
      req(w.damien, "POST", `/events/${w.e.id}/thanks`, {}),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await db.select().from(groupMessages).where(eq(groupMessages.eventId, w.e.id))).toHaveLength(1);
  });

  it("texte libre sans lien d'avis : le lien est ajouté ; trop tard (J+7) : refusé", async () => {
    const w = await setup();
    await settle(w);
    const ok = await req(w.damien, "POST", `/events/${w.e.id}/thanks`, { body: "Merci d'être venus !" });
    expect(ok.status).toBe(201);
    const [gm] = await db.select().from(groupMessages).where(eq(groupMessages.id, ok.json.groupMessageId));
    expect(gm?.body).toContain("{{review_link}}");
    const w2 = await setup2(w);
    clock.set(new Date(END.getTime() + 7 * DAY + HOUR));
    const late = await req(w.damien, "POST", `/events/${w2.id}/thanks`, {});
    expect(late.status).toBe(409);
    expect(late.json.error.details.reason).toBe("too_late");
  });

  async function setup2(w: World) {
    return createEvent(w.s.id, { title: "Autre", startsAt: new Date(END.getTime() - 5 * HOUR), endsAt: END });
  }

  for (const mode of MODES) {
    it(`réservé à la structure : staff, autre structure, super admin et anonyme refusés (${mode})`, async () => {
      const w = await setup();
      await settle(w);
      const admin = await signUp("Admin", { twoFactor: true, role: "super_admin" });
      const other = await signUp("Autre", { twoFactor: true });
      await createStructure(other.id);
      for (const who of [w.staff, w.kenji.u, other, admin]) {
        expect((await req(who, "POST", `/events/${w.e.id}/thanks`, {}, mode)).status).toBe(403);
      }
      expect((await req(null, "POST", `/events/${w.e.id}/thanks`, {}, mode)).status).toBe(401);
      expect((await db.select().from(groupMessages)).length).toBe(0);
      // Structure suspendue : plus d'écriture.
      await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, w.s.id));
      expect((await req(w.damien, "POST", `/events/${w.e.id}/thanks`, {}, mode)).status).toBe(403);
    });
  }
});

describe("export des participants", () => {
  const path = (id: string, reason?: string) =>
    `/events/${id}/participants/export${reason === undefined ? "" : `?reason=${encodeURIComponent(reason)}`}`;

  for (const mode of MODES) {
    it(`motif obligatoire, journal, CSV marqué sans notes ni comptes supprimés (${mode})`, async () => {
      const w = await setup();
      await settle(w);
      // Compte supprimé : jamais dans l'export.
      await accountService.anonymize(w.zoe.u.id, null);
      // Note interne : jamais dans l'export.
      await db
        .insert(structureNotes)
        .values({ structureId: w.s.id, subjectUserId: w.kenji.u.id, body: "NOTE-SECRETE", authorId: w.damien.id });
      // Une cellule piégée : doit être neutralisée.
      await db.update(profiles).set({ firstName: '=HYPERLINK("http://x")' }).where(eq(profiles.userId, w.lea.u.id));

      expect((await req(w.damien, "GET", path(w.e.id), undefined, mode)).status).toBe(400);
      expect((await req(w.damien, "GET", path(w.e.id, "court"), undefined, mode)).status).toBe(400);
      expect(await db.select().from(participantExports)).toHaveLength(0);

      const res = await req(w.damien, "GET", path(w.e.id, "Demande de la gendarmerie du 12/10"), undefined, mode);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toMatch(
        /^attachment; filename="orasso-evenement-[a-z0-9-]+-participants-2026-10-13\.csv"$/,
      );
      expect(res.text.startsWith("﻿")).toBe(true);
      const lines = res.text.replace("﻿", "").trim().split("\r\n");
      expect(lines[0]).toBe(
        "Pseudo;Nom;Prénom;E-mail;Téléphone;Véhicule;Plaque;Catégorie;Statut;Zone;Entrée (heure);Entrée (méthode);Désistement;Points;Crew",
      );
      // Kenji, Lea (entrés) et Max (retenu absent) : 3 lignes ; ni Nina (refusée) ni Zoe (supprimée).
      expect(lines).toHaveLength(1 + 3 + 1);
      expect(res.text).toContain("Kenji");
      expect(res.text).not.toContain("Nina");
      expect(res.text).not.toContain("Zoe");
      expect(res.text).not.toContain("NOTE-SECRETE");
      expect(res.text).toContain("'=HYPERLINK");
      expect(res.text).not.toMatch(/;=HYPERLINK/);
      // Dernière ligne de marquage : structure, date, pseudo, motif.
      expect(lines.at(-1)).toContain("Export Orasso · Club de test");
      expect(lines.at(-1)).toContain(w.damien.pseudo);
      expect(lines.at(-1)).toContain("motif : Demande de la gendarmerie du 12/10");
      // Tracé : table des exports + journal d'administration.
      const [exp] = await db.select().from(participantExports);
      expect(exp).toMatchObject({ eventId: w.e.id, structureId: w.s.id, userId: w.damien.id, rowCount: 3 });
      expect(exp?.reason).toBe("Demande de la gendarmerie du 12/10");
      const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "participants.export"));
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorUserId: w.damien.id, targetId: w.e.id, structureId: w.s.id });
    });
  }

  it("réservé aux organisateurs de la structure ; refusé si la structure est suspendue ; limite de débit", async () => {
    const w = await setup();
    await settle(w);
    const admin = await signUp("Admin", { twoFactor: true, role: "super_admin" });
    const other = await signUp("Autre", { twoFactor: true });
    await createStructure(other.id);
    for (const who of [w.staff, w.kenji.u, other, admin]) {
      expect((await req(who, "GET", path(w.e.id, "Un motif suffisant"))).status).toBe(403);
    }
    expect((await req(null, "GET", path(w.e.id, "Un motif suffisant"))).status).toBe(401);
    expect(await db.select().from(participantExports)).toHaveLength(0);
    for (let i = 0; i < rateRules.participantsExport.max; i++) {
      expect((await req(w.camille, "GET", path(w.e.id, "Un motif suffisant"))).status).toBe(200);
    }
    expect((await req(w.camille, "GET", path(w.e.id, "Un motif suffisant"))).status).toBe(429);
    expect(await db.select().from(participantExports)).toHaveLength(rateRules.participantsExport.max);
  });
});

describe("coordonnées après J+7", () => {
  it("tracées une fois par fiche et par jour, seulement après J+7 et pour l'organisateur", async () => {
    const w = await setup();
    await settle(w);
    const list = () => req(w.damien, "GET", `/events/${w.e.id}/applications?kind=vehicle&limit=50`);
    const views = () => db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "participants.contact_view"));
    // Avant J+7 : aucune trace.
    expect((await list()).status).toBe(200);
    expect(await views()).toHaveLength(0);
    // Après J+7 : une entrée par fiche (5 candidatures dont la refusée) ; une seconde ouverture le même jour n'en ajoute pas.
    clock.set(new Date(END.getTime() + 8 * DAY));
    const first = await list();
    expect(first.status).toBe(200);
    expect(first.json.items[0].applicant.phone).toBe("+33612345678");
    expect(await views()).toHaveLength(5);
    await list();
    expect(await views()).toHaveLength(5);
    // Fiche ouverte seule le même jour : déjà tracée. Le lendemain : une nouvelle entrée.
    const one = await req(w.damien, "GET", `/applications/${w.kenji.application.id}`);
    expect(one.status).toBe(200);
    expect(await views()).toHaveLength(5);
    clock.advance(DAY);
    await req(w.damien, "GET", `/applications/${w.kenji.application.id}`);
    expect(await views()).toHaveLength(6);
    // Une autre personne de l'organisation est tracée à son nom (une entrée par fiche, par personne et par jour).
    await req(w.camille, "GET", `/applications/${w.kenji.application.id}`);
    expect(await views()).toHaveLength(7);
    expect(await db.select().from(participantContactViews)).toHaveLength(7);
    // Le staff de filtration ne voit pas les coordonnées : rien à tracer.
    const before = (await views()).length;
    const staffList = await req(w.staff, "GET", `/events/${w.e.id}/applications?kind=vehicle&limit=50`);
    expect(staffList.status).toBe(200);
    expect(staffList.json.items[0].applicant.phone).toBeNull();
    expect((await views()).length).toBe(before);
  });
});

describe("notes internes", () => {
  for (const mode of MODES) {
    it(`privées de la structure : fiche de tri oui, participant, autre structure, staff et export non (${mode})`, async () => {
      const w = await setup();
      const created = await req(
        w.damien,
        "POST",
        `/structures/${w.s.id}/notes`,
        { pseudo: w.kenji.u.pseudo.toLowerCase(), eventId: w.e.id, body: "Super participant, à réinviter" },
        mode,
      );
      expect(created.status).toBe(201);
      expect(created.json).toMatchObject({
        subjectPseudo: w.kenji.u.pseudo,
        mine: true,
        eventTitle: "Nocturne de rentrée",
      });
      const noteId = created.json.id as string;

      // Visible dans la fiche de tri (organisateurs), pas pour le staff de filtration.
      const triage = await req(
        w.camille,
        "GET",
        `/events/${w.e.id}/applications?kind=vehicle&limit=50`,
        undefined,
        mode,
      );
      const kenji = triage.json.items.find(
        (i: { applicant: { userId: string } }) => i.applicant.userId === w.kenji.u.id,
      );
      expect(kenji.applicant.notes).toHaveLength(1);
      expect(kenji.applicant.notes[0]).toMatchObject({ body: "Super participant, à réinviter", mine: false });
      const staffView = await req(
        w.staff,
        "GET",
        `/events/${w.e.id}/applications?kind=vehicle&limit=50`,
        undefined,
        mode,
      );
      for (const item of staffView.json.items) expect(item.applicant.notes).toEqual([]);

      // Jamais visible du participant : ni sa carte d'accès, ni l'API des notes.
      const mine = await req(w.kenji.u, "GET", `/applications/${w.kenji.application.id}`, undefined, mode);
      expect(JSON.stringify(mine.json)).not.toContain("Super participant");
      expect((await req(w.kenji.u, "GET", `/structures/${w.s.id}/notes`, undefined, mode)).status).toBe(403);

      // Jamais d'une autre structure (lecture, modification, suppression), jamais du staff ni du super admin.
      const other = await signUp("Autre", { twoFactor: true });
      const otherStructure = await createStructure(other.id);
      expect((await req(other, "GET", `/structures/${w.s.id}/notes`, undefined, mode)).status).toBe(403);
      expect((await req(other, "PATCH", `/structure-notes/${noteId}`, { body: "piraté" }, mode)).status).toBe(404);
      expect((await req(other, "DELETE", `/structure-notes/${noteId}`, undefined, mode)).status).toBe(404);
      expect(
        (
          await req(
            other,
            "POST",
            `/structures/${otherStructure.id}/notes`,
            { pseudo: w.kenji.u.pseudo, body: "x" },
            mode,
          )
        ).status,
      ).toBe(404);
      const admin = await signUp("Admin", { twoFactor: true, role: "super_admin" });
      for (const who of [w.staff, admin]) {
        expect((await req(who, "GET", `/structures/${w.s.id}/notes`, undefined, mode)).status).toBe(403);
        expect((await req(who, "PATCH", `/structure-notes/${noteId}`, { body: "x" }, mode)).status).toBe(404);
      }

      // Recherche par pseudo, modification et suppression par l'organisation.
      const search = await req(w.camille, "GET", `/structures/${w.s.id}/notes?q=ken`, undefined, mode);
      expect(search.json.items).toHaveLength(1);
      expect(
        (await req(w.camille, "GET", `/structures/${w.s.id}/notes?q=zzz`, undefined, mode)).json.items,
      ).toHaveLength(0);
      const patched = await req(w.camille, "PATCH", `/structure-notes/${noteId}`, { body: "Corrigée" }, mode);
      expect(patched.status).toBe(200);
      expect(patched.json.body).toBe("Corrigée");
      expect((await req(w.damien, "DELETE", `/structure-notes/${noteId}`, undefined, mode)).status).toBe(204);
      expect((await req(w.damien, "GET", `/structures/${w.s.id}/notes`, undefined, mode)).json.items).toHaveLength(0);
    });
  }

  it("seulement sur une personne passée par la structure ; texte borné ; structure suspendue : lecture seule", async () => {
    const w = await setup();
    const stranger = await signUp("Inconnu");
    expect(
      (await req(w.damien, "POST", `/structures/${w.s.id}/notes`, { pseudo: stranger.pseudo, body: "x" })).status,
    ).toBe(404);
    expect(
      (await req(w.damien, "POST", `/structures/${w.s.id}/notes`, { pseudo: "Fantome_99", body: "x" })).status,
    ).toBe(404);
    expect(
      (await req(w.damien, "POST", `/structures/${w.s.id}/notes`, { pseudo: w.kenji.u.pseudo, body: "x".repeat(501) }))
        .status,
    ).toBe(400);
    expect(
      (await req(w.damien, "POST", `/structures/${w.s.id}/notes`, { pseudo: w.kenji.u.pseudo, body: "   " })).status,
    ).toBe(400);
    const ok = await req(w.damien, "POST", `/structures/${w.s.id}/notes`, {
      pseudo: w.kenji.u.pseudo,
      body: "Ponctuel",
    });
    expect(ok.status).toBe(201);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, w.s.id));
    expect((await req(w.damien, "GET", `/structures/${w.s.id}/notes`)).status).toBe(200);
    expect(
      (await req(w.damien, "POST", `/structures/${w.s.id}/notes`, { pseudo: w.kenji.u.pseudo, body: "y" })).status,
    ).toBe(403);
    expect((await req(w.damien, "DELETE", `/structure-notes/${ok.json.id}`)).status).toBe(403);
  });

  it("compte supprimé : les notes sur lui disparaissent, celles qu'il a écrites perdent leur auteur", async () => {
    const w = await setup();
    await req(w.camille, "POST", `/structures/${w.s.id}/notes`, { pseudo: w.kenji.u.pseudo, body: "Sur Kenji" });
    await req(w.camille, "POST", `/structures/${w.s.id}/notes`, { pseudo: w.lea.u.pseudo, body: "Sur Lea" });
    await accountService.anonymize(w.kenji.u.id, null);
    const rows = await db.select().from(structureNotes);
    expect(rows.map((r) => r.body)).toEqual(["Sur Lea"]);
    await accountService.anonymize(w.camille.id, null);
    const [lea] = await db.select().from(structureNotes);
    expect(lea?.authorId).toBeNull();
  });
});

describe("badge de structure", () => {
  const D = (n: number) => new Date(START.getTime() + n * DAY);

  async function badgeWorld(daysLeft: number) {
    const damien = await signUp("Damien", { twoFactor: true });
    const camille = await signUp("Camille", { twoFactor: true });
    const s = await createStructure(damien.id);
    await addMember(s.id, camille.id, "co_organizer");
    const staff = await signUp("Equipier", { twoFactor: true });
    await addMember(s.id, staff.id, "staff", ["scan"]);
    await db
      .update(structures)
      .set({ badgeExpiresAt: D(daysLeft) })
      .where(eq(structures.id, s.id));
    // Un événement publié à venir : conservé en cas de suspension.
    const upcoming = await createEvent(s.id, { title: "À venir", startsAt: D(60) });
    const admin = await signUp("Admin", { twoFactor: true, role: "super_admin" });
    return { damien, camille, staff, s, admin, upcoming };
  }

  const structureOf = async (id: string) => (await db.select().from(structures).where(eq(structures.id, id)))[0]!;
  const mailsOf = (template: string) => db.select().from(emailOutbox).where(eq(emailOutbox.template, template));

  it("un rappel par palier (1 mois, 1 semaine, la veille), une fois chacun, puis suspension réversible", async () => {
    const b = await badgeWorld(40);
    expect(await badgeService.sweep()).toEqual({ reminded: 0, suspended: 0 });

    // J-30 : rappel du mois, aux propriétaire et co-organisateur, pas au staff ; e-mail aussi.
    clock.set(D(10));
    expect(await badgeService.sweep()).toEqual({ reminded: 1, suspended: 0 });
    await notificationsService.flush();
    for (const o of [b.damien, b.camille])
      expect(await notificationsOf(o.id, "structure_badge_expiring")).toHaveLength(1);
    expect(await notificationsOf(b.staff.id, "structure_badge_expiring")).toHaveLength(0);
    expect(await mailsOf("structure_badge_expiring")).toHaveLength(2);
    // Rejouée : rien de plus (idempotente).
    expect(await badgeService.sweep()).toEqual({ reminded: 0, suspended: 0 });
    // Deux balayages simultanés : un seul rappel de plus.
    clock.set(D(34));
    const [r1, r2] = await Promise.all([badgeService.sweep(), badgeService.sweep()]);
    expect(r1.reminded + r2.reminded).toBe(1);
    clock.set(D(39));
    expect((await badgeService.sweep()).reminded).toBe(1);
    await notificationsService.flush();
    expect(await notificationsOf(b.damien.id, "structure_badge_expiring")).toHaveLength(3);
    expect((await structureOf(b.s.id)).badgeRemindedAt).toMatchObject({
      "30": expect.any(String),
      "7": expect.any(String),
      "1": expect.any(String),
    });

    // Échéance passée : suspension, e-mail, rien n'est supprimé.
    clock.set(D(41));
    expect(await badgeService.sweep()).toEqual({ reminded: 0, suspended: 1 });
    await notificationsService.flush();
    const s = await structureOf(b.s.id);
    expect(s).toMatchObject({ verification: "suspended", suspendedReason: "badge_expired" });
    expect(await notificationsOf(b.damien.id, "structure_badge_suspended")).toHaveLength(1);
    expect(await mailsOf("structure_badge_suspended")).toHaveLength(2);
    expect(await badgeService.sweep()).toEqual({ reminded: 0, suspended: 0 });
    expect((await db.select().from(events).where(eq(events.id, b.upcoming.id)))[0]?.status).toBe("published");
    expect(await db.select().from(structureMembers).where(eq(structureMembers.structureId, b.s.id))).toHaveLength(3);
  });

  it("une tâche manquée n'envoie qu'un seul rappel (le plus urgent)", async () => {
    const b = await badgeWorld(3);
    expect(await badgeService.sweep()).toEqual({ reminded: 1, suspended: 0 });
    await notificationsService.flush();
    expect(await notificationsOf(b.damien.id, "structure_badge_expiring")).toHaveLength(1);
    expect((await structureOf(b.s.id)).badgeRemindedAt).toMatchObject({
      "30": expect.any(String),
      "7": expect.any(String),
    });
  });

  for (const mode of MODES) {
    it(`structure suspendue : plus de création ni de publication, historique lisible (${mode})`, async () => {
      const b = await badgeWorld(5);
      const draft = await createEvent(b.s.id, { title: "Brouillon", status: "draft", startsAt: D(90) });
      clock.set(D(6));
      await badgeService.sweep();
      const create = await req(
        b.damien,
        "POST",
        `/structures/${b.s.id}/events`,
        {
          title: "Nouveau",
          format: "gathering",
          startsAt: D(100).toISOString(),
          endsAt: new Date(D(100).getTime() + 4 * HOUR).toISOString(),
          admittedVehicleTypes: ["car"],
          admission: "open",
          registrationsOpenAt: D(10).toISOString(),
        },
        mode,
      );
      expect(create.status).toBe(403);
      expect((await req(b.damien, "POST", `/events/${draft.id}/publish`, undefined, mode)).status).toBe(403);
      expect((await req(b.damien, "POST", `/events/${b.upcoming.id}/duplicate`, undefined, mode)).status).toBe(403);
      // Lecture : l'événement publié à venir et la liste de la structure restent lisibles.
      expect((await req(b.damien, "GET", `/events/${b.upcoming.id}`, undefined, mode)).status).toBe(200);
      expect((await req(b.damien, "GET", `/structures/${b.s.id}/events`, undefined, mode)).status).toBe(200);
      // Communication : écriture refusée (lot 20).
      expect(
        (await req(b.damien, "POST", `/events/${b.upcoming.id}/announcements`, { body: "Salut", notify: false }, mode))
          .status,
      ).toBe(403);
      // Levée par l'équipe : la publication redevient possible.
      const lifted = await req(b.admin, "POST", `/admin/structures/${b.s.id}/lift`, { reason: "Dossier reçu" }, mode);
      expect(lifted.status).toBe(200);
      expect(lifted.json).toMatchObject({ verification: "verified", suspendedReason: null });
      expect((await req(b.damien, "POST", `/events/${draft.id}/publish`, undefined, mode)).status).toBe(200);
    });
  }

  it("la levée d'un badge échu laisse 30 jours de grâce (pas de re-suspension immédiate), rappels remis à zéro", async () => {
    const b = await badgeWorld(2);
    clock.set(D(3));
    await badgeService.sweep();
    expect((await structureOf(b.s.id)).verification).toBe("suspended");
    expect(
      (await req(b.admin, "POST", `/admin/structures/${b.s.id}/lift`, { reason: "Retard de paiement réglé" })).status,
    ).toBe(200);
    const s = await structureOf(b.s.id);
    expect(s.badgeExpiresAt!.getTime()).toBe(clock.now.getTime() + 30 * DAY);
    expect(s.badgeRemindedAt).toEqual({});
    expect(await badgeService.sweep()).toEqual({ reminded: 1, suspended: 0 });
    expect((await structureOf(b.s.id)).verification).toBe("verified");
    // Levée d'une structure qui n'est pas suspendue : refusée.
    expect((await req(b.admin, "POST", `/admin/structures/${b.s.id}/lift`, { reason: "Encore" })).status).toBe(409);
  });

  for (const mode of MODES) {
    it(`renouvellement (+1 an), suspension de l'équipe, journal d'administration (${mode})`, async () => {
      const b = await badgeWorld(20);
      const renewed = await req(
        b.admin,
        "POST",
        `/admin/structures/${b.s.id}/renew-badge`,
        { note: "Bonne année" },
        mode,
      );
      expect(renewed.status).toBe(200);
      const expected = new Date(D(20));
      expected.setUTCFullYear(expected.getUTCFullYear() + 1);
      expect((await structureOf(b.s.id)).badgeExpiresAt?.toISOString()).toBe(expected.toISOString());
      expect((await structureOf(b.s.id)).badgeRemindedAt).toEqual({});
      // Suspension de l'équipe, puis renouvellement refusé (il faut lever d'abord).
      expect(
        (await req(b.admin, "POST", `/admin/structures/${b.s.id}/suspend`, { reason: "Litige en cours" }, mode)).status,
      ).toBe(200);
      expect((await structureOf(b.s.id)).suspendedReason).toBe("moderation");
      expect((await req(b.admin, "POST", `/admin/structures/${b.s.id}/renew-badge`, {}, mode)).status).toBe(409);
      expect(
        (await req(b.admin, "POST", `/admin/structures/${b.s.id}/suspend`, { reason: "Encore" }, mode)).status,
      ).toBe(409);
      await req(b.admin, "POST", `/admin/structures/${b.s.id}/lift`, { reason: "Litige clos" }, mode);
      const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.structureId, b.s.id));
      expect(audit.map((a) => a.action).sort()).toEqual(
        ["structure.lift", "structure.renew_badge", "structure.suspend"].sort(),
      );
      expect(audit.every((a) => a.actorUserId === b.admin.id)).toBe(true);
    });
  }

  it("liste de l'équipe par échéance ; réservée au super administrateur (2FA)", async () => {
    const b = await badgeWorld(10);
    const far = await badgeWorld(300);
    const list = await req(b.admin, "GET", "/admin/structures?badge=expiring");
    expect(list.status).toBe(200);
    expect(list.json.items.map((i: { id: string }) => i.id)).toEqual([b.s.id]);
    expect(list.json.items[0]).toMatchObject({ daysLeft: 10, owner: { pseudo: b.damien.pseudo } });
    expect(list.json.counts).toEqual({ expiring: 1, suspended: 0 });
    expect((await req(b.admin, "GET", "/admin/structures?badge=all")).json.items).toHaveLength(2);
    const moderator = await signUp("Moderatrice", { twoFactor: true, role: "moderator" });
    const noFactor = await signUp("AdminSansFacteur", { role: "super_admin" });
    for (const who of [b.damien, b.staff, moderator, noFactor]) {
      expect((await req(who, "GET", "/admin/structures?badge=expiring")).status).toBe(403);
      const valid = { reason: "motif assez long", note: "x", pseudo: "Quelquun", documentId: crypto.randomUUID() };
      for (const action of ["renew-badge", "suspend", "lift", "transfer-owner"]) {
        expect((await req(who, "POST", `/admin/structures/${b.s.id}/${action}`, valid)).status).toBe(403);
      }
      expect((await req(who, "GET", `/admin/structures/${b.s.id}`)).status).toBe(403);
    }
    expect((await req(null, "GET", "/admin/structures?badge=expiring")).status).toBe(401);
    expect((await structureOf(far.s.id)).verification).toBe("verified");
  });

  for (const mode of MODES) {
    it(`transfert de propriétaire sur justificatif : ancien → co-organisateur, audit, e-mails (${mode})`, async () => {
      const b = await badgeWorld(100);
      const newOwner = await signUp("NouveauPresident");
      const upload = async (u: TestUser) => {
        const form = new FormData();
        form.append(
          "file",
          new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x0a])], "pv.pdf", { type: "application/pdf" }),
        );
        const res = await app.request(`/api/admin/structures/${b.s.id}/documents`, {
          method: "POST",
          headers: {
            origin: ORIGIN,
            ...(mode === "cookie" ? { cookie: u.cookie } : { authorization: `Bearer ${bearerOf(u.cookie)}` }),
          },
          body: form,
        });
        return { status: res.status, json: (await res.json().catch(() => null)) as { id: string; kind: string } };
      };
      // Le justificatif est téléversé par l'équipe seulement.
      expect((await upload(b.damien)).status).toBe(403);
      const doc = await upload(b.admin);
      expect(doc.status).toBe(201);
      expect(doc.json.kind).toBe("other");

      const body = { pseudo: newOwner.pseudo, reason: "Démission du président, PV du 12/10", documentId: doc.json.id };
      // Sans le bon justificatif, motif trop court, personne inconnue : refusé.
      expect(
        (
          await req(
            b.admin,
            "POST",
            `/admin/structures/${b.s.id}/transfer-owner`,
            { ...body, documentId: crypto.randomUUID() },
            mode,
          )
        ).status,
      ).toBe(400);
      expect(
        (await req(b.admin, "POST", `/admin/structures/${b.s.id}/transfer-owner`, { ...body, reason: "court" }, mode))
          .status,
      ).toBe(400);
      expect(
        (
          await req(
            b.admin,
            "POST",
            `/admin/structures/${b.s.id}/transfer-owner`,
            { ...body, pseudo: "Fantome_42" },
            mode,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await req(
            b.admin,
            "POST",
            `/admin/structures/${b.s.id}/transfer-owner`,
            { ...body, pseudo: b.damien.pseudo },
            mode,
          )
        ).status,
      ).toBe(409);
      // Un justificatif d'une autre structure n'est pas valable.
      const otherOwner = await signUp("AutrePresident", { twoFactor: true });
      const otherS = await createStructure(otherOwner.id);
      const [foreign] = await db
        .insert(structureVerificationDocuments)
        .values({
          structureId: otherS.id,
          kind: "other",
          storageKey: "private/x.pdf",
          fileName: "x.pdf",
          contentType: "application/pdf",
          sizeBytes: 1,
        })
        .returning();
      expect(
        (
          await req(
            b.admin,
            "POST",
            `/admin/structures/${b.s.id}/transfer-owner`,
            { ...body, documentId: foreign!.id },
            mode,
          )
        ).status,
      ).toBe(400);

      const done = await req(b.admin, "POST", `/admin/structures/${b.s.id}/transfer-owner`, body, mode);
      expect(done.status).toBe(200);
      const roleOf = async (userId: string) =>
        (
          await db
            .select()
            .from(structureMembers)
            .where(and(eq(structureMembers.structureId, b.s.id), eq(structureMembers.userId, userId)))
        )[0];
      expect(await roleOf(b.damien.id)).toMatchObject({ role: "co_organizer", status: "active" });
      expect(await roleOf(newOwner.id)).toMatchObject({ role: "owner", status: "active" });
      const owners = await db
        .select()
        .from(structureMembers)
        .where(
          and(
            eq(structureMembers.structureId, b.s.id),
            eq(structureMembers.role, "owner"),
            eq(structureMembers.status, "active"),
          ),
        );
      expect(owners).toHaveLength(1);
      const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "structure.transfer_owner"));
      expect(audit).toHaveLength(1);
      expect(audit[0]?.reason).toContain("Démission du président");
      expect(audit[0]?.actorUserId).toBe(b.admin.id);
      expect(await mailsOf("structure_owner_changed")).toHaveLength(2);
    });
  }
});

describe("lots précédents : le lien d'avis des messages groupés", () => {
  it("un message groupé ordinaire du segment « entrés » porte aussi le lien d'avis personnel", async () => {
    const w = await setup();
    await settle(w);
    const sent = await req(w.damien, "POST", `/structures/${w.s.id}/group-messages`, {
      clientId: crypto.randomUUID(),
      eventId: w.e.id,
      segment: "checked_in",
      body: "Ton avis : {{review_link}}",
    });
    expect(sent.status).toBe(202);
    await groupMessagesService.drain(sent.json.groupMessageId);
    const rows = await db.select().from(messages).where(eq(messages.groupMessageId, sent.json.groupMessageId));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.body).sort()).toEqual(
      [w.kenji, w.lea, w.zoe].map((x) => `Ton avis : ${env.PUBLIC_URL}/app/acces?avis=${x.application.id}`).sort(),
    );
    // Un message groupé ordinaire ne compte pas comme « remerciement envoyé ».
    expect((await db.select().from(events).where(eq(events.id, w.e.id)))[0]?.thanksSentAt).toBeNull();
    expect(await db.select().from(reviews)).toHaveLength(0);
  });
});
