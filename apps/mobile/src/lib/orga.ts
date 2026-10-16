// Casquette Organisateur (lot 22) : calculs purs des écrans Direct, Événements, Boîte et Staff, sans React Native
// (testés dans `orga.test.ts`). Aucune règle métier ici : elles sont dans l'API ; on choisit seulement quoi afficher.
import {
  type EventCard,
  type EventCounters,
  type EventOutlook,
  type EventStaffMember,
  isEventDay,
  type LiveCounters,
  type Me,
  type MessageSegment,
  messageSegments,
  type ScanReport,
  type StaffRole,
  type StructureMember,
  segmentNeedsEvent,
} from "@orasso/shared";

import type { FieldAlert } from "./api/orga";

// --- Événements -------------------------------------------------------------------------------------------------

export type EventGroups = {
  drafts: EventCard[];
  upcoming: EventCard[];
  past: EventCard[];
  cancelled: EventCard[];
};

const byStart = (a: EventCard, b: EventCard) => Date.parse(a.startsAt) - Date.parse(b.startsAt);

/**
 * Événements de la structure rangés par statut : brouillons, publiés à venir (ou en cours), passés (publiés et
 * terminés, le plus récent d'abord), annulés (le plus récent d'abord).
 */
export function groupEvents(events: readonly EventCard[], at: Date): EventGroups {
  const t = at.getTime();
  const drafts = events.filter((e) => e.status === "draft").sort(byStart);
  const published = events.filter((e) => e.status === "published");
  return {
    drafts,
    upcoming: published.filter((e) => Date.parse(e.endsAt) > t).sort(byStart),
    past: published.filter((e) => Date.parse(e.endsAt) <= t).sort((a, b) => byStart(b, a)),
    cancelled: events.filter((e) => e.status === "cancelled").sort((a, b) => byStart(b, a)),
  };
}

export type CurrentPhase = "live" | "today" | "next";
export type CurrentEvent = { event: EventCard; phase: CurrentPhase };

/**
 * L'événement que le Direct suit : celui qui a lieu en ce moment, sinon celui du jour (même jour à Paris, même fini : le
 * bilan de la journée reste lisible), sinon le prochain publié. Rien si aucun événement publié n'est devant nous.
 */
export function pickCurrentEvent(events: readonly EventCard[], at: Date): CurrentEvent | null {
  const t = at.getTime();
  const published = events.filter((e) => e.status === "published").sort(byStart);
  const live = published.find((e) => Date.parse(e.startsAt) <= t && t < Date.parse(e.endsAt));
  if (live) return { event: live, phase: "live" };
  const today = published.find((e) => isEventDay(new Date(e.startsAt), at));
  if (today) return { event: today, phase: "today" };
  const next = published.find((e) => Date.parse(e.startsAt) > t);
  return next ? { event: next, phase: "next" } : null;
}

/** Le statut qui sera demandé à l'API quand on bascule (Maintenu ↔ Incertain). */
export const otherOutlook = (current: EventOutlook): EventOutlook =>
  current === "maintained" ? "uncertain" : "maintained";

/** L'annulation demande de retaper le mot (confirmation forte), sans tenir compte de la casse ni des espaces. */
export const cancelConfirmed = (typed: string, word: string): boolean =>
  typed.trim().toLocaleUpperCase("fr-FR") === word.toLocaleUpperCase("fr-FR");

/** Places restantes en clair (`null` = sans limite). */
export const remainingText = (c: Pick<EventCounters, "remaining">, unlimited: string): string =>
  c.remaining === null ? unlimited : String(c.remaining);

// --- Direct -----------------------------------------------------------------------------------------------------

export type CategoryRow = { key: string; label: string; arrived: number; expected: number; missing: number };

/** Arrivés / attendus par catégorie (les catégories vides sont masquées). */
export function categoryRows(live: Pick<LiveCounters, "byCategory">): CategoryRow[] {
  return live.byCategory
    .filter((c) => c.expected > 0 || c.arrived > 0)
    .map((c) => ({
      key: c.categoryId,
      label: c.label,
      arrived: c.arrived,
      expected: c.expected,
      missing: Math.max(c.expected - c.arrived, 0),
    }));
}

/** Véhicules pas encore arrivés (jamais négatif : un entré sans réservation compte comme arrivé). */
export const missingVehicles = (live: Pick<LiveCounters, "arrived" | "expected">): number =>
  Math.max(live.expected - live.arrived, 0);

/** Alertes non traitées d'abord (la plus récente en tête), puis les traitées. */
export function sortAlerts(alerts: readonly FieldAlert[]): FieldAlert[] {
  return [...alerts].sort((a, b) => {
    const ra = a.resolvedAt ? 1 : 0;
    const rb = b.resolvedAt ? 1 : 0;
    return ra - rb || Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

export const openAlerts = (alerts: readonly FieldAlert[]): FieldAlert[] =>
  sortAlerts(alerts).filter((a) => !a.resolvedAt);

/** Lien d'une carte pour une position d'alerte (OpenStreetMap, comme le reste d'Orasso). */
export function mapUrl(lat: number, lng: number): string {
  const la = lat.toFixed(5);
  const lo = lng.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=18/${la}/${lo}`;
}

/**
 * Effet d'un message du canal `event:{id}:live` sur la liste d'alertes : l'alerte arrive avec son auteur et sa position,
 * le traitement d'une alerte la clôt ; tout autre message (compteurs, incident) ne change pas la liste.
 */
export function applyAlertEvent(alerts: readonly FieldAlert[], type: string, payload: unknown, at: Date): FieldAlert[] {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (type === "alert" && typeof p.id === "string") {
    if (alerts.some((a) => a.id === p.id)) return [...alerts];
    const next: FieldAlert = {
      id: p.id,
      pseudo: typeof p.pseudo === "string" ? p.pseudo : null,
      lat: typeof p.lat === "number" ? p.lat : null,
      lng: typeof p.lng === "number" ? p.lng : null,
      message: typeof p.message === "string" ? p.message : null,
      createdAt: at.toISOString(),
      resolvedAt: null,
    };
    return sortAlerts([next, ...alerts]);
  }
  if (type === "alert.resolved" && typeof p.id === "string") {
    return alerts.map((a) => (a.id === p.id && !a.resolvedAt ? { ...a, resolvedAt: at.toISOString() } : a));
  }
  return [...alerts];
}

/** Le rapport des scans en trois chiffres (totaux, doublons, refusés) et le nombre d'appareils qui ont scanné. */
export function scanSummary(report: ScanReport) {
  return {
    scans: report.totals.scans,
    duplicates: report.totals.duplicates,
    rejected: report.totals.rejected,
    devices: report.byDevice.filter((d) => d.scans > 0).length,
  };
}

// --- Staff ------------------------------------------------------------------------------------------------------

export function staffSummary(members: readonly EventStaffMember[]) {
  const count = (presence: EventStaffMember["presence"]) => members.filter((m) => m.presence === presence).length;
  return {
    present: count("present"),
    absent: count("absent"),
    unknown: count("unknown"),
    // Relancé au moins une fois et toujours sans réponse : « jamais répondu ».
    neverAnswered: members.filter((m) => m.presence === "unknown" && m.reminderCount > 0).length,
    total: members.length,
  };
}

const REMIND_GAP_MS = 60 * 60 * 1000;

/** Le bouton « Relancer » : sans réponse, pas le jour J, pas relancé depuis moins d'une heure (l'API le refuse aussi). */
export function canRemind(member: EventStaffMember, eventStartsAt: string, at: Date): boolean {
  if (member.presence !== "unknown") return false;
  if (isEventDay(new Date(eventStartsAt), at) || Date.parse(eventStartsAt) <= at.getTime()) return false;
  return !member.lastRemindedAt || at.getTime() - Date.parse(member.lastRemindedAt) >= REMIND_GAP_MS;
}

/** Rôles d'événement après avoir coché ou décoché un rôle (ordre stable : celui de la liste complète). */
export function toggleRole(current: readonly StaffRole[], role: StaffRole, all: readonly StaffRole[]): StaffRole[] {
  const set = new Set(current);
  if (set.has(role)) set.delete(role);
  else set.add(role);
  return all.filter((r) => set.has(r));
}

/** Les rôles de l'événement diffèrent-ils de ceux de la structure ? (le bouton « Enregistrer » n'apparaît que alors) */
export function rolesChanged(next: readonly StaffRole[], saved: readonly StaffRole[]): boolean {
  return next.length !== saved.length || next.some((r) => !saved.includes(r));
}

export const staffRequests = (members: readonly StructureMember[]): StructureMember[] =>
  members.filter((m) => m.status === "requested");

// --- Boîte ------------------------------------------------------------------------------------------------------

/** Segments proposables : sans événement choisi, seulement ceux qui n'en demandent pas (staff, abonnés). */
export function availableSegments(hasEvent: boolean): MessageSegment[] {
  return messageSegments.filter((s) => hasEvent || !segmentNeedsEvent(s));
}

/** Pourquoi le message groupé ne peut pas partir encore (`null` = on peut envoyer). */
export function groupMessageIssue(input: {
  segment: MessageSegment | null;
  eventId: string | null;
  body: string;
}): string | null {
  if (!input.segment) return "Choisis les destinataires.";
  if (segmentNeedsEvent(input.segment) && !input.eventId) return "Choisis un événement pour ce segment.";
  if (input.body.trim() === "") return "Écris le message.";
  return null;
}

// --- Accès ------------------------------------------------------------------------------------------------------

export type GateKind = "setup" | "signIn";

/**
 * Que proposer quand la double authentification manque : l'activer (aucun second facteur), ou se reconnecter avec son
 * code ou sa clé d'accès (la session ne l'a pas prouvée). Sans indice de l'API, c'est la reconnexion.
 */
export const gateKind = (hint: Me["twoFactorHint"] | undefined): GateKind => (hint === "setup" ? "setup" : "signIn");

/** L'erreur d'API est-elle un refus pour double authentification ? (forme structurelle : testable sans le client HTTP) */
export const isTwoFactorError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "two_factor_required";

// --- Pages du site -----------------------------------------------------------------------------------------------

/** Le slug de la structure active (les pages du site s'adressent par slug). */
export function structureSlugOf(
  memberships: readonly { structureId: string; structureSlug: string }[] | undefined,
  structureId: string,
): string | null {
  return memberships?.find((m) => m.structureId === structureId)?.structureSlug ?? null;
}

/** Chemin d'une page de l'espace organisateur du site (`/orga/<slug>/…`). */
export const orgaSitePath = (slug: string, tail = ""): string => `/orga/${slug}${tail}`;
