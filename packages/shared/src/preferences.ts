// « Tes préférences » (lot M6, maquette 8.3, retour 19) : ce qui règle l'Explorer et les notifications « pour toi » d'un
// compte. Rangé sur le compte par l'API (`GET` et `PATCH /me/preferences`) : les départements et le rayon sont ceux du
// compte (`profiles.departments`, `profiles.radius_km`), les trois interrupteurs coupent ou rétablissent un type de
// notification (`profiles.muted_types`) ; seuls les types d'événements et la date de la première visite sont nouveaux.
import { z } from "zod";

import { departmentSchema, type EventFormat, eventFormats, MAX_DEPARTMENTS, type NotificationType } from "./enums";

/** Le curseur « Distance autour de toi » (maquette : 10 à 200 km, pas de 10). */
export const PREFERENCE_RADIUS = { min: 10, max: 200, step: 10 } as const;

/** Les trois interrupteurs « Te prévenir » et le type de notification que chacun coupe. */
export const preferenceNotificationTypes = {
  newEvents: "event_nearby_interest",
  freedSpots: "offer_received",
  followedNews: "new_event_followed",
} as const satisfies Record<string, NotificationType>;
export type PreferenceNotification = keyof typeof preferenceNotificationTypes;
export const preferenceNotifications = Object.keys(preferenceNotificationTypes) as PreferenceNotification[];

/** Ce que l'API renvoie : `seenAt` = l'étape a déjà été vue (passée ou validée), sinon `null`. */
export type Preferences = {
  /** Types d'événements préférés ; vide = tous. */
  eventFormats: EventFormat[];
  /** Distance autour de toi (km), bornée au curseur. */
  radiusKm: number;
  /** Départements du compte, le premier est le favori. */
  departments: string[];
  notifications: Record<PreferenceNotification, boolean>;
  seenAt: string | null;
};

/**
 * `PATCH /me/preferences` : tout est facultatif, seuls les champs présents changent. Chaque appel marque l'étape comme
 * vue (`seenAt`), même vide : « Passer » ne la rouvre pas.
 */
export const preferencesUpdateSchema = z
  .object({
    eventFormats: z.array(z.enum(eventFormats)).max(eventFormats.length),
    radiusKm: z.number().int().min(PREFERENCE_RADIUS.min).max(PREFERENCE_RADIUS.max),
    departments: z.array(departmentSchema).max(MAX_DEPARTMENTS),
    notifications: z.object({ newEvents: z.boolean(), freedSpots: z.boolean(), followedNews: z.boolean() }).partial(),
  })
  .partial();
export type PreferencesUpdate = z.infer<typeof preferencesUpdateSchema>;

/**
 * Règle de la première fois : après l'ajout du premier véhicule (lot M1), l'appli ouvre « Tes préférences » si l'étape
 * n'a jamais été vue sur ce compte ; sinon elle va droit à l'Explorer.
 */
export const shouldAskPreferences = (p: Pick<Preferences, "seenAt"> | null | undefined): boolean =>
  Boolean(p) && p?.seenAt === null;

/** Le rayon affiché par le curseur (un compte plus ancien peut avoir jusqu'à 300 km). */
export const clampPreferenceRadius = (km: number): number =>
  Math.min(PREFERENCE_RADIUS.max, Math.max(PREFERENCE_RADIUS.min, Math.round(km / 10) * 10));

/** Temps de route estimé (80 km/h de moyenne), arrondi à 5 min : « ≈ 45 min de route », « ≈ 2 h 30 de route ». */
export function travelTimeLabel(km: number): string {
  const minutes = Math.max(5, Math.round((km * 0.75) / 5) * 5);
  if (minutes < 60) return `≈ ${minutes} min de route`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `≈ ${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""} de route`;
}

/**
 * Nombre de filtres actifs venus des préférences (pastille « Filtres » de l'Explorer, lot M4) : les types choisis (s'ils
 * ne sont pas tous cochés) comptent pour un, la distance pour un.
 */
export function preferenceFilterCount(p: Pick<Preferences, "eventFormats">): number {
  const types = p.eventFormats.length > 0 && p.eventFormats.length < eventFormats.length ? 1 : 0;
  return types + 1;
}
