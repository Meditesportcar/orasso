// Notifications d'un événement, écrans (vague R8, lot R8n2) : règles pures (`now` passé), partagées par l'appli et le site.
// Les règles de livraison sont celles de R8n1 (`eventNotifications.ts`, `quietHours.ts`) : rien n'est recopié ici.
import { draftStart, type EventDraft, fromWallInput, sortedDraftDays } from "../eventWizard";
import { eventNotifyLabels } from "../labels/eventNotifications.fr";
import { ESSENTIAL_URGENT_WITHIN_MS, newsDigestType } from "./eventNotifications";
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
  /** Événement sur plusieurs jours : un jour par ligne (date, début, fin) ; absent ou vide = un seul créneau. */
  days?: { date: string; startsAt: string | number | Date | null; endsAt: string | number | Date | null }[];
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
  if (daysChanged(before.days ?? [], after.days ?? [])) return true;
  if (instant(before.startsAt) !== instant(after.startsAt)) return true;
  if (instant(before.endsAt) !== instant(after.endsAt)) return true;
  if (text(before.addressLine) !== text(after.addressLine)) return true;
  if (text(before.postalCode) !== text(after.postalCode)) return true;
  if (text(before.city) !== text(after.city)) return true;
  return (before.lat ?? null) !== (after.lat ?? null) || (before.lng ?? null) !== (after.lng ?? null);
}

/**
 * Aligné sur `setDays` (`apps/api/src/modules/events/service.ts`) : un jour est reconnu par sa date ; les inscrits sont
 * prévenus si le nombre de jours change (jour ajouté ou retiré) ou si le début ou la fin d'un jour change. La capacité
 * d'un jour seule ne prévient personne.
 */
function daysChanged(before: NonNullable<NotifyFields["days"]>, after: NonNullable<NotifyFields["days"]>): boolean {
  if (before.length !== after.length) return true;
  const old = new Map(before.map((d) => [d.date, d]));
  return after.some((d) => {
    const o = old.get(d.date);
    return !o || instant(o.startsAt) !== instant(d.startsAt) || instant(o.endsAt) !== instant(d.endsAt);
  });
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
export function settingsEventRows(
  prefs: { event?: boolean; eventNews?: boolean } | null | undefined,
  mutedTypes: readonly string[] = [],
) {
  const familyOff = prefs?.event === false;
  return {
    /** « Changements importants de mes sorties » : cadenas, jamais d'interrupteur. */
    essential: { locked: true as const },
    /** « Nouveautés de mes sorties » : absent = activé ; grisé, avec sa raison, quand la famille est coupée. */
    news: {
      // Le résumé coupé par type (ancien réglage) se lit coupé aussi.
      on: prefs?.eventNews !== false && !mutedTypes.includes(newsDigestType),
      disabled: familyOff,
      reason: familyOff ? eventNotifyLabels.newsFamilyOff : null,
    },
  };
}

/** Les champs de l'assistant qui préviennent les inscrits : début du premier jour, fin du dernier, adresse. */
export function notifyFieldsOfDraft(d: EventDraft): NotifyFields {
  const days = d.multiDay ? sortedDraftDays(d) : [];
  const last = days[days.length - 1];
  return {
    startsAt: draftStart(d),
    endsAt: last ? fromWallInput(`${last.date}T${last.endTime}`) : fromWallInput(d.endsAt),
    addressLine: d.addressLine,
    postalCode: d.postalCode,
    city: d.city,
    lat: d.lat,
    lng: d.lng,
    days: days.map((x) => ({
      date: x.date,
      startsAt: fromWallInput(`${x.date}T${x.startTime}`),
      endsAt: fromWallInput(`${x.date}T${x.endTime}`),
    })),
  };
}

/**
 * Le moment d'envoi du changement qu'on vient d'enregistrer, d'après l'échéance décidée par l'API (`lastNotify` de
 * l'événement relu) : `null` si aucun nouveau changement n'a été annoncé (identifiant inchangé : rien à dire).
 */
export function notifyTimingOfSave(
  beforeId: string | null | undefined,
  after: { id: string; deferred: boolean } | null | undefined,
): NotifyTiming | null {
  if (!after || after.id === (beforeId ?? null)) return null;
  return after.deferred ? "at_8" : "now";
}

/** Code porté par l'adresse de retour de l'assistant (« 148.now », « 148.at_8 », « x.now » quand le nombre est inconnu). */
export function notifySavedCode(count: number | null, timing: NotifyTiming): string {
  return `${count ?? "x"}.${timing}`;
}

/** « Enregistré : 148 inscrits prévenus » (ou « … seront prévenus à 8 h »), lu depuis le code ; `null` si illisible. */
export function notifySavedMessage(code: string | null | undefined): string | null {
  const m = /^(\d{1,6}|x)\.(now|at_8)$/.exec(code ?? "");
  if (!m) return null;
  const count = m[1] === "x" ? null : Number(m[1]);
  if (m[2] === "at_8")
    return count === null ? eventNotifyLabels.savedNotifiedFallbackAt8 : eventNotifyLabels.savedNotifiedAt8(count);
  return count === null ? eventNotifyLabels.savedNotifiedFallback : eventNotifyLabels.savedNotified(count);
}
