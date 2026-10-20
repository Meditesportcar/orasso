// Casquette Organisateur, DA v2 (lot 52) : calculs purs des cinq onglets, sans React Native (testés dans
// `orgaV2.test.ts`). Aucune règle métier ici : elles sont dans l'API ; on choisit seulement quoi afficher.
import {
  type ApplicationForTriage,
  calendarDaysBetween,
  type EventNeedView,
  type EventOrganizer,
  type EventStaffMember,
  eventAddressProblem,
  eventDatesProblem,
  eventOpeningProblem,
  eventStepProblem,
  eventTitleProblem,
  fromWallTime,
  initialEventDraft,
  isEventDay,
  orgaV2Labels,
  type StaffRole,
  type TeamMemberHistory,
  wallTime,
} from "@orasso/shared";

import { dayCountdown, formatShortDate } from "./format";

const M = orgaV2Labels.missing;

// --- Événements -------------------------------------------------------------------------------------------------

/**
 * Ce qui manque à un brouillon avant de pouvoir le publier, dans l'ordre des étapes de l'assistant : « adresse »,
 * « affiche »… Vide quand rien ne manque. Mêmes règles que l'assistant (`eventStepProblem` et ses voisines).
 */
export function draftMissing(event: EventOrganizer, at: Date): string[] {
  const d = initialEventDraft(at, event);
  const out: string[] = [];
  if (eventTitleProblem(d)) out.push(M.title);
  if (eventDatesProblem(d)) out.push(M.dates);
  if (eventAddressProblem(d)) out.push(M.address);
  if (eventStepProblem("vehicules", d)) out.push(M.vehicles);
  if (eventStepProblem("places", d)) out.push(M.places);
  if (eventStepProblem("public", d)) out.push(M.link);
  if (eventOpeningProblem(d)) out.push(M.opening);
  if (eventStepProblem("zones", d)) out.push(M.zones);
  if (!event.posterUrl && !event.customPosterUrl) out.push(M.poster);
  return out;
}

/** « Publié · J-6 » dans les trente jours, sinon « Publié · 7 nov. » ; « Publié · en cours » le jour J. */
export function publishedStatus(startsAt: string, endsAt: string, at: Date): string {
  const t = at.getTime();
  if (Date.parse(startsAt) <= t && t < Date.parse(endsAt)) return orgaV2Labels.statusLive;
  const countdown = dayCountdown(startsAt, at);
  const days = Math.round((Date.parse(startsAt) - t) / 86_400_000);
  if (days > 30) return orgaV2Labels.statusPublishedOn(`${formatShortDate(startsAt)}.`);
  return orgaV2Labels.statusPublishedIn(countdown);
}

// --- Équipe -----------------------------------------------------------------------------------------------------

export const BUBBLE_MIN = 44;
export const BUBBLE_MAX = 88;
/** Au-delà de ce nombre d'événements tenus, la bulle ne grandit plus. */
export const BUBBLE_FULL_AT = 10;

/** Taille d'une bulle : 44 px sans événement tenu, 88 px à dix événements tenus ou plus (linéaire entre les deux). */
export function bubbleSize(eventsHeld: number): number {
  const n = Math.min(Math.max(Math.floor(eventsHeld), 0), BUBBLE_FULL_AT);
  return Math.round(BUBBLE_MIN + ((BUBBLE_MAX - BUBBLE_MIN) * n) / BUBBLE_FULL_AT);
}

/** Les initiales d'une bulle sans avatar : deux lettres du pseudo, en capitales. */
export function bubbleInitials(pseudo: string): string {
  // « Julie_66 » : le numéro de fin n'est pas un mot (comme « Pilote_001 »).
  const parts = pseudo
    .replace(/[^\p{L}\p{N}]*\d+$/u, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (parts.length === 0) return pseudo.slice(0, 2).toLocaleUpperCase("fr-FR");
  const letters = parts.length >= 2 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : (parts[0] ?? pseudo).slice(0, 2);
  return letters.toLocaleUpperCase("fr-FR");
}

/** Historique d'un membre, ou un historique vide s'il n'a rien tenu. */
export function historyOf(histories: readonly TeamMemberHistory[], userId: string): TeamMemberHistory {
  return histories.find((h) => h.userId === userId) ?? { userId, eventsHeld: 0, events: [] };
}

/** Les rôles des cartes « Rôles pour <événement> » du prototype : les quatre que l'on donne d'habitude. */
export const boardRoles: readonly StaffRole[] = ["scan", "placement", "shop", "filtering"];

const presenceOrder = { present: 0, unknown: 1, absent: 2 } as const;

/** Les membres d'un événement qui tiennent un rôle : les présences confirmées d'abord, puis sans réponse, les absents derniers. */
export function holdersOf(staff: readonly EventStaffMember[], role: StaffRole): EventStaffMember[] {
  return staff
    .filter((m) => m.roles.includes(role))
    .sort((a, b) => presenceOrder[a.presence] - presenceOrder[b.presence] || a.pseudo.localeCompare(b.pseudo, "fr"));
}

/** Rôles d'un membre pour l'événement avec ou sans `role` (ordre stable). */
export function withRole(current: readonly StaffRole[], role: StaffRole, give: boolean): StaffRole[] {
  const set = new Set(current);
  if (give) set.add(role);
  else set.delete(role);
  return (["scan", "shop", "placement", "control", "filtering", "super_staff"] as const).filter((r) => set.has(r));
}

/**
 * Prochaine relance automatique du staff qui n'a pas répondu : chaque jour à 10 h (Paris), jusqu'à la veille de
 * l'événement (arrêt le jour J). `null` quand il n'y a plus de relance à prévoir.
 */
export function nextReminder(at: Date, eventStartsAt: string): Date | null {
  const start = new Date(eventStartsAt);
  if (start.getTime() <= at.getTime()) return null;
  const w = wallTime(at);
  const today10 = fromWallTime({ ...w, hour: 10, minute: 0 });
  const next =
    today10.getTime() > at.getTime()
      ? today10
      : fromWallTime({ ...wallTime(new Date(today10.getTime() + 86_400_000)), hour: 10, minute: 0 });
  return isEventDay(start, next) || next.getTime() >= start.getTime() ? null : next;
}

/** « demain à 10 h » ou « aujourd'hui à 10 h » (la relance est quotidienne : la prochaine est aujourd'hui ou demain). */
export function reminderText(next: Date, at: Date): string {
  return `${calendarDaysBetween(at, next) <= 0 ? "aujourd'hui" : "demain"} à 10 h`;
}

// --- Tri : prestataires par mission -------------------------------------------------------------------------------

export type MissionGroup = {
  key: string;
  label: string;
  /** Places de la mission déjà prises, et demandées (`null` : candidatures sans mission précise). */
  filled: number | null;
  quantity: number | null;
  items: ApplicationForTriage[];
};

/** Candidatures de prestataires groupées par mission : « Food truck · 1 place sur 2 », puis celles sans mission. */
export function missionGroups(items: readonly ApplicationForTriage[], needs: readonly EventNeedView[]): MissionGroup[] {
  const groups: MissionGroup[] = [];
  for (const need of needs) {
    const mine = items.filter((i) => i.provider?.need?.id === need.id);
    groups.push({
      key: need.id,
      label: orgaV2Labels.missionPlaces(need.tradeLabel, need.filled, need.quantity),
      filled: need.filled,
      quantity: need.quantity,
      items: mine,
    });
  }
  const loose = items.filter((i) => !i.provider?.need || !needs.some((n) => n.id === i.provider?.need?.id));
  if (loose.length > 0) {
    groups.push({ key: "none", label: orgaV2Labels.missionFree, filled: null, quantity: null, items: loose });
  }
  return groups;
}
