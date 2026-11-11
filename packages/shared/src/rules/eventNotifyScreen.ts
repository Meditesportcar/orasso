// Notifications d'un événement, écrans (vague R8, lot R8n2) : règles pures (`now` passé), partagées par l'appli et le site.
// Les règles de livraison sont celles de R8n1 (`eventNotifications.ts`, `quietHours.ts`) : rien n'est recopié ici.
import { eventNotifyLabels } from "../labels/eventNotifications.fr";
import { ESSENTIAL_URGENT_WITHIN_MS } from "./eventNotifications";
import { isQuietHour, urgentWithin } from "./quietHours";

/** Ce qui, dans un événement publié, prévient ses inscrits (les mêmes champs que l'API : début, fin, adresse). */
export type NotifyFields = {
  startsAt: string | number | Date | null;
  endsAt: string | number | Date | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
};

const instant = (v: string | number | Date | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const ms = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
};
const text = (v: string | null | undefined) => (v ?? "").trim();

/**
 * Le changement prévient-il les inscrits ? Vrai si le début, la fin ou l'adresse (ligne, code postal, ville, position)
 * diffèrent ; le titre, la description, le prix… ne préviennent personne (l'API est la seule à décider, ceci l'annonce).
 */
export function notifyChanged(before: NotifyFields, after: NotifyFields): boolean {
  if (instant(before.startsAt) !== instant(after.startsAt)) return true;
  if (instant(before.endsAt) !== instant(after.endsAt)) return true;
  if (text(before.addressLine) !== text(after.addressLine)) return true;
  if (text(before.postalCode) !== text(after.postalCode)) return true;
  if (text(before.city) !== text(after.city)) return true;
  return (before.lat ?? null) !== (after.lat ?? null) || (before.lng ?? null) !== (after.lng ?? null);
}

/** Le plus tôt des deux débuts : un départ repoussé ne retarde pas le message (comme l'API). `null` si aucun n'est lisible. */
export function notifyStart(
  before: string | number | Date | null,
  after: string | number | Date | null,
): number | null {
  const a = instant(before);
  const b = instant(after);
  return a === null ? b : b === null ? a : Math.min(a, b);
}

export type NotifyTiming = "now" | "at_8";

/**
 * Quand part le message : tout de suite hors des heures calmes (22 h – 8 h, Paris) ; la nuit, tout de suite si
 * l'événement commence dans 12 h au plus (ou a commencé), sinon à 8 h. `startsAt` : voir `notifyStart`.
 */
export function notifyTiming(input: { now: Date; startsAt: string | number | Date | null }): NotifyTiming {
  if (!isQuietHour(input.now)) return "now";
  const starts = instant(input.startsAt);
  return starts !== null && urgentWithin(new Date(starts), input.now, ESSENTIAL_URGENT_WITHIN_MS) ? "now" : "at_8";
}

/** Ce que la confirmation de l'organisateur dit du moment : rien de plus dans la journée, une phrase la nuit. */
export function notifyTimingLine(timing: NotifyTiming, input: { now: Date }): string | null {
  if (timing === "at_8") return eventNotifyLabels.timingLate;
  return isQuietHour(input.now) ? eventNotifyLabels.timingUrgentNight : null;
}

/** Les deux lignes de la famille « Événements » des Réglages (la maquette R8.11, vue `reg`). */
export function settingsEventRows(prefs: { event?: boolean; eventNews?: boolean } | null | undefined) {
  const familyOff = prefs?.event === false;
  return {
    /** « Changements importants de mes sorties » : cadenas, jamais d'interrupteur. */
    essential: { locked: true as const },
    /** « Nouveautés de mes sorties » : absent = activé ; grisé, avec sa raison, quand la famille est coupée. */
    news: {
      on: prefs?.eventNews !== false,
      disabled: familyOff,
      reason: familyOff ? eventNotifyLabels.newsFamilyOff : null,
    },
  };
}
