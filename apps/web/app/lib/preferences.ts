// « Tes préférences » sur le site (lot M6) : lecture du formulaire posté, mêmes règles que l'appli (`packages/shared`).
// Pur : testé seul. L'API (`PATCH /me/preferences`) refait la validation, ici on ne fait que produire le bon corps.
import {
  arriveeLabels,
  clampPreferenceRadius,
  departmentSchema,
  eventFormats,
  MAX_DEPARTMENTS,
  type PreferencesUpdate,
} from "@orasso/shared";

import { readDepartmentsField } from "./departments";

export type PreferencesParse = { ok: true; update: PreferencesUpdate } | { ok: false; error: string };

/** Valeur du champ caché `radiusInitial` pour une distance du compte : le nombre, ou `everywhere` (partout en France). */
export const radiusInitialValue = (km: number | null): string => (km === null ? "everywhere" : String(km));

/**
 * Cases `eventFormat` (plusieurs), curseur `radiusKm` et case `everywhere` (« Partout en France »), départements
 * (`departments` ou cases `departmentBox`, voir `departments.ts`), cases `interest` (centres d'intérêt), interrupteur
 * `notify_newEvents`.
 */
export function parsePreferencesForm(form: FormData): PreferencesParse {
  const formats = new Set(form.getAll("eventFormat").map(String));
  const departments = readDepartmentsField(form);
  const unknown = departments.filter((d) => !departmentSchema.safeParse(d).success);
  if (unknown.length) return { ok: false, error: `Département inconnu : ${unknown.join(", ")}` };
  if (departments.length > MAX_DEPARTMENTS) return { ok: false, error: arriveeLabels.errors.tooMany };
  // La distance n'est envoyée que si la personne l'a changée (`radiusInitial` = la valeur du compte à l'ouverture) :
  // un enregistrement qui ne parle pas de distance ne la réécrit jamais.
  const everywhere = form.get("everywhere") === "on";
  const initialRaw = form.get("radiusInitial");
  const initial =
    initialRaw === null ? undefined : initialRaw === "everywhere" ? null : clampPreferenceRadius(Number(initialRaw));
  // Curseur absent ou vide (sans JavaScript, ou case « Partout » décochée sur un curseur grisé) : on garde la valeur
  // affichée (la distance du compte, sinon la valeur de départ du curseur), jamais 0 ni la plus petite distance.
  const rawRadius = form.get("radiusKm");
  const typed = rawRadius === null || String(rawRadius).trim() === "" ? Number.NaN : Number(rawRadius);
  const shown = clampPreferenceRadius(initial ?? null);
  const wanted = everywhere ? null : clampPreferenceRadius(Number.isFinite(typed) ? typed : shown);
  const moved = initial === undefined || wanted !== initial;
  return {
    ok: true,
    update: {
      eventFormats: eventFormats.filter((f) => formats.has(f)),
      ...(moved ? { radiusKm: wanted } : {}),
      departments,
      interests: form.getAll("interest").map(String),
      newEvents: form.get("notify_newEvents") === "on",
    },
  };
}
