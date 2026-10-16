// Lot 22 : calculs purs de la casquette Organisateur (événement du jour, groupes, compteurs, alertes, staff, Boîte, accès).
import type { EventCard, EventStaffMember, LiveCounters, ScanReport, StructureMember } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import type { FieldAlert } from "./api/orga";
import {
  applyAlertEvent,
  availableSegments,
  cancelConfirmed,
  canRemind,
  categoryRows,
  gateKind,
  groupEvents,
  groupMessageIssue,
  isTwoFactorError,
  mapUrl,
  missingVehicles,
  openAlerts,
  otherOutlook,
  pickCurrentEvent,
  rolesChanged,
  scanSummary,
  sortAlerts,
  staffRequests,
  staffSummary,
  toggleRole,
} from "./orga";

const NOW = new Date("2026-10-17T10:00:00Z"); // 12 h à Paris, samedi

function event(id: string, startsAt: string, endsAt: string, status: EventCard["status"] = "published"): EventCard {
  return { id, slug: id, title: id, startsAt, endsAt, status } as EventCard;
}

describe("événements de la structure", () => {
  const events = [
    event("brouillon", "2026-11-01T08:00:00Z", "2026-11-01T16:00:00Z", "draft"),
    event("loin", "2026-12-01T08:00:00Z", "2026-12-01T16:00:00Z"),
    event("proche", "2026-10-25T08:00:00Z", "2026-10-25T16:00:00Z"),
    event("hier", "2026-10-16T08:00:00Z", "2026-10-16T16:00:00Z"),
    event("avant", "2026-09-01T08:00:00Z", "2026-09-01T16:00:00Z"),
    event("annule", "2026-10-30T08:00:00Z", "2026-10-30T16:00:00Z", "cancelled"),
  ];

  it("range par statut : à venir du plus proche au plus lointain, passés et annulés du plus récent", () => {
    const g = groupEvents(events, NOW);
    expect(g.drafts.map((e) => e.id)).toEqual(["brouillon"]);
    expect(g.upcoming.map((e) => e.id)).toEqual(["proche", "loin"]);
    expect(g.past.map((e) => e.id)).toEqual(["hier", "avant"]);
    expect(g.cancelled.map((e) => e.id)).toEqual(["annule"]);
  });

  it("un événement en cours reste « à venir » tant qu'il n'est pas fini", () => {
    const live = event("live", "2026-10-17T07:00:00Z", "2026-10-17T18:00:00Z");
    expect(groupEvents([live], NOW).upcoming).toHaveLength(1);
  });

  it("le Direct suit l'événement en cours, sinon celui du jour (même fini), sinon le prochain publié", () => {
    const live = event("live", "2026-10-17T07:00:00Z", "2026-10-17T18:00:00Z");
    expect(pickCurrentEvent([...events, live], NOW)).toMatchObject({ phase: "live", event: { id: "live" } });

    const morning = event("matin", "2026-10-17T05:00:00Z", "2026-10-17T08:00:00Z");
    expect(pickCurrentEvent([...events, morning], NOW)).toMatchObject({ phase: "today", event: { id: "matin" } });

    expect(pickCurrentEvent(events, NOW)).toMatchObject({ phase: "next", event: { id: "proche" } });
  });

  it("le Direct ignore les brouillons et les annulés, et ne renvoie rien sans événement devant nous", () => {
    expect(pickCurrentEvent([events[0] as EventCard, events[5] as EventCard], NOW)).toBeNull();
    expect(pickCurrentEvent([events[4] as EventCard], NOW)).toBeNull();
  });

  it("bascule Maintenu ↔ Incertain, et annulation confirmée par le mot tapé", () => {
    expect(otherOutlook("maintained")).toBe("uncertain");
    expect(otherOutlook("uncertain")).toBe("maintained");
    expect(cancelConfirmed(" annuler ", "ANNULER")).toBe(true);
    expect(cancelConfirmed("annule", "ANNULER")).toBe(false);
  });
});

describe("direct du jour J", () => {
  const live = {
    arrived: 12,
    expected: 20,
    byCategory: [
      { categoryId: "a", slug: "a", label: "Youngtimers", arrived: 5, expected: 8 },
      { categoryId: "b", slug: "b", label: "Américaines", arrived: 0, expected: 0 },
      { categoryId: "c", slug: "c", label: "Sportives", arrived: 7, expected: 6 },
    ],
  } as LiveCounters;

  it("compteurs par catégorie : catégories vides masquées, jamais de manquants négatifs", () => {
    expect(categoryRows(live)).toEqual([
      { key: "a", label: "Youngtimers", arrived: 5, expected: 8, missing: 3 },
      { key: "c", label: "Sportives", arrived: 7, expected: 6, missing: 0 },
    ]);
    expect(missingVehicles(live)).toBe(8);
    expect(missingVehicles({ arrived: 5, expected: 3 })).toBe(0);
  });

  const alert = (id: string, createdAt: string, resolvedAt: string | null = null): FieldAlert => ({
    id,
    pseudo: "Léa",
    lat: null,
    lng: null,
    message: null,
    createdAt,
    resolvedAt,
  });

  it("alertes : en cours d'abord, la plus récente en tête", () => {
    const list = [
      alert("vieille", "2026-10-17T08:00:00Z"),
      alert("traitee", "2026-10-17T09:30:00Z", "2026-10-17T09:40:00Z"),
      alert("recente", "2026-10-17T09:00:00Z"),
    ];
    expect(sortAlerts(list).map((a) => a.id)).toEqual(["recente", "vieille", "traitee"]);
    expect(openAlerts(list).map((a) => a.id)).toEqual(["recente", "vieille"]);
  });

  it("le canal temps réel ajoute une alerte (une seule fois) et la clôt", () => {
    const start = [alert("a1", "2026-10-17T08:00:00Z")];
    const added = applyAlertEvent(
      start,
      "alert",
      { id: "a2", pseudo: "Kenji", lat: 42.5, lng: 3.1, message: "Aide" },
      NOW,
    );
    expect(added.map((a) => a.id)).toEqual(["a2", "a1"]);
    expect(added[0]).toMatchObject({ pseudo: "Kenji", lat: 42.5, lng: 3.1, message: "Aide", resolvedAt: null });
    expect(applyAlertEvent(added, "alert", { id: "a2" }, NOW)).toHaveLength(2);
    const resolved = applyAlertEvent(added, "alert.resolved", { id: "a1" }, NOW);
    expect(resolved.find((a) => a.id === "a1")?.resolvedAt).toBe(NOW.toISOString());
    expect(applyAlertEvent(added, "live", {}, NOW)).toEqual(added);
    expect(applyAlertEvent(added, "alert", null, NOW)).toEqual(added);
  });

  it("lien de carte et rapport des scans", () => {
    expect(mapUrl(42.5, 3.12345678)).toContain("mlat=42.50000&mlon=3.12346");
    const report = {
      totals: { scans: 40, duplicates: 3, rejected: 2 },
      byDevice: [
        { deviceId: "a", scans: 30 },
        { deviceId: "b", scans: 10 },
        { deviceId: "c", scans: 0 },
      ],
    } as ScanReport;
    expect(scanSummary(report)).toEqual({ scans: 40, duplicates: 3, rejected: 2, devices: 2 });
  });
});

describe("staff", () => {
  const member = (over: Partial<EventStaffMember>): EventStaffMember => ({
    userId: "u",
    pseudo: "x",
    roles: ["scan"],
    rolesOverride: null,
    canDecide: false,
    presence: "unknown",
    presenceUpdatedAt: null,
    reminderCount: 0,
    lastRemindedAt: null,
    syncedAt: null,
    ...over,
  });

  it("présents, absents, sans réponse, jamais répondu (relancé sans effet)", () => {
    const s = staffSummary([
      member({ presence: "present" }),
      member({ presence: "absent" }),
      member({ presence: "unknown" }),
      member({ presence: "unknown", reminderCount: 2 }),
    ]);
    expect(s).toEqual({ present: 1, absent: 1, unknown: 2, neverAnswered: 1, total: 4 });
  });

  it("« Relancer » : sans réponse, avant le jour J, au plus une fois par heure", () => {
    const future = "2026-10-25T08:00:00Z";
    expect(canRemind(member({}), future, NOW)).toBe(true);
    expect(canRemind(member({ presence: "present" }), future, NOW)).toBe(false);
    expect(canRemind(member({}), "2026-10-17T14:00:00Z", NOW)).toBe(false); // jour J
    expect(canRemind(member({}), "2026-10-16T08:00:00Z", NOW)).toBe(false); // déjà commencé
    expect(canRemind(member({ lastRemindedAt: "2026-10-17T09:30:00Z" }), future, NOW)).toBe(false);
    expect(canRemind(member({ lastRemindedAt: "2026-10-17T08:30:00Z" }), future, NOW)).toBe(true);
  });

  it("rôles : coche et décoche dans l'ordre de la liste complète", () => {
    const all = ["scan", "control", "placement", "super_staff"] as const;
    expect(toggleRole(["control"], "scan", all)).toEqual(["scan", "control"]);
    expect(toggleRole(["scan", "control"], "scan", all)).toEqual(["control"]);
    expect(rolesChanged(["scan"], ["scan"])).toBe(false);
    expect(rolesChanged(["scan", "control"], ["control", "scan"])).toBe(false);
    expect(rolesChanged(["scan"], ["control"])).toBe(true);
  });

  it("demandes de staff : seulement les membres « requested »", () => {
    const m = (status: StructureMember["status"]) => ({ userId: status, status }) as StructureMember;
    expect(staffRequests([m("active"), m("requested"), m("invited")]).map((x) => x.userId)).toEqual(["requested"]);
  });
});

describe("Boîte et accès", () => {
  it("segments proposables selon l'événement choisi", () => {
    expect(availableSegments(false)).toEqual(["staff", "followers"]);
    expect(availableSegments(true)).toHaveLength(7);
  });

  it("message groupé : ce qui manque avant l'envoi", () => {
    expect(groupMessageIssue({ segment: null, eventId: null, body: "x" })).toMatch(/destinataires/);
    expect(groupMessageIssue({ segment: "accepted", eventId: null, body: "x" })).toMatch(/événement/);
    expect(groupMessageIssue({ segment: "accepted", eventId: "e", body: "  " })).toMatch(/message/);
    expect(groupMessageIssue({ segment: "followers", eventId: null, body: "Salut" })).toBeNull();
  });

  it("double authentification : activer ou se reconnecter, selon l'indice de l'API", () => {
    expect(gateKind("setup")).toBe("setup");
    expect(gateKind("totp_sign_in")).toBe("signIn");
    expect(gateKind("passkey_sign_in")).toBe("signIn");
    expect(gateKind(null)).toBe("signIn");
    expect(isTwoFactorError({ code: "two_factor_required" })).toBe(true);
    expect(isTwoFactorError({ code: "forbidden" })).toBe(false);
    expect(isTwoFactorError(null)).toBe(false);
  });
});
