// Ajout et modification d'un véhicule en cinq étapes (lot 51, prototype `s-vadd`) : l'état du brouillon et ses règles,
// sans React ni réseau (testé par `model.test.ts`). L'écran (`VehicleWizard.tsx`) affiche, ce module décide : étape
// suivante permise ou non, carte qui se construit, origine déduite de la marque, corps envoyé à l'API, plan d'envoi des
// photos avec les cadres de plaque.
import {
  type CategoryOption,
  vehicleWizardLabels as L,
  normalizePlate,
  type PlateRect,
  type VehicleCreate,
  type VehicleFull,
  type VehicleGeneration,
  type VehicleMake,
  type VehicleModel,
  type VehicleStatus,
  type VehicleType,
  type VehicleUpdate,
} from "@orasso/shared";

export const STEP_COUNT = 5;
export const MAX_PHOTOS = 8;
export const MAX_CATEGORIES = 10;

/** État du repérage automatique d'une photo locale. */
export type Detection = "pending" | "found" | "none" | "unavailable";

/** Une photo du brouillon : locale (choisie, pas encore envoyée) ou déjà en ligne (modification). */
export type DraftPhoto = {
  key: string;
  uri: string;
  width: number;
  height: number;
  /** Photo déjà envoyée (modification) : son identifiant ; absent pour une photo locale. */
  remoteId?: string;
  /** Plaque déjà floutée sur la photo en ligne (le flou est définitif). */
  plateBlurred?: boolean;
  /** Cadres posés ou proposés (normalisés 0–1), floutés à l'envoi. */
  rects: PlateRect[];
  /** Cadres proposés par la détection (mode Automatique). */
  detected?: PlateRect[];
  detection?: Detection;
};

export type BlurMode = "auto" | "manual";

export type Draft = {
  vehicleType: VehicleType;
  makeId?: string;
  modelId?: string;
  generationId?: string | null;
  engine: string;
  powerHp: string;
  weightKg: string;
  year?: number;
  color?: string;
  categoryIds: string[];
  photos: DraftPhoto[];
  blurMode: BlurMode;
  plate: string;
  /** « C'est un ancien véhicule » : vendu, souvenir ou accidenté, plaque facultative. */
  former: boolean;
  status: VehicleStatus;
  unregistered: boolean;
};

export const emptyDraft = (): Draft => ({
  vehicleType: "car",
  engine: "",
  powerHp: "",
  weightKg: "",
  categoryIds: [],
  photos: [],
  blurMode: "auto",
  plate: "",
  former: false,
  status: "active",
  unregistered: false,
});

/** Brouillon prérempli depuis une fiche existante (modification par les mêmes étapes). */
export function draftFromVehicle(v: VehicleFull): Draft {
  return {
    vehicleType: v.vehicleType,
    makeId: v.makeId,
    modelId: v.modelId,
    generationId: v.generationId,
    engine: v.engine ?? "",
    powerHp: v.powerHp ? String(v.powerHp) : "",
    weightKg: v.weightKg ? String(v.weightKg) : "",
    year: v.year ?? undefined,
    color: v.color ?? undefined,
    categoryIds: v.categories.map((c) => c.id),
    photos: v.photos.map((p) => ({
      key: p.id,
      uri: p.url,
      width: p.width,
      height: p.height,
      remoteId: p.id,
      plateBlurred: p.plateBlurred,
      rects: [],
    })),
    blurMode: "manual",
    plate: v.plate ?? "",
    former: v.status !== "active",
    status: v.status,
    unregistered: v.unregistered,
  };
}

// --- Référentiel -----------------------------------------------------------------------------------------------------

type Named = { id: string; name: string; isOther: boolean };

/** Sans accent ni casse : « citroen » trouve « Citroën ». */
export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Liste filtrée par la recherche, triée, « Autre » toujours en dernier (et toujours présent). */
export function filterRows<T extends Named>(rows: readonly T[], search: string): T[] {
  const q = fold(search);
  const words = q.split(/\s+/).filter(Boolean);
  return [...rows]
    .filter((r) => r.isOther || words.length === 0 || words.some((w) => fold(r.name).includes(w)))
    .sort((a, b) => Number(a.isOther) - Number(b.isOther) || a.name.localeCompare(b.name, "fr"));
}

/** Modèles du type choisi (le modèle « Autre » vaut pour tous les types). */
export const modelsForType = (rows: readonly VehicleModel[], type: VehicleType) =>
  rows.filter((m) => m.isOther || m.vehicleType === type);

/** « A90 · depuis 2019 », « 1993 – 2002 ». */
export function generationYears(g: Pick<VehicleGeneration, "yearFrom" | "yearTo">): string | null {
  if (g.yearFrom && g.yearTo) return `${g.yearFrom} – ${g.yearTo}`;
  if (g.yearFrom) return L.since(g.yearFrom);
  return null;
}

/** Années proposées en boutons : celles de la génération (au plus 40), sinon aucune (champ libre). */
export function yearChoices(g: Pick<VehicleGeneration, "yearFrom" | "yearTo"> | undefined, currentYear: number) {
  if (!g?.yearFrom) return [];
  const to = Math.min(g.yearTo ?? currentYear + 1, currentYear + 1);
  if (to < g.yearFrom || to - g.yearFrom > 40) return [];
  return Array.from({ length: to - g.yearFrom + 1 }, (_, i) => (g.yearFrom as number) + i);
}

// --- Catégories ------------------------------------------------------------------------------------------------------

/** Catégorie d'origine : restreinte à des pays, dont celui de la marque (« JDM » pour une marque japonaise). */
export function originCategories(rows: readonly CategoryOption[], makeCountry: string | null | undefined) {
  if (!makeCountry) return [];
  return rows.filter((c) => c.eligible && c.allowedCountries?.includes(makeCountry));
}

/** Les autres catégories à choisir (les origines d'autres pays ne sont pas des styles : on ne les montre pas). */
export const styleCategories = (rows: readonly CategoryOption[]) => rows.filter((c) => !c.allowedCountries);

/** Catégories gardées : origines déduites + styles choisis encore éligibles, 10 au plus. */
export function keptCategories(ids: readonly string[], rows: readonly CategoryOption[], makeCountry: string | null) {
  const origins = originCategories(rows, makeCountry).map((c) => c.id);
  const eligible = new Set(
    styleCategories(rows)
      .filter((c) => c.eligible)
      .map((c) => c.id),
  );
  const styles = ids.filter((id) => eligible.has(id) && !origins.includes(id));
  return [...origins, ...styles].slice(0, MAX_CATEGORIES);
}

/** « Youngtimer et Ancienne : grisées, ta voiture est de 2021. » (les catégories refusées pour l'âge). */
export function ageNote(rows: readonly CategoryOption[], year: number | undefined): string | null {
  if (!year) return null;
  const tooRecent = styleCategories(rows).filter((c) => c.refusal === "age");
  if (!tooRecent.length) return null;
  const labels = tooRecent.map((c) => c.label);
  const joined = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}` : (labels[0] ?? "");
  return L.dimmedForYear(joined, year);
}

// --- Étapes ----------------------------------------------------------------------------------------------------------

function intIn(text: string, min: number, max: number): number | null | "invalid" {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= min && n <= max ? n : "invalid";
}

/** Ce qui empêche de passer l'étape (index 0 à 4), ou null. */
export function stepIssue(step: number, d: Draft, currentYear = new Date().getFullYear()): string | null {
  switch (step) {
    case 0:
      if (!d.makeId) return "Choisis la marque.";
      if (!d.modelId) return "Choisis le modèle.";
      if (d.generationId === undefined) return "Choisis la génération (ou « Autre »).";
      return null;
    case 1:
      if (intIn(d.powerHp, 1, 2500) === "invalid") return "Puissance : un nombre entier de 1 à 2 500.";
      if (intIn(d.weightKg, 50, 40000) === "invalid") return "Poids : un nombre entier de 50 à 40 000.";
      if (d.year !== undefined && (d.year < 1885 || d.year > currentYear + 1)) return "Année hors limites.";
      return null;
    case 2:
      return null;
    case 3:
      return d.photos.length === 0 ? L.photoRequired : null;
    case 4:
      if (d.photos.some((p) => p.detection === "pending")) return L.detecting;
      if (!d.former && !d.unregistered && !d.plate.trim()) return L.plateRequired;
      return null;
    default:
      return null;
  }
}

/** Première étape incomplète avant `step` (pour revenir dessus), ou null. */
export function firstIssue(d: Draft, upTo = STEP_COUNT): { step: number; issue: string } | null {
  for (let s = 0; s < upTo; s++) {
    const issue = stepIssue(s, d);
    if (issue) return { step: s, issue };
  }
  return null;
}

// --- Carte qui se construit -------------------------------------------------------------------------------------------

export type LiveCard = {
  type: VehicleType;
  name: string | null;
  generation: string | null;
  specs: string | null;
  categories: string[];
  cover: string | null;
  plate: boolean;
};

export function liveCard(
  d: Draft,
  step: number,
  ref: {
    make?: VehicleMake;
    model?: VehicleModel;
    generation?: VehicleGeneration | null;
    categories?: readonly CategoryOption[];
  },
): LiveCard {
  const make = ref.make && !ref.make.isOther ? ref.make.name : ref.make ? L.other : null;
  const model = ref.model && !ref.model.isOther ? ref.model.name : null;
  const gen = ref.generation && !ref.generation.isOther ? ref.generation : null;
  const specs = [
    d.engine.trim() || null,
    d.powerHp.trim() ? `${d.powerHp.trim()} ch` : null,
    d.year ? String(d.year) : null,
    d.color && d.color !== "Autre" ? d.color.toLowerCase() : null,
  ].filter(Boolean);
  const byId = new Map((ref.categories ?? []).map((c) => [c.id, c.label]));
  return {
    type: d.vehicleType,
    name: [make, model].filter(Boolean).join(" ") || null,
    generation: gen ? [gen.name, generationYears(gen)].filter(Boolean).join(" · ") : null,
    specs: step >= 1 && specs.length ? specs.join(" · ") : null,
    categories: step >= 2 ? d.categoryIds.map((id) => byId.get(id)).filter((x): x is string => Boolean(x)) : [],
    cover: step >= 3 ? (d.photos[0]?.uri ?? null) : null,
    plate: step >= 4,
  };
}

/** « GR Supra » pour « Ta GR Supra est au garage » : le modèle, sinon la marque, sinon « voiture ». */
export function shortName(ref: { make?: VehicleMake; model?: VehicleModel }, type: VehicleType): string {
  if (ref.model && !ref.model.isOther) return ref.model.name;
  if (ref.make && !ref.make.isOther) return ref.make.name;
  return type === "moto" ? "moto" : type === "truck" ? "camion" : "voiture";
}

// --- Envoi -----------------------------------------------------------------------------------------------------------

function numberOrNull(text: string): number | null {
  const n = Number.parseInt(text.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

const plateOf = (d: Draft): string | null => (d.unregistered || !d.plate.trim() ? null : d.plate.trim());
const statusOf = (d: Draft): VehicleStatus => (d.former ? (d.status === "active" ? "keepsake" : d.status) : "active");

/** Corps de `POST /me/vehicles`. */
export function createBody(d: Draft): VehicleCreate {
  return {
    vehicleType: d.vehicleType,
    makeId: d.makeId as string,
    modelId: d.modelId as string,
    generationId: d.generationId ?? null,
    year: d.year ?? null,
    engine: d.engine.trim() || null,
    powerHp: numberOrNull(d.powerHp),
    weightKg: numberOrNull(d.weightKg),
    color: d.color && d.color !== "Autre" ? d.color : null,
    plate: plateOf(d),
    unregistered: d.unregistered,
    status: statusOf(d),
    statusNote: null,
    description: null,
    preparation: null,
    categoryIds: d.categoryIds,
  };
}

/** Corps de `PATCH /me/vehicles/:id` : seulement ce qui a changé (une fiche inchangée garde sa certification). */
export function updateBody(d: Draft, v: VehicleFull): VehicleUpdate {
  const next = createBody(d);
  const body: VehicleUpdate = {};
  if (next.vehicleType !== v.vehicleType) body.vehicleType = next.vehicleType;
  if (next.makeId !== v.makeId) body.makeId = next.makeId;
  if (next.modelId !== v.modelId) body.modelId = next.modelId;
  if ((next.generationId ?? null) !== v.generationId) body.generationId = next.generationId ?? null;
  if ((next.year ?? null) !== v.year) body.year = next.year ?? null;
  if ((next.engine ?? null) !== v.engine) body.engine = next.engine ?? null;
  if ((next.powerHp ?? null) !== v.powerHp) body.powerHp = next.powerHp ?? null;
  if ((next.weightKg ?? null) !== v.weightKg) body.weightKg = next.weightKg ?? null;
  if ((next.color ?? null) !== v.color) body.color = next.color ?? null;
  if (next.unregistered !== v.unregistered) body.unregistered = next.unregistered;
  if ((next.plate ?? null) !== (v.plate?.trim() || null)) {
    // Même plaque écrite autrement (« ab-123-cd ») : rien à changer, pas de transfert.
    if (!next.plate || !v.plate || normalizePlate(next.plate) !== normalizePlate(v.plate))
      body.plate = next.plate ?? null;
  }
  if (next.status !== v.status) body.status = next.status;
  const before = v.categories.map((c) => c.id);
  if (before.length !== next.categoryIds.length || !before.every((id) => next.categoryIds.includes(id))) {
    body.categoryIds = next.categoryIds;
  }
  return body;
}

export type PhotoOp =
  | { kind: "upload"; key: string; rects: PlateRect[] }
  | { kind: "blur"; key: string; photoId: string; rects: PlateRect[] }
  | { kind: "remove"; photoId: string };

/**
 * Opérations sur les photos, dans l'ordre : retraits, envois (avec leurs cadres de plaque), floutages des photos déjà
 * en ligne ; l'ordre final (couverture en tête) est posé ensuite par `PUT …/photos/order`.
 */
export function photoPlan(d: Draft, before: readonly { id: string }[] = []): PhotoOp[] {
  const kept = new Set(d.photos.filter((p) => p.remoteId).map((p) => p.remoteId));
  const ops: PhotoOp[] = before.filter((p) => !kept.has(p.id)).map((p) => ({ kind: "remove", photoId: p.id }));
  for (const p of d.photos) if (!p.remoteId) ops.push({ kind: "upload", key: p.key, rects: p.rects });
  for (const p of d.photos) {
    if (p.remoteId && p.rects.length) ops.push({ kind: "blur", key: p.key, photoId: p.remoteId, rects: p.rects });
  }
  return ops;
}

/** Nombre de plaques floutées (ou qui le seront) : cadres posés et photos déjà floutées. */
export const blurredCount = (d: Draft): number =>
  d.photos.reduce((n, p) => n + (p.rects.length ? p.rects.length : p.plateBlurred ? 1 : 0), 0);

/** Passe une photo en tête (couverture de la carte). */
export function withCover(photos: DraftPhoto[], index: number): DraftPhoto[] {
  const chosen = photos[index];
  if (!chosen || index === 0) return photos;
  return [chosen, ...photos.filter((_, i) => i !== index)];
}

/** Mode Automatique : les cadres proposés deviennent ceux de la photo ; À la main : la personne les pose. */
export function applyMode(photos: DraftPhoto[], mode: BlurMode): DraftPhoto[] {
  if (mode === "manual") return photos;
  return photos.map((p) => (p.remoteId ? p : { ...p, rects: p.detected ?? [] }));
}
