// « Tes préférences » (lot M6, maquette 8.3, retour 19) : ce qui pré-personnalise l'Explorer et l'alerte « nouveaux
// événements dans ton coin ». Une seule page, à l'arrivée comme dans les réglages. Rangé sur le compte par l'API (`GET`
// et `PATCH /me/preferences`) : les départements, la distance et les centres d'intérêt sont ceux du compte
// (`profiles.departments`, `profiles.radius_km`, `profile_interests`), l'interrupteur coupe ou rétablit le type de
// notification `event_nearby_interest` (`profiles.muted_types`, comme l'écran Notifications) ; seuls les types
// d'événements et la date de la première visite sont nouveaux. Les préférences n'enferment pas la personne : l'Explorer
// s'en sert pour s'ouvrir, jamais pour se limiter.
import { z } from "zod";

import { departmentSchema, type EventFormat, eventFormats, MAX_DEPARTMENTS, type NotificationType } from "./enums";

/** Le curseur « Distance habituelle » (10 à 200 km, pas de 10) ; au-delà, « Partout en France » (`radiusKm: null`). */
export const PREFERENCE_RADIUS = { min: 10, max: 200, step: 10 } as const;

/** Valeur de départ du curseur quand le compte n'a pas de limite de distance et que la personne en choisit une. */
export const PREFERENCE_RADIUS_DEFAULT = 50;

/** Le type de notification que coupe l'interrupteur « Me prévenir des nouveaux événements dans mon coin ». */
export const newEventsNotificationType = "event_nearby_interest" as const satisfies NotificationType;

/** Ce que l'API renvoie : `seenAt` = l'étape a déjà été vue (passée ou validée), sinon `null`. */
export type Preferences = {
  /** Types d'événements préférés ; vide = tous. */
  eventFormats: EventFormat[];
  /** Distance habituelle (km, 10 à 200) autour du coin ; `null` = partout en France. */
  radiusKm: number | null;
  /** Départements du compte (« ton coin »), le premier est le favori. */
  departments: string[];
  /** Centres d'intérêt du compte (identifiants des catégories). */
  interests: string[];
  /** « Me prévenir des nouveaux événements dans mon coin » (le réglage `event_nearby_interest` de Notifications). */
  newEvents: boolean;
  seenAt: string | null;
};

/**
 * `PATCH /me/preferences` : tout est facultatif, seuls les champs présents changent. Chaque appel marque l'étape comme
 * vue (`seenAt`), même vide : « Passer » ne la rouvre pas.
 */
export const preferencesUpdateSchema = z
  .object({
    eventFormats: z.array(z.enum(eventFormats)).max(eventFormats.length),
    radiusKm: z.number().int().min(PREFERENCE_RADIUS.min).max(PREFERENCE_RADIUS.max).nullable(),
    departments: z.array(departmentSchema).max(MAX_DEPARTMENTS),
    interests: z.array(z.uuid()).max(30),
    newEvents: z.boolean(),
  })
  .partial();
export type PreferencesUpdate = z.infer<typeof preferencesUpdateSchema>;

/**
 * Règle de la première fois : après l'ajout du premier véhicule (lot M1), l'appli ouvre « Tes préférences » si l'étape
 * n'a jamais été vue sur ce compte ; sinon elle va droit à l'Explorer.
 */
export const shouldAskPreferences = (p: Pick<Preferences, "seenAt"> | null | undefined): boolean =>
  Boolean(p) && p?.seenAt === null;

/** « Partout en France » : pas de limite de distance (la valeur que le sélecteur « Autour de… » de l'Explorer lit). */
export const isEverywhere = (p: Pick<Preferences, "radiusKm"> | null | undefined): boolean => p?.radiusKm === null;

/** La valeur que montre le curseur : le rayon du compte ramené à la plage (10 à 200), 50 km s'il n'y a pas de limite. */
export const clampPreferenceRadius = (km: number | null): number =>
  km === null
    ? PREFERENCE_RADIUS_DEFAULT
    : Math.min(PREFERENCE_RADIUS.max, Math.max(PREFERENCE_RADIUS.min, Math.round(km / 10) * 10));

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
 * ne sont pas tous cochés) comptent pour un, la distance pour un (sauf « Partout en France »).
 */
export function preferenceFilterCount(p: Pick<Preferences, "eventFormats" | "radiusKm">): number {
  const types = p.eventFormats.length > 0 && p.eventFormats.length < eventFormats.length ? 1 : 0;
  return types + (p.radiusKm === null ? 0 : 1);
}
