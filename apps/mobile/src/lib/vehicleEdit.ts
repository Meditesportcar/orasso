// Modification d'un véhicule dans l'appli (lot 35c) : du formulaire au corps de `PATCH /me/vehicles/:id`. Seuls les champs
// changés partent (une fiche inchangée ne fait pas perdre la certification) ; la plaque change comme à l'ajout : une
// plaque déjà prise par un autre membre ouvre une demande de transfert, l'API décide. Mêmes champs que « Modifier la
// fiche » du site, plus la plaque (c'est le lancement d'un transfert depuis un véhicule existant).
import type { VehicleFull, VehicleUpdate } from "@orasso/shared";

export type VehicleEditForm = {
  year: string;
  color: string;
  engine: string;
  powerHp: string;
  weightKg: string;
  preparation: string;
  description: string;
  plate: string;
  unregistered: boolean;
  categoryIds: string[];
};

export function vehicleEditForm(v: VehicleFull): VehicleEditForm {
  return {
    year: v.year ? String(v.year) : "",
    color: v.color ?? "",
    engine: v.engine ?? "",
    powerHp: v.powerHp ? String(v.powerHp) : "",
    weightKg: v.weightKg ? String(v.weightKg) : "",
    preparation: v.preparation ?? "",
    description: v.description ?? "",
    plate: v.plate ?? "",
    unregistered: v.unregistered,
    categoryIds: v.categories.map((c) => c.id),
  };
}

function numberField(text: string, label: string, min: number, max: number): number | null | string {
  const clean = text.trim();
  if (!clean) return null;
  const n = Number(clean);
  if (!Number.isInteger(n) || n < min || n > max) return `${label} : un nombre entier de ${min} à ${max}.`;
  return n;
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

/** Corps de l'API (champs changés seulement), ou le message d'erreur ; `{ body: {} }` quand rien n'a changé. */
export function vehicleUpdateBody(
  form: VehicleEditForm,
  v: VehicleFull,
  currentYear = new Date().getFullYear(),
): { body: VehicleUpdate } | { error: string } {
  const before = vehicleEditForm(v);
  const body: VehicleUpdate = {};

  const year = numberField(form.year, "Année", 1885, currentYear + 1);
  if (typeof year === "string") return { error: year };
  const power = numberField(form.powerHp, "Puissance", 1, 2500);
  if (typeof power === "string") return { error: power };
  const weight = numberField(form.weightKg, "Poids", 50, 40000);
  if (typeof weight === "string") return { error: weight };

  if (form.year.trim() !== before.year) body.year = year;
  if (form.powerHp.trim() !== before.powerHp) body.powerHp = power;
  if (form.weightKg.trim() !== before.weightKg) body.weightKg = weight;
  for (const key of ["color", "engine", "preparation", "description"] as const) {
    if (form[key].trim() !== before[key]) body[key] = form[key].trim() || null;
  }
  const plate = form.unregistered ? null : form.plate.trim() || null;
  if (form.unregistered !== before.unregistered) body.unregistered = form.unregistered;
  if (plate !== (before.plate.trim() || null)) body.plate = plate;
  if (!sameIds(form.categoryIds, before.categoryIds)) body.categoryIds = form.categoryIds;

  if (v.status === "active" && !form.unregistered && !plate) return { error: "Plaque obligatoire." };
  return { body };
}

/** Le formulaire change-t-il quelque chose ? */
export const hasChanges = (result: ReturnType<typeof vehicleUpdateBody>): boolean =>
  "body" in result && Object.keys(result.body).length > 0;

/** La modification touche-t-elle la plaque (donc peut-elle lancer un transfert) ? */
export const touchesPlate = (body: VehicleUpdate): boolean => "plate" in body || "unregistered" in body;
