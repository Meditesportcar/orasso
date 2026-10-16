// Réglages du compte : calculs purs de l'écran Moi (testés sans React Native).
import { type AccountSettings, type AccountSettingsUpdate, departments } from "@orasso/shared";

/** Le réglage tel qu'il sera après le changement (les préférences par famille se fusionnent). */
export function applySettingsPatch(current: AccountSettings, patch: AccountSettingsUpdate): AccountSettings {
  const { notificationPrefs, homeWidgets, ...rest } = patch;
  return {
    ...current,
    ...rest,
    ...(notificationPrefs ? { notificationPrefs: { ...current.notificationPrefs, ...notificationPrefs } } : {}),
    ...(homeWidgets !== undefined ? { homeWidgets } : {}),
  };
}

/** Les quatre familles réglables, avec celle-ci activée ou coupée (l'API attend les quatre à chaque envoi). */
export function prefsWith(prefs: Partial<Record<string, boolean>>, family: string, on: boolean) {
  const next = {
    application: prefs.application !== false,
    event: prefs.event !== false,
    social: prefs.social !== false,
    grade: prefs.grade !== false,
  };
  if (family in next) (next as Record<string, boolean>)[family] = on;
  return next;
}

/** Types coupés après avoir activé (`on`) ou coupé un type de notification. */
export function toggleMutedType(muted: readonly string[], type: string, on: boolean): string[] {
  const rest = muted.filter((m) => m !== type);
  return on ? rest : [...rest, type];
}

/** Un type est reçu si la famille est activée et que le type n'est pas coupé. */
export function typeIsOn(
  prefs: Partial<Record<string, boolean>>,
  muted: readonly string[],
  family: string,
  type: string,
): boolean {
  return prefs[family] !== false && !muted.includes(type);
}

/** Saisie libre d'un département (« 66 », « 2a », « 9 ») → code de la liste, ou `null` s'il n'existe pas. */
export function normalizeDepartment(input: string): string | null {
  const raw = input.trim().toUpperCase();
  if (!raw) return null;
  const padded = /^\d{1,2}$/.test(raw) ? raw.padStart(2, "0") : raw;
  return (departments as readonly string[]).includes(padded) ? padded : null;
}

/** Liste de départements avec celui-ci en plus (sans doublon) ; le premier reste celui qui sert aux distances. */
export function addDepartment(list: readonly string[], code: string): string[] {
  return list.includes(code) ? [...list] : [...list, code];
}
