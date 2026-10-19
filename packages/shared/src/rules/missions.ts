// Missions des prestataires (lot 46, ARCHITECTURE-DA-V2 § 5.2, V10) : places restantes d'un besoin, avis d'un
// organisateur sur un prestataire, tri des missions par distance. Règles pures, testées.
import { DAY, wallTime } from "./time";

/** « 16 h », « 16 h 30 » (heure de Paris) : arrivée d'un prestataire (`s-pcand` : « arrivée 16 h »). */
export function arrivalHourLabel(date: Date): string {
  const w = wallTime(date);
  return w.minute ? `${w.hour} h ${String(w.minute).padStart(2, "0")}` : `${w.hour} h`;
}

/** Avis d'un organisateur sur un prestataire : note entière de 1 à 5 (V10). */
export const PROVIDER_REVIEW_MIN_RATING = 1;
export const PROVIDER_REVIEW_MAX_RATING = 5;
/** Avis possible pendant 30 jours après la fin de l'événement (V10). */
export const PROVIDER_REVIEW_WINDOW_MS = 30 * DAY;
/** Avis montrés sur la vitrine : les 3 derniers. */
export const PROVIDER_REVIEW_LATEST = 3;

/** Places encore à pourvoir pour un besoin (`accepted` = candidatures retenues rattachées au besoin). */
export function needRemaining(need: { quantity: number }, accepted: number): number {
  return Math.max(0, need.quantity - accepted);
}

export type ProviderReviewIssue = "not_accepted" | "event_cancelled" | "not_ended" | "window_closed";

/**
 * Pourquoi un organisateur ne peut pas (encore) laisser d'avis sur ce prestataire, ou `null` s'il le peut :
 * candidature de prestataire retenue, événement publié et terminé, au plus 30 jours après sa fin (bornes comprises).
 * Le rôle de l'auteur (propriétaire ou co-organisateur) et le doublon sont vérifiés par l'API.
 */
export function providerReviewIssue(
  application: { kind: string; status: string },
  event: { endsAt: Date; status: string },
  now: Date,
): ProviderReviewIssue | null {
  if (application.kind !== "provider" || application.status !== "accepted") return "not_accepted";
  if (event.status !== "published") return "event_cancelled";
  if (now < event.endsAt) return "not_ended";
  if (now.getTime() > event.endsAt.getTime() + PROVIDER_REVIEW_WINDOW_MS) return "window_closed";
  return null;
}

export function canReviewProvider(
  application: { kind: string; status: string },
  event: { endsAt: Date; status: string },
  now: Date,
): boolean {
  return providerReviewIssue(application, event, now) === null;
}

/** Moyenne des avis arrondie au dixième (« 4,9 sur 5 »), `null` sans avis. */
export function providerReviewAverage(ratings: readonly number[]): number | null {
  if (!ratings.length) return null;
  return Math.round((ratings.reduce((a, r) => a + r, 0) / ratings.length) * 10) / 10;
}

/**
 * Missions du plus proche au plus loin (`s-missions`) ; à distance égale, la plus tôt d'abord ; une mission sans
 * distance connue passe en dernier. Ne modifie pas la liste reçue.
 */
export function missionDistanceSort<T extends { distanceKm: number | null; startsAt: string | Date }>(
  missions: readonly T[],
): T[] {
  const time = (d: string | Date) => (typeof d === "string" ? Date.parse(d) : d.getTime());
  return [...missions].sort((a, b) => {
    if (a.distanceKm === null || b.distanceKm === null) {
      if (a.distanceKm !== b.distanceKm) return a.distanceKm === null ? 1 : -1;
      return time(a.startsAt) - time(b.startsAt);
    }
    const d = a.distanceKm - b.distanceKm;
    return d !== 0 ? d : time(a.startsAt) - time(b.startsAt);
  });
}
