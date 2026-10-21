// Après l'événement et badge de structure (lot 27, ARCHITECTURE-SUITE § 11) : règles pures. L'API les applique ; le
// site et l'appli affichent le résultat sans le recalculer.
import { SEGMENT_REACH_AFTER_END_MS } from "./templates";
import { DAY, wallTime } from "./time";

// --- Bilan -------------------------------------------------------------------------------------------------------

/** Le bilan est régénéré une fois, à J+8 : la fenêtre d'avis (J+7) est close (§ 11.1). */
export const REPORT_REFRESH_DELAY_MS = 8 * DAY;

export function reportRefreshAt(event: { endsAt: Date }): Date {
  return new Date(event.endsAt.getTime() + REPORT_REFRESH_DELAY_MS);
}

/** Nombre de lignes des listes « marques » et « départements » du bilan. */
export const REPORT_TOP_N = 10;

// --- Remerciement ------------------------------------------------------------------------------------------------

/**
 * Le remerciement part après la fin de l'événement et tant que les présents sont joignables par un message groupé
 * (J+7, la même fenêtre que les avis). Rend la raison du refus, ou `null` si l'envoi est possible.
 */
export function thanksBlockedReason(
  event: { endsAt: Date; status: string },
  now: Date,
  alreadySent: boolean,
): "sent" | "not_published" | "not_ended" | "too_late" | null {
  if (alreadySent) return "sent";
  if (event.status !== "published") return "not_published";
  if (now < event.endsAt) return "not_ended";
  if (event.endsAt.getTime() + SEGMENT_REACH_AFTER_END_MS < now.getTime()) return "too_late";
  return null;
}

/** Lien d'avis d'un présent : unique par candidature (le site redirige vers la feuille d'avis de l'appli). */
export function reviewLink(baseUrl: string, applicationId: string): string {
  return `${baseUrl}/app/sorties?avis=${applicationId}`;
}

/** Lien profond de l'appli (même paramètre). */
export function reviewDeepLink(applicationId: string): string {
  return `orasso://acces?avis=${applicationId}`;
}

/** Texte de remerciement quand l'organisateur n'a choisi aucun modèle et que la base n'en a pas (garde). */
export const THANKS_FALLBACK_BODY =
  "Merci {{pseudo}} d'être venu à {{event.title}} ! Ton avis nous aide à faire mieux la prochaine fois : {{review_link}}\n\n{{structure.name}}";

/** Un remerciement porte toujours le lien d'avis, même si le texte choisi l'a oublié. */
export function ensureReviewLink(body: string): string {
  return /\{\{\s*review_link\s*\}\}/.test(body) ? body : `${body.trimEnd()}\n\nLaisse ton avis : {{review_link}}`;
}

// --- Export et coordonnées ---------------------------------------------------------------------------------------

export const EXPORT_REASON_MIN = 10;
export const EXPORT_REASON_MAX = 300;

/** Au-delà de J+7, ouvrir la fiche d'un participant (coordonnées) est tracé, une fois par fiche et par jour (§ 11.3). */
export const CONTACT_VIEW_AFTER_MS = 7 * DAY;

export function contactViewTraced(event: { endsAt: Date }, now: Date): boolean {
  return now.getTime() > event.endsAt.getTime() + CONTACT_VIEW_AFTER_MS;
}

/** Nom du fichier exporté : `orasso-<slug>-participants-<date>.csv` (date locale AAAA-MM-JJ). */
export function exportFileName(slug: string, date: string): string {
  return `orasso-${slug.replace(/[^a-z0-9-]/gi, "-")}-participants-${date}.csv`;
}

/**
 * Cellule CSV sûre : séparateur `;`, guillemets doublés, retours à la ligne entre guillemets. Un texte qui commence par
 * `=`, `+`, `-`, `@`, une tabulation ou un retour chariot serait pris pour une formule par un tableur : on le fait
 * précéder d'une apostrophe (injection de formule). Les nombres, produits par nous, ne sont pas modifiés.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  // En tête, et aussi après un `,` ou un `;` à l'intérieur de la cellule (certains tableurs coupent sur ces signes).
  const lead = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const text = lead.replace(/([,;])(?=[=+\-@\t\r])/g, "$1'");
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const CSV_BOM = "﻿";

export function csvLine(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(";");
}

// --- Notes internes ----------------------------------------------------------------------------------------------

export const STRUCTURE_NOTE_MAX = 500;
/** Notes actives sur une même personne, par structure (garde contre le détournement en journal de harcèlement). */
export const STRUCTURE_NOTES_PER_SUBJECT = 30;

// --- Badge de structure ------------------------------------------------------------------------------------------

/** Rappels : un mois, une semaine, la veille (docs/01). */
export const BADGE_REMINDER_DAYS = [30, 7, 1] as const;
export type BadgeReminderDay = (typeof BADGE_REMINDER_DAYS)[number];
/** Rappels déjà envoyés : `{"30": "<ISO>", "7": …}`. */
export type BadgeReminders = Partial<Record<`${BadgeReminderDay}`, string>>;

/** Délai de grâce quand l'équipe lève une suspension sans renouveler : le badge repart pour 30 jours. */
export const BADGE_GRACE_DAYS = 30;

const calendarDay = (d: Date) => {
  const w = wallTime(d);
  return Date.UTC(w.year, w.month - 1, w.day) / DAY;
};

/** Jours calendaires (heure de Paris) avant le jour de l'échéance : 0 = le jour même, ou déjà passée. */
export function badgeDaysLeft(expiresAt: Date, now: Date): number {
  return Math.max(0, calendarDay(expiresAt) - calendarDay(now));
}

export type BadgePlan =
  | { action: "none" }
  | { action: "remind"; day: BadgeReminderDay; mark: BadgeReminderDay[]; overdue?: boolean }
  | { action: "suspend" };

/**
 * Ce que la tâche quotidienne fait d'un badge : rien ; un rappel (le plus urgent des paliers franchis et pas encore
 * envoyés, tous marqués pour qu'une tâche manquée n'envoie pas trois e-mails d'un coup) ; la suspension, une fois
 * l'échéance passée. Jours calendaires de Paris : « la veille » part la veille, jamais le jour même. Jamais de
 * suspension sans le rappel de la veille : une structure déjà échue qui ne l'a pas reçu (tâche manquée, déploiement)
 * le reçoit d'abord (`overdue`) et n'est suspendue qu'au passage suivant. Idempotent.
 */
export function badgePlan(expiresAt: Date, now: Date, reminded: BadgeReminders): BadgePlan {
  if (expiresAt.getTime() <= now.getTime()) {
    if (reminded["1"]) return { action: "suspend" };
    return { action: "remind", day: 1, mark: [...BADGE_REMINDER_DAYS].filter((d) => !reminded[`${d}`]), overdue: true };
  }
  const left = badgeDaysLeft(expiresAt, now);
  // Le jour de l'échéance, le palier « la veille » est passé : il n'est plus envoyé.
  const crossed = BADGE_REMINDER_DAYS.filter((d) => left <= d && !(d === 1 && left === 0));
  const pending = crossed.filter((d) => !reminded[`${d}`]);
  if (!pending.length) return { action: "none" };
  const urgent = Math.min(...pending) as BadgeReminderDay;
  return { action: "remind", day: urgent, mark: pending };
}

/** Un renouvellement ajoute un an à partir de la plus tardive des deux dates (échéance, maintenant). */
export function renewedBadgeExpiry(current: Date | null, now: Date): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  const next = new Date(base.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

/** Échéance après la levée d'une suspension sans renouvellement : au moins `BADGE_GRACE_DAYS` jours devant nous. */
export function gracedBadgeExpiry(current: Date | null, now: Date): Date {
  const floor = new Date(now.getTime() + BADGE_GRACE_DAYS * DAY);
  return current && current.getTime() > floor.getTime() ? current : floor;
}
