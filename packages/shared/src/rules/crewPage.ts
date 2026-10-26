import { fromWallTime, HOUR, wallTime } from "./time";

// Page du crew (lot R5c2, maquettes R5.7 à R5.9, validées par Damien le 26/10) : sorties du crew, droits de les proposer,
// Instagram du crew. Règles pures : l'API les applique, l'appli et le site affichent le résultat.

/** Réponse d'un membre à une sortie du crew : « Je viens | Peut-être | Non ». */
export const crewOutingRsvps = ["yes", "maybe", "no"] as const;
export type CrewOutingRsvp = (typeof crewOutingRsvps)[number];

export const CREW_OUTING_TITLE_MIN = 3;
export const CREW_OUTING_TITLE_MAX = 40;
export const CREW_OUTING_PLACE_MIN = 3;
export const CREW_OUTING_PLACE_MAX = 120;
export const CREW_OUTING_PROGRAM_MAX = 500;
/** Sorties à venir par crew : au-delà, une sortie doit passer ou être annulée avant d'en proposer une autre. */
export const CREW_OUTINGS_UPCOMING_MAX = 20;
/** Une sortie se propose au plus un an à l'avance. */
export const CREW_OUTING_MAX_AHEAD_DAYS = 365;
/** Une sortie reste dans l'onglet Sorties jusqu'à 12 h après le rendez-vous (le jour même, on la retrouve). */
export const CREW_OUTING_VISIBLE_HOURS = 12;
/** Pseudo Instagram : lettres, chiffres, point, tiret bas ; 30 caractères au plus (règle d'Instagram). */
export const CREW_INSTAGRAM_MAX = 30;

/**
 * Décision de Damien (26/10) : le chef propose toujours une sortie ; un membre seulement si le créateur l'a permis dans
 * les réglages du crew (« Les membres peuvent proposer une sortie », oui par défaut).
 */
export function canProposeCrewOuting(input: { isLeader: boolean; membersCanPropose: boolean }): boolean {
  return input.isLeader || input.membersCanPropose;
}

/** Modifier ou annuler une sortie : son auteur ou le chef. */
export function canManageCrewOuting(input: { isAuthor: boolean; isLeader: boolean }): boolean {
  return input.isAuthor || input.isLeader;
}

/** Ce qui ne va pas dans la date d'une sortie : passée (ou maintenant), trop lointaine ; `null` si elle convient. */
export function crewOutingDateIssue(startsAt: Date, now: Date): "past" | "too_far" | null {
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= now.getTime()) return "past";
  if (startsAt.getTime() > now.getTime() + CREW_OUTING_MAX_AHEAD_DAYS * 24 * HOUR) return "too_far";
  return null;
}

/**
 * Tour 2 : le jour et l'heure tapés dans « Proposer une sortie » (« AAAA-MM-JJ », « HH:MM » ou « 9h30 »), à l'heure de
 * Paris, lus strictement : un jour qui n'existe pas (31 février) et une heure qui n'existe pas (passage à l'heure d'été,
 * 2 h 30 le dernier dimanche de mars) sont refusés, jamais décalés en silence.
 */
export function crewOutingWallInstant(
  day: string,
  time: string,
): { at: Date; issue: null } | { at: null; issue: "unreadable" | "no_such_day" | "no_such_hour" } {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  const h = /^(\d{1,2})[:h ]?(\d{2})$/.exec(time.trim());
  if (!d || !h) return { at: null, issue: "unreadable" };
  const [year, month, dayOfMonth, hour, minute] = [d[1], d[2], d[3], h[1], h[2]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return { at: null, issue: "unreadable" };
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (dayOfMonth < 1 || dayOfMonth > daysInMonth) return { at: null, issue: "no_such_day" };
  const at = fromWallTime({ year, month, day: dayOfMonth, hour, minute });
  const back = wallTime(at);
  const same =
    back.year === year &&
    back.month === month &&
    back.day === dayOfMonth &&
    back.hour === hour &&
    back.minute === minute;
  return same ? { at, issue: null } : { at: null, issue: "no_such_hour" };
}

/** La sortie est encore à afficher (à venir, ou commencée depuis moins de 12 h). */
export function crewOutingShown(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() > now.getTime() - CREW_OUTING_VISIBLE_HOURS * HOUR;
}

/**
 * Instagram du crew : on garde le pseudo seul (règle des comptes Instagram des prestataires). Accepte « pseudo »,
 * « @pseudo » ou l'adresse d'un compte (`instagram.com/pseudo`). Rend `null` pour un champ vide et `undefined` pour une
 * saisie qui n'est pas un compte (une publication, un autre site, des caractères interdits) : jamais une adresse libre.
 */
export function crewInstagramHandle(value: string | null | undefined): string | null | undefined {
  const v = value?.trim() ?? "";
  if (!v) return null;
  let handle = v;
  if (/^(https?:\/\/)?(www\.)?instagram\.com\//i.test(v)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    } catch {
      return undefined;
    }
    const host = url.hostname.toLowerCase();
    if (host !== "instagram.com" && host !== "www.instagram.com") return undefined;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return undefined;
    handle = parts[0] ?? "";
  } else if (/[/:]/.test(v)) {
    return undefined;
  }
  handle = handle.replace(/^@/, "");
  if (!/^[A-Za-z0-9_.]+$/.test(handle) || handle.length > CREW_INSTAGRAM_MAX) return undefined;
  // Chemins d'Instagram qui ne sont pas des comptes.
  if (["p", "reel", "reels", "explore", "stories", "accounts", "tv"].includes(handle.toLowerCase())) return undefined;
  return handle;
}

/** Adresse du compte Instagram d'un pseudo déjà validé. */
export function crewInstagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle}`;
}
