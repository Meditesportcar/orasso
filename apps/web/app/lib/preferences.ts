// « Tes préférences » sur le site (lot M6) : lecture du formulaire posté, mêmes règles que l'appli (`packages/shared`).
// Pur : testé seul. L'API (`PATCH /me/preferences`) refait la validation, ici on ne fait que produire le bon corps.
import {
  arriveeLabels,
  clampPreferenceRadius,
  departmentSchema,
  eventFormats,
  MAX_DEPARTMENTS,
  type PreferencesUpdate,
  preferenceNotifications,
} from "@orasso/shared";

import { readDepartmentsField } from "./departments";

export type PreferencesParse = { ok: true; update: PreferencesUpdate } | { ok: false; error: string };

/** Cases `eventFormat` (plusieurs), curseur `radiusKm`, départements (`departments` ou cases `departmentBox`, voir `departments.ts`), interrupteurs `notify_<clé>`. */
export function parsePreferencesForm(form: FormData): PreferencesParse {
  const formats = new Set(form.getAll("eventFormat").map(String));
  const departments = readDepartmentsField(form);
  const unknown = departments.filter((d) => !departmentSchema.safeParse(d).success);
  if (unknown.length) return { ok: false, error: `Département inconnu : ${unknown.join(", ")}` };
  if (departments.length > MAX_DEPARTMENTS) return { ok: false, error: arriveeLabels.errors.tooMany };
  // La distance du compte peut dépasser le curseur (jusqu'à 300 km) : elle n'est envoyée que si le curseur a bougé
  // (`radiusInitial` = la valeur du compte à l'ouverture), sinon l'enregistrement ne la réécrit jamais.
  const radius = Number(form.get("radiusKm"));
  const initialRaw = form.get("radiusInitial");
  const moved =
    initialRaw === null ||
    clampPreferenceRadius(Number.isFinite(radius) ? radius : 50) !== clampPreferenceRadius(Number(initialRaw));
  return {
    ok: true,
    update: {
      eventFormats: eventFormats.filter((f) => formats.has(f)),
      ...(moved ? { radiusKm: clampPreferenceRadius(Number.isFinite(radius) ? radius : 50) } : {}),
      departments,
      notifications: Object.fromEntries(preferenceNotifications.map((k) => [k, form.get(`notify_${k}`) === "on"])),
    },
  };
}
