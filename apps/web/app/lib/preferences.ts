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

export type PreferencesParse = { ok: true; update: PreferencesUpdate } | { ok: false; error: string };

/** Cases `eventFormat` (plusieurs), curseur `radiusKm`, champ `departments` (numéros), interrupteurs `notify_<clé>`. */
export function parsePreferencesForm(form: FormData): PreferencesParse {
  const formats = new Set(form.getAll("eventFormat").map(String));
  const departments = [
    ...new Set(
      String(form.get("departments") ?? "")
        .split(/[\s,;]+/)
        .map((d) => d.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const unknown = departments.filter((d) => !departmentSchema.safeParse(d).success);
  if (unknown.length) return { ok: false, error: `Département inconnu : ${unknown.join(", ")}` };
  if (departments.length > MAX_DEPARTMENTS) return { ok: false, error: arriveeLabels.errors.tooMany };
  const radius = Number(form.get("radiusKm"));
  return {
    ok: true,
    update: {
      eventFormats: eventFormats.filter((f) => formats.has(f)),
      radiusKm: clampPreferenceRadius(Number.isFinite(radius) ? radius : 50),
      departments,
      notifications: Object.fromEntries(preferenceNotifications.map((k) => [k, form.get(`notify_${k}`) === "on"])),
    },
  };
}
