import type { StoryPersona } from "./audience";
import { addDays, fromWallTime, wallTime } from "./time";

// Rattachement d'une publication à un événement (vague R8, lot R8a1, ARCHITECTURE-R8 § 2.3) : le rôle est **déduit des
// droits** au moment de publier, jamais reçu du client. Règles pures : `now` est toujours passé.

/** Rôle d'un rattachement : organisateur (« pour le »), sur place (« présent au »), passionné (« sera au », « était au »). */
export const feedEventRoles = ["organizer", "on_site", "attendee"] as const;
export type FeedEventRole = (typeof feedEventRoles)[number];

/** Motif obligatoire d'une « Info importante ». */
export const importantReasons = ["schedule", "access", "safety", "weather", "other"] as const;
export type ImportantReason = (typeof importantReasons)[number];

/** Avant, pendant ou après l'événement. */
export type FeedAttachPhase = "before" | "running" | "after";

/** Fenêtre après la fin d'un événement pendant laquelle on peut encore s'y rattacher (jours). */
export const ATTACH_AFTER_DAYS = 30;
/** Plafond d'une « Info importante » : par jour et par semaine, par événement (jour et semaine civils de Paris, lundi). */
export const IMPORTANT_PER_DAY = 1;
export const IMPORTANT_PER_WEEK = 3;
/** Longueur de la légende : passionné / casquette. */
export const FEED_CAPTION_PERSONA_MAX = 2000;
/** Longueur du lieu libre d'une publication hors événement. */
export const FEED_PLACE_LABEL_MAX = 80;
/** Nombre d'événements rattachables rendus au plus. */
export const ATTACHABLE_EVENTS_MAX = 50;

export type AttachableWindowEvent = { startsAt: Date; endsAt: Date; status: string };

// --- Règles pures ---------------------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** Avant, pendant ou après l'événement (`endsAt` exclu : à l'heure de fin, c'est fini). */
export function attachPhase(e: { startsAt: Date; endsAt: Date }, now: Date): FeedAttachPhase {
  if (now.getTime() < e.startsAt.getTime()) return "before";
  if (now.getTime() < e.endsAt.getTime()) return "running";
  return "after";
}

/** À venir, en cours, ou fini depuis 30 jours au plus (borne comprise). */
export function withinAttachWindow(e: { endsAt: Date }, now: Date): boolean {
  return now.getTime() - e.endsAt.getTime() <= ATTACH_AFTER_DAYS * DAY_MS;
}

/** Ce que l'API sait de la personne et de l'événement ; chaque champ est un fait lu en base, jamais reçu du client. */
export type AttachFacts = {
  /** Événement de la structure au nom de laquelle on publie. */
  ownsEvent: boolean;
  /** Candidature `provider` / `media` retenue (`accepted`) à cet événement. */
  pageAccepted: boolean;
  /** Candidature véhicule `accepted` ou `pending`. */
  vehicleActive: boolean;
  /** Billet `valid`. */
  ticketValid: boolean;
  /** Présence validée (pointage, billet contrôlé, présence GPS). */
  presenceValidated: boolean;
};

export type AttachEventFacts = { status: string; startsAt: Date; endsAt: Date };

/**
 * Le rôle d'un rattachement, **déduit** des droits (jamais reçu) ; `null` : non rattachable avec un verbe.
 * - organisateur : événement publié ou annulé de **sa** structure, dans la fenêtre → `organizer` ;
 * - prestataire, média : sa candidature retenue, même fenêtre → `on_site` ; fiche pro : jamais (T2) ;
 * - passionné : à venir ou en cours avec une candidature véhicule `accepted` / `pending` ou un billet `valid`, ou fini
 *   depuis 30 jours au plus avec présence validée → `attendee`.
 */
export function deduceEventRole(
  persona: StoryPersona,
  event: AttachEventFacts,
  facts: AttachFacts,
  now: Date,
): FeedEventRole | null {
  if (persona === "pro") return null;
  const inWindow = withinAttachWindow(event, now);
  const published = event.status === "published";
  const live = published || event.status === "cancelled";
  if (persona === "organizer") return facts.ownsEvent && live && inWindow ? "organizer" : null;
  if (persona === "provider" || persona === "media") return facts.pageAccepted && live && inWindow ? "on_site" : null;
  if (!published || !inWindow) return null;
  if (attachPhase(event, now) !== "after") return facts.vehicleActive || facts.ticketValid ? "attendee" : null;
  return facts.presenceValidated ? "attendee" : null;
}

/** Le verbe affiché : passionné après la fin sans présence validée → pas de verbe (le rôle devient nul à la lecture). */
export function displayRole(
  stored: FeedEventRole | null,
  phase: FeedAttachPhase,
  presenceValidated: boolean,
): FeedEventRole | null {
  if (stored === "attendee" && phase === "after" && !presenceValidated) return null;
  return stored;
}

export type ImportantWindow = { dayStart: Date; dayEnd: Date; weekStart: Date; weekEnd: Date };

/** Jour et semaine civils de Paris (la semaine commence le lundi) qui contiennent `now` (T9). */
export function importantWindow(now: Date): ImportantWindow {
  const w = wallTime(now);
  const day = { year: w.year, month: w.month, day: w.day, hour: 0, minute: 0 };
  // Jour de la semaine du jour de Paris (0 = dimanche) : calcul sur la date civile, sans fuseau.
  const weekday = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  const sinceMonday = (weekday + 6) % 7;
  const monday = addDays(day, -sinceMonday);
  return {
    dayStart: fromWallTime(day),
    dayEnd: fromWallTime(addDays(day, 1)),
    weekStart: fromWallTime(monday),
    weekEnd: fromWallTime(addDays(monday, 7)),
  };
}

/** Ce qu'il reste d'« Info importante » pour un événement, d'après ce qui a déjà été publié (supprimées comprises). */
export function importantLeft(usedToday: number, usedWeek: number): { leftToday: number; leftWeek: number } {
  const leftWeek = Math.max(0, IMPORTANT_PER_WEEK - usedWeek);
  return { leftToday: Math.min(Math.max(0, IMPORTANT_PER_DAY - usedToday), leftWeek), leftWeek };
}
