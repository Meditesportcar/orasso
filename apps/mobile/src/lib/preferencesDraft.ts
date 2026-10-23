// « Tes préférences » (lot M6, tour 2) : la copie de travail de l'écran, en fonctions pures.
// - Le brouillon part de la dernière valeur connue (cache du trousseau), puis la réponse fraîche de l'API arrive parfois
//   plus tard : elle met à jour les champs que la personne n'a PAS touchés, et laisse ceux qu'elle a modifiés.
// - L'enregistrement n'envoie que les champs touchés (point 9 : la distance n'est envoyée que si la personne l'a
//   touchée, un compte réglé autrement ne se fait jamais réécrire).
import type { Preferences, PreferencesUpdate } from "@orasso/shared";

/** Les champs de l'écran ; `radiusKm: null` = « Partout en France ». */
export type PreferencesDraft = Pick<
  Preferences,
  "eventFormats" | "radiusKm" | "departments" | "interests" | "newEvents"
>;

/** Les champs que la personne a modifiés depuis l'ouverture de l'écran. */
export type TouchedFields = Partial<Record<keyof PreferencesDraft, true>>;

const FIELDS = ["eventFormats", "radiusKm", "departments", "interests", "newEvents"] as const;

export const draftFrom = (p: Preferences): PreferencesDraft => ({
  eventFormats: p.eventFormats,
  radiusKm: p.radiusKm,
  departments: p.departments,
  interests: p.interests,
  newEvents: p.newEvents,
});

/**
 * Nouvelle valeur lue sur le serveur : sans brouillon, on en crée un ; avec un brouillon, chaque champ non touché prend
 * la valeur fraîche et chaque champ touché garde celle de la personne.
 */
export function mergeFresh(
  draft: PreferencesDraft | null,
  touched: TouchedFields,
  fresh: Preferences,
): PreferencesDraft {
  const base = draftFrom(fresh);
  if (!draft) return base;
  const next = { ...base };
  for (const f of FIELDS) if (touched[f]) Object.assign(next, { [f]: draft[f] });
  return next;
}

/** Ce qu'on envoie à `PATCH /me/preferences` : les champs touchés seulement. */
export function patchOf(draft: PreferencesDraft, touched: TouchedFields): PreferencesUpdate {
  const patch: PreferencesUpdate = {};
  for (const f of FIELDS) if (touched[f]) Object.assign(patch, { [f]: draft[f] });
  return patch;
}
