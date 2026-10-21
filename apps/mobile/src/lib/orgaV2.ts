// Casquette Organisateur, DA v2 (lot 52) : calculs purs des cinq onglets, sans React Native (testés dans
// `orgaV2.test.ts`). Aucune règle métier ici : elles sont dans l'API ; on choisit seulement quoi afficher.
import {
  type ApplicationForTriage,
  calendarDaysBetween,
  type EventNeedView,
  type EventOrganizer,
  type EventStaffMember,
  eventAddressProblem,
  eventCapacityProblem,
  eventDatesProblem,
  eventOpeningProblem,
  eventTicketLinkProblem,
  eventTitleProblem,
  eventVehiclesProblem,
  eventZonesProblem,
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
 * « affiche »… Vide quand rien ne manque ; une structure non vérifiée ne peut pas publier : « la vérification de ta structure ». Mêmes règles que l'assistant (`eventVehiclesProblem` et ses voisines).
 */
export function draftMissing(event: EventOrganizer, at: Date, structureVerified = true): string[] {
  const d = initialEventDraft(at, event);
  const out: string[] = [];
  if (eventTitleProblem(d)) out.push(M.title);
  if (eventDatesProblem(d)) out.push(M.dates);
  if (eventAddressProblem(d)) out.push(M.address);
  if (eventVehiclesProblem(d)) out.push(M.vehicles);
  if (eventCapacityProblem(d)) out.push(M.places);
  if (eventTicketLinkProblem(d)) out.push(M.link);
  if (eventOpeningProblem(d)) out.push(M.opening);
  if (eventZonesProblem(d)) out.push(M.zones);
  if (!event.posterUrl && !event.customPosterUrl) out.push(M.poster);
  // docs/01 : la publication est réservée aux structures vérifiées (l'API la refuse sinon).
  if (!structureVerified) out.push(M.verification);
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

export const BUBBLE_MIN = 36;
export const BUBBLE_MAX = 96;
/** Au-delà de ce nombre d'événements tenus, la bulle ne grandit plus. */
export const BUBBLE_FULL_AT = 20;

/** Taille d'une bulle (artefact `s-ostaff`, 36 à 96 px) : 36 px sans événement tenu, 96 px à vingt événements tenus ou plus. */
export function bubbleSize(eventsHeld: number): number {
  const n = Math.min(Math.max(Math.floor(eventsHeld), 0), BUBBLE_FULL_AT);
  return Math.round(BUBBLE_MIN + ((BUBBLE_MAX - BUBBLE_MIN) * n) / BUBBLE_FULL_AT);
}

/** Les neuf jetons d'avatar du socle (`avatar-1` à `avatar-9`, relevés de l'artefact), encre `avatar-ink` dessus. */
export const AVATAR_TOKENS = [
  "avatar1",
  "avatar2",
  "avatar3",
  "avatar4",
  "avatar5",
  "avatar6",
  "avatar7",
  "avatar8",
  "avatar9",
] as const;
export type AvatarToken = (typeof AVATAR_TOKENS)[number];

/** Le jeton d'avatar d'un membre : stable d'une ouverture à l'autre (dérivé de son identifiant). */
export function avatarToken(userId: string): AvatarToken {
  let h = 0;
  for (const ch of userId) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_TOKENS[h % AVATAR_TOKENS.length] ?? "avatar1";
}

/** Une bulle posée dans la grappe : centre (x, y) et diamètre, en points. */
export type PlacedBubble = { x: number; y: number; size: number };

/**
 * Grappe de bulles de l'artefact (`.bubbles` : carte de 310 px de haut, bulles posées librement, la bulle « +N » en bas à
 * droite à 92 % / 86 %). Pose les bulles de la plus grande à la plus petite au plus près du centre, sans chevauchement
 * (écart `gap`), dans la carte et hors de la place réservée à la bulle « +N ». Si tout ne tient pas, réduit les tailles et
 * recommence. Les tailles doivent être triées de la plus grande à la plus petite ; le résultat suit le même ordre.
 */
export function packBubbles(
  sizes: readonly number[],
  width: number,
  height: number,
  reserved: PlacedBubble | null,
  gap = 6,
): PlacedBubble[] {
  if (width <= 0 || height <= 0) return [];
  for (let scale = 1; scale > 0.3; scale -= 0.08) {
    const placed: PlacedBubble[] = [];
    let ok = true;
    for (const raw of sizes) {
      const size = Math.max(24, Math.round(raw * scale));
      const spot = findSpot(size, width, height, reserved ? [reserved, ...placed] : placed, gap);
      if (!spot) {
        ok = false;
        break;
      }
      placed.push(spot);
    }
    if (ok) return placed;
  }
  // Repli : une grille régulière de petites bulles (ne se produit qu'avec des dizaines de membres).
  const cell = Math.max(24, Math.floor(Math.sqrt((width * height) / Math.max(sizes.length, 1))));
  const perRow = Math.max(1, Math.floor(width / cell));
  return sizes.map((_, i) => ({
    x: (i % perRow) * cell + cell / 2,
    y: Math.floor(i / perRow) * cell + cell / 2,
    size: cell - gap,
  }));
}

function findSpot(
  size: number,
  width: number,
  height: number,
  others: readonly PlacedBubble[],
  gap: number,
): PlacedBubble | null {
  const r = size / 2;
  const pad = 8;
  const cx = width / 2;
  const cy = height * 0.44;
  // Spirale d'Archimède depuis le centre : la première place libre est la plus centrale.
  for (let step = 0; step < 1400; step += 1) {
    const angle = step * 0.35;
    const dist = step * 0.55;
    const x = cx + Math.cos(angle) * dist * (width / height);
    const y = cy + Math.sin(angle) * dist;
    if (x - r < pad || x + r > width - pad || y - r < pad || y + r > height - pad) {
      if (dist > Math.max(width, height)) break;
      continue;
    }
    if (others.every((o) => Math.hypot(o.x - x, o.y - y) >= r + o.size / 2 + gap)) return { x, y, size };
  }
  return null;
}

/**
 * Tailles affichées dans la grappe : les tailles d'engagement agrandies d'un même facteur pour que les bulles couvrent
 * environ 28 % de la carte, comme dans l'artefact (une petite équipe peu active ne doit pas tenir dans un coin). Les
 * écarts entre membres sont gardés ; aucune bulle ne dépasse 96 px.
 */
export function cloudSizes(sizes: readonly number[], width: number, height: number): number[] {
  const area = sizes.reduce((s, d) => s + (Math.PI * d * d) / 4, 0);
  if (area === 0 || width <= 0) return [...sizes];
  const scale = Math.min(2.2, Math.max(1, Math.sqrt((0.28 * width * height) / area)));
  return sizes.map((d) => Math.min(BUBBLE_MAX, Math.round(d * scale)));
}

/** La place de la bulle « +N » (demandes) ou « + » (inviter) : 56 px, en bas à droite de la grappe. */
export function requestBubbleSpot(width: number, height: number): PlacedBubble {
  return { x: width * 0.92 - 4, y: height * 0.86 - 4, size: 56 };
}

/** Le premier nom d'un pseudo, sous les initiales des grandes bulles (« Lucie_Pia » → « Lucie »). */
export function bubbleName(pseudo: string): string {
  return pseudo.split(/[_\s]/u)[0] ?? pseudo;
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
