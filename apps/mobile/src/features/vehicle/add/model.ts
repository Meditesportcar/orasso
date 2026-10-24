// Ajout et modification d'un véhicule en cinq étapes (lot 51, prototype `s-vadd` ; lot M1, maquettes 1.1 à 1.9) :
// l'état du brouillon et ses règles, sans React ni réseau (testé par `model.test.ts`). L'écran (`VehicleWizard.tsx`)
// affiche, ce module décide : étape suivante permise ou non, fiche qui se construit, origine déduite de la marque,
// styles montrés ou grisés, corps envoyé à l'API, plan d'envoi des photos avec les cadres de plaque.
// Lot M1 : nouvel ordre de Damien (retour 11) Photos → Plaque → Marque et modèle → Fiche technique → Catégories.
import {
  type CategoryOption,
  formatPreparation,
  vehicleWizardLabels as L,
  normalizePlate,
  type PlateRect,
  parsePreparation,
  vehicleAddLabels as V,
  type VehicleCreate,
  type VehicleFull,
  type VehicleGeneration,
  type VehicleMake,
  type VehicleModel,
  type VehiclePreparation,
  type VehicleStatus,
  type VehicleType,
  type VehicleUpdate,
  vehicleSpecsIssue,
} from "@orasso/shared";

// Chemin relatif : Vitest (sans alias « @/ ») teste ce module.
import type { SquareCrop } from "../../../lib/squareCrop";

export const STEP_COUNT = 5;
/** Index des étapes, dans l'ordre décidé par Damien (lot M1). */
export const STEP = { photos: 0, plate: 1, identity: 2, specs: 3, categories: 4 } as const;
export const MAX_PHOTOS = 8;
export const MAX_CATEGORIES = 10;

/** État du repérage automatique d'une photo locale. */
export type Detection = "pending" | "found" | "none" | "unavailable";

/** Recadrage carré (lot M1), normalisé 0–1 dans la photo d'origine : coin haut gauche et côté (en largeurs). */
export type { SquareCrop };

/** Une photo du brouillon : locale (choisie, pas encore envoyée) ou déjà en ligne (modification). */
export type DraftPhoto = {
  key: string;
  uri: string;
  width: number;
  height: number;
  /**
   * Lot M1 : photo d'origine (avant le recadrage carré) et cadre choisi, pour recadrer de nouveau sans perte. La photo
   * envoyée (`uri`) est le carré ; absent pour une photo déjà en ligne.
   */
  source?: { uri: string; width: number; height: number; crop: SquareCrop };
  /** Photo déjà envoyée (modification) : son identifiant ; absent pour une photo locale. */
  remoteId?: string;
  /** Plaque déjà floutée sur la photo en ligne (le flou est définitif). */
  plateBlurred?: boolean;
  /** Cadres posés ou proposés (normalisés 0–1), floutés à l'envoi. */
  rects: PlateRect[];
  /** Cadres proposés par la détection (mode Automatique). */
  detected?: PlateRect[];
  detection?: Detection;
  /**
   * Lot M2 : plaques lues sur la photo (voir `FoundPlate` de `lib/plates/detect`), pour préremplir le numéro ; celles
   * du filet de sécurité (`probable`) sont gardées comme donnée « à vérifier », jamais appliquées d'office.
   */
  readings?: PlateReading[];
  /** Photo locale sans cadre : la personne a confirmé « Envoyer sans flouter : aucune plaque visible ». */
  noPlate?: boolean;
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
  /** Lot M1 : description libre (obligatoire pour demander la certification). */
  description: string;
  /** Lot M1 : préparations choisies en pastilles, et la note libre d'une fiche d'avant. */
  preparation: VehiclePreparation[];
  preparationNote: string;
  /** Teinte saisie à la main (« Autre teinte »). */
  colorCustom?: boolean;
  /** « C'est un ancien véhicule » : vendu, souvenir ou accidenté, plaque facultative. */
  former: boolean;
  status: VehicleStatus;
  unregistered: boolean;
  /**
   * Lot M2, tour 2 : le numéro a été touché à la main (saisi, corrigé ou effacé) : plus jamais prérempli. Gardé dans
   * le brouillon, il survit au va-et-vient entre les étapes.
   */
  plateTouched?: boolean;
};

/** Une plaque lue sur une photo, telle que l'étape Plaque la garde (sans le cadre). */
export type PlateReading = {
  plate: string;
  fixes: number;
  valid: boolean;
  ambiguous: boolean;
  probable: boolean;
  area: number;
};

/** Rien de saisi (lot M1, tour 2) : ✕ ou retour quitte sans demander. */
export const draftIsEmpty = (d: Draft): boolean =>
  d.photos.length === 0 &&
  !d.makeId &&
  !d.plate.trim() &&
  !d.engine.trim() &&
  !d.powerHp.trim() &&
  !d.weightKg.trim() &&
  d.year === undefined &&
  !d.color &&
  !d.description.trim() &&
  d.preparation.length === 0 &&
  d.categoryIds.length === 0 &&
  !d.former &&
  !d.unregistered;

export const emptyDraft = (): Draft => ({
  vehicleType: "car",
  engine: "",
  powerHp: "",
  weightKg: "",
  categoryIds: [],
  photos: [],
  blurMode: "auto",
  plate: "",
  description: "",
  preparation: [],
  preparationNote: "",
  former: false,
  status: "active",
  unregistered: false,
});

/** Brouillon prérempli depuis une fiche existante (modification par les mêmes étapes). */
export function draftFromVehicle(v: VehicleFull): Draft {
  const prep = parsePreparation(v.preparation);
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
    // Lot M1, tour 2 : une plaque repérée avec certitude sur une nouvelle photo est masquée d'office, comme à la création
    // (les photos déjà en ligne ne sont pas touchées par `applyMode`).
    blurMode: "auto",
    plate: v.plate ?? "",
    description: v.description ?? "",
    preparation: prep.items,
    preparationNote: prep.note,
    // Fiche existante : son numéro (ou son absence) est une saisie, jamais repréremplie (lot M2, tour 2).
    plateTouched: true,
    former: v.status !== "active",
    status: v.status,
    unregistered: v.unregistered,
  };
}

// --- Référentiel -----------------------------------------------------------------------------------------------------

type Named = { id: string; name: string; isOther: boolean };

/** Sans accent ni casse : « citroen » trouve « Citroën ». */
export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Liste filtrée par la recherche, triée par nom (les générations gardent l'ordre des années), « Autre » en dernier. */
export function filterRows<T extends Named>(rows: readonly T[], search: string, byName = true): T[] {
  const q = fold(search);
  const words = q.split(/\s+/).filter(Boolean);
  return [...rows]
    .filter((r) => r.isOther || words.length === 0 || words.some((w) => fold(r.name).includes(w)))
    .sort((a, b) => Number(a.isOther) - Number(b.isOther) || (byName ? a.name.localeCompare(b.name, "fr") : 0));
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

/**
 * Styles montrés à l'étape Catégories (maquette 1.7) : ceux qui n'ont rien à voir avec ce véhicule (« Moto » pour une
 * voiture, réservés à d'autres marques) sont cachés ; ceux refusés pour l'âge restent, barrés et grisés.
 */
export const visibleStyles = (rows: readonly CategoryOption[]) =>
  styleCategories(rows).filter((c) => c.refusal !== "type" && c.refusal !== "make");

/** « Youngtimer et Ancienne sont grisées : ta voiture est de 2021. » (lot M1, une seule phrase sous les styles). */
export function dimmedNote(rows: readonly CategoryOption[], year: number | undefined, type: VehicleType) {
  if (!year) return null;
  const labels = visibleStyles(rows)
    .filter((c) => c.refusal === "age")
    .map((c) => c.label);
  return labels.length ? V.stylesDimmed(labels, V.vehicleNoun[type], year) : null;
}

/** Catégorie « Préparée » à cocher d'office quand une préparation est choisie (maquette 1.7), si elle convient. */
export const preparedCategory = (rows: readonly CategoryOption[]) =>
  rows.find((c) => c.slug === "preparee" && c.eligible) ?? null;

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

/** Ce qui empêche de passer l'étape (`STEP`, index 0 à 4), ou null. */
export function stepIssue(step: number, d: Draft, currentYear = new Date().getFullYear()): string | null {
  switch (step) {
    case STEP.identity:
      if (!d.makeId) return "Choisis la marque.";
      if (!d.modelId) return "Choisis le modèle.";
      if (d.generationId === undefined) return "Choisis la génération (ou « Autre »).";
      return null;
    case STEP.specs: {
      // Décision de Damien du 23/10 : saisie libre, mêmes bornes que l'API (`vehicleSpecsIssue`).
      const specs = vehicleSpecsIssue(d);
      if (specs) return specs;
      if (d.year !== undefined && (d.year < 1885 || d.year > currentYear + 1)) return "Année hors limites.";
      return null;
    }
    case STEP.categories:
      return null;
    case STEP.photos:
      return d.photos.length === 0 ? V.needPhoto : null;
    case STEP.plate:
      if (d.photos.some((p) => p.detection === "pending")) return L.detecting;
      {
        // Relecture : aucune photo nouvelle ne part sans cadre, sauf confirmation explicite qu'elle ne montre pas de plaque.
        const unchecked = d.photos.findIndex(needsPlateDecision);
        if (unchecked >= 0) return L.noPlateIssue(unchecked + 1);
      }
      if (!d.former && !d.unregistered && !d.plate.trim()) return L.plateRequired;
      if (!d.unregistered && d.plate.trim() && normalizePlate(d.plate).length < 3) return L.plateInvalid;
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

/**
 * Lot M1, tour 2 (vie privée de la plaque) : où mène « Continuer ». Rien pendant l'import ou le recadrage d'une photo
 * (`wait`) ; une étape déjà passée qui ne tient plus — photo ajoutée ou recadrée après l'étape Plaque, détection en
 * cours — y ramène (`fix`) ; sinon l'étape suivante, ou l'envoi à la dernière.
 */
export type NextMove =
  | { kind: "wait" }
  | { kind: "fix"; step: number; issue: string }
  | { kind: "step"; step: number }
  | { kind: "send" };

export function nextMove(step: number, d: Draft, importing: boolean): NextMove {
  if (importing) return { kind: "wait" };
  const issue = firstIssue(d, step + 1);
  if (issue) return { kind: "fix", ...issue };
  return step < STEP_COUNT - 1 ? { kind: "step", step: step + 1 } : { kind: "send" };
}

/** Étape déjà passée à reprendre (la première incomplète avant `step`), ou null. */
export function stepToRevisit(d: Draft, step: number): number | null {
  return firstIssue(d, step)?.step ?? null;
}

/**
 * « Continuer » grisé (maquettes 1.1 et 1.5) : pendant l'import ou le recadrage d'une photo (lot M1, tour 2), tant
 * qu'il n'y a pas de photo, ou que le choix de la marque et du modèle n'est pas fait.
 */
export function continueBlocked(step: number, d: Draft, importing: boolean): boolean {
  if (importing) return true;
  return Boolean(stepIssue(step, d)) && (step === STEP.photos || step === STEP.identity);
}

// --- Carte qui se construit -------------------------------------------------------------------------------------------

export type LiveCard = {
  type: VehicleType;
  /** Nombre de photos (« 2 photos » tant que la marque n'est pas choisie). */
  photos: number;
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
  // Lot M1 : la photo d'abord, puis la plaque, le modèle, la fiche et les catégories (maquettes 1.1 à 1.7).
  return {
    type: d.vehicleType,
    photos: d.photos.length,
    name: [make, model].filter(Boolean).join(" ") || null,
    generation: gen ? [gen.name, generationYears(gen)].filter(Boolean).join(" · ") : null,
    specs: step >= STEP.specs && specs.length ? specs.join(" · ") : null,
    categories:
      step >= STEP.categories ? d.categoryIds.map((id) => byId.get(id)).filter((x): x is string => Boolean(x)) : [],
    cover: d.photos[0]?.uri ?? null,
    plate: step >= STEP.plate,
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
    description: d.description.trim() || null,
    preparation: formatPreparation(d.preparation, d.preparationNote),
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
  if ((next.description ?? null) !== (v.description?.trim() || null)) body.description = next.description ?? null;
  if ((next.preparation ?? null) !== (v.preparation?.trim() || null)) body.preparation = next.preparation ?? null;
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

/** Nombre de plaques floutées (ou qui le seront) : cadres posés et photos déjà floutées. */
export const blurredCount = (d: Draft): number =>
  d.photos.reduce((n, p) => n + (p.rects.length ? p.rects.length : p.plateBlurred ? 1 : 0), 0);

/** Photo locale sans cadre ni confirmation « aucune plaque visible » : elle ne peut pas partir. */
export const needsPlateDecision = (p: DraftPhoto): boolean => !p.remoteId && p.rects.length === 0 && !p.noPlate;

/** Aucune détection possible sur ces photos (web, Expo Go, module absent) : le mode « Automatique » n'a pas de sens. */
export const detectionUnavailable = (photos: readonly DraftPhoto[]): boolean => {
  const local = photos.filter((p) => !p.remoteId);
  return local.length > 0 && local.every((p) => p.detection === "unavailable");
};

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

// --- Éditeur du cadre ------------------------------------------------------------------------------------------------

/** Hauteur maximale de la photo dans l'éditeur : une photo en hauteur (9:16) reste entière à l'écran. */
export const EDITOR_MAX_HEIGHT = 460;

/** Taille d'affichage d'une photo entière (son format exact) dans une largeur et une hauteur données. */
export function fitPhoto(width: number, height: number, maxW: number, maxH: number): { w: number; h: number } {
  if (maxW <= 0) return { w: 0, h: 0 };
  const ratio = width > 0 && height > 0 ? width / height : 4 / 3;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w: Math.round(w), h: Math.round(h) };
}

// --- Erreurs à l'envoi -----------------------------------------------------------------------------------------------

/** Étape à rouvrir pour une erreur 4xx de l'API portant sur un champ, ou null (réseau, serveur : on reprend). */
export function stepOfError(e: unknown): number | null {
  // Forme d'`ApiRequestError` (lib/http), lue sans l'importer : ce module reste pur.
  if (typeof e !== "object" || e === null || !("status" in e)) return null;
  const err = e as { status: number; code?: string; message?: string; details?: Record<string, unknown> };
  if (err.status === 0 || err.status >= 500 || err.status === 429) return null;
  const fields = Object.keys((err.details?.fields as Record<string, unknown> | undefined) ?? {});
  const has = (...names: string[]) => fields.some((f) => names.some((n) => f === n || f.startsWith(`${n}.`)));
  // Lot M1, tour 2 : photo refusée sans décision sur la plaque (`plateDecision`) → étape Plaque.
  if (
    err.code === "plate_taken" ||
    has("plate", "unregistered", "status", "plateDecision") ||
    /plaque/i.test(err.message ?? "")
  )
    return STEP.plate;
  if (has("vehicleType", "makeId", "modelId", "generationId")) return STEP.identity;
  if (has("year", "engine", "powerHp", "weightKg", "color", "description", "preparation")) return STEP.specs;
  if (has("categoryIds")) return STEP.categories;
  if (
    err.status === 413 ||
    err.status === 415 ||
    has("photo", "plateRects", "rects") ||
    /photo/i.test(err.message ?? "")
  ) {
    return STEP.photos;
  }
  return null;
}
