// Styles des véhicules (lot R5a, maquettes R5.2 et R5.3 validées par Damien le 26/10) : chaque style (table
// `categories`) appartient à une famille (Époque, Genre, Préparation, Pratique ; les pays restent dans la ligne
// « Origine » verrouillée), porte une icône du kit choisie dans une liste fermée et, au besoin, un libellé au masculin
// (« Ancien », « Préparé » pour un camion). Les membres proposent un style manquant ; l'équipe l'ajoute, le rattache à
// un style existant ou le refuse. Règles communes à l'API, à l'appli et au site.
import type { VehicleType } from "../enums";
import { cleanTyped } from "./proposedVehicle";
import { searchFold } from "./vehicleSearch";

/** Familles d'un style ; `pays` : l'origine (JDM, Allemande…), déduite du pays de la marque. */
export const categoryFamilies = ["epoque", "genre", "preparation", "pratique", "pays"] as const;
export type CategoryFamily = (typeof categoryFamilies)[number];

/** Familles montrées à l'étape Catégories et dans l'admin, dans l'ordre (les pays sont à part, sous cadenas). */
export const styleFamilies = [
  "epoque",
  "genre",
  "preparation",
  "pratique",
] as const satisfies readonly CategoryFamily[];
export type StyleFamily = (typeof styleFamilies)[number];

/**
 * Icônes permises pour un style : des icônes du kit (`@orasso/design-system`, `iconNames`), aucune réservée (alerte,
 * express, grade). Liste fermée : l'admin choisit dedans, l'API refuse le reste.
 */
export const categoryIcons = [
  "wait",
  "star",
  "power",
  "spark",
  "trophy",
  "weatherClear",
  "vehicle",
  "moto",
  "truck",
  "mount",
  "explore",
  "map",
  "home",
  "drop",
  "wrench",
  "layers",
  "undo",
  "weatherWind",
  "flag",
  "rim",
  "roller",
  "seat",
  "speaker",
  "fuel",
  "heart",
  "camera",
] as const;
export type CategoryIcon = (typeof categoryIcons)[number];

/** Nom d'un style : 2 à 24 caractères une fois nettoyé (même nettoyage que les noms tapés du lot R4a). */
export const STYLE_NAME_MIN = 2;
export const STYLE_NAME_MAX = 24;

/** Nom de style nettoyé (contrôles, invisibles, espaces réduits, 24 caractères au plus) ; null s'il en reste moins de 2. */
export function cleanStyleName(text: string | null | undefined): string | null {
  const clean = cleanTyped(text, STYLE_NAME_MAX);
  return clean.length >= STYLE_NAME_MIN ? clean : null;
}

/**
 * Clé normalisée d'un nom de style : sans accents, casse, espaces ni ponctuation (« Café racer » → `caferacer`,
 * « Enduro / Cross » → `endurocross`). Regroupe les propositions et repère un style qui existe déjà.
 */
export function styleKey(text: string): string {
  return searchFold(text).replace(/[^\p{L}\p{N}]/gu, "");
}

/** Le libellé d'un style pour un véhicule : au masculin pour un camion quand il en a un (« Ancien », « Préparé »). */
export function categoryLabelFor(
  category: { label: string; labelM?: string | null },
  vehicleType?: VehicleType | string | null,
): string {
  return vehicleType === "truck" && category.labelM ? category.labelM : category.label;
}

/** Les styles rangés par famille, dans l'ordre des familles puis dans leur ordre ; les familles vides sont retirées. */
export function groupByFamily<T extends { family: CategoryFamily }>(
  rows: readonly T[],
): { family: StyleFamily; rows: T[] }[] {
  return styleFamilies
    .map((family) => ({ family, rows: rows.filter((r) => r.family === family) }))
    .filter((g) => g.rows.length > 0);
}

/** Un style vaut pour ce type de véhicule (types admis nuls : tous ; « offroad » : les voitures tout-terrain). */
export function styleFitsType(allowedVehicleTypes: readonly string[] | null, vehicleType: VehicleType): boolean {
  if (!allowedVehicleTypes) return true;
  return (
    allowedVehicleTypes.includes(vehicleType) || (vehicleType === "car" && allowedVehicleTypes.includes("offroad"))
  );
}

/** Statuts d'une proposition de style. */
export const categoryProposalStatuses = ["pending", "accepted", "merged", "declined"] as const;
export type CategoryProposalStatus = (typeof categoryProposalStatuses)[number];

/** Propositions d'un même compte en 24 h (limite de fréquence de `POST /categories/proposals`). */
export const STYLE_PROPOSALS_PER_DAY = 10;

// --- Lot R5a, tour 2 : listes à modifier (fiche, centres d'intérêt, critères d'événement) -------------------------

/** Familles d'une liste complète, pays compris (en dernier). */
const allFamilies: readonly CategoryFamily[] = [...styleFamilies, "pays"];

const typeNouns: Record<VehicleType, string> = { car: "voiture", moto: "moto", truck: "camion" };

/**
 * Les types d'un style restreint, en clair (« camion », « moto, camion », « voiture » pour les tout-terrain) ; null s'il
 * vaut pour tous les types.
 */
export function styleTypesLabel(allowedVehicleTypes: readonly string[] | null | undefined): string | null {
  if (!allowedVehicleTypes) return null;
  const types = (["car", "moto", "truck"] as const).filter((t) => styleFitsType(allowedVehicleTypes, t));
  if (types.length === 0 || types.length === 3) return null;
  return types.map((t) => typeNouns[t]).join(", ");
}

/** Une ligne d'une liste de styles à cocher. */
export type StyleChoice = {
  id: string;
  label: string;
  icon: string | undefined;
  family: CategoryFamily;
  /** Faux : grisé, non cochable (sauf s'il est déjà choisi : il reste décochable). */
  eligible: boolean;
  reason: string | null;
  /** Style mis en pause par l'admin, gardé tant qu'il est choisi. */
  paused: boolean;
  /** Déjà sur la fiche mais refusé pour le type ou la marque : gardé tant qu'il est choisi. */
  kept: boolean;
};

type OptionLike = {
  id: string;
  label: string;
  icon?: string;
  family: CategoryFamily;
  allowedVehicleTypes: string[] | null;
  allowedCountries: string[] | null;
  eligible: boolean;
  refusal: string | null;
  reason: string | null;
  paused?: boolean;
};
type CurrentLike = { id: string; label: string; icon?: string; family?: CategoryFamily; paused?: boolean };

/** Les groupes d'une liste, dans l'ordre des familles, pays en dernier ; les familles vides sont retirées. */
function grouped<T extends { family: CategoryFamily }>(rows: readonly T[]): { family: CategoryFamily; rows: T[] }[] {
  return allFamilies
    .map((family) => ({ family, rows: rows.filter((r) => r.family === family) }))
    .filter((g) => g.rows.length > 0);
}

/**
 * Styles d'une fiche à modifier (site et appli) : ceux du type, par famille ; les origines de la marque (« Pays ») si
 * `origins` ; et tout ce qui est déjà sur la fiche, coché et décochable, même s'il ne se propose plus : en pause
 * (origine comprise), ou refusé pour le type ou la marque tant que `keepRefused` (type et marque inchangés). Un style
 * refusé pour l'âge reste grisé avec sa raison (l'année a changé).
 */
export function vehicleStyleGroups(
  options: readonly OptionLike[],
  current: readonly CurrentLike[],
  opts: { keepRefused: boolean; origins: boolean },
): { family: CategoryFamily; rows: StyleChoice[] }[] {
  const chosen = new Set(current.map((c) => c.id));
  const rows: StyleChoice[] = [];
  for (const o of options) {
    const isChosen = chosen.has(o.id);
    if (o.paused && !isChosen) continue;
    const refused = o.refusal === "type" || o.refusal === "make" || o.refusal === "country";
    // Gardés : les refus de type et de marque seulement (comme l'API) ; une origine d'un autre pays ne l'est pas.
    const kept = !o.eligible && (o.refusal === "type" || o.refusal === "make") && isChosen && opts.keepRefused;
    if (o.allowedCountries) {
      if (!opts.origins && !o.paused) continue;
      // Une origine déjà posée reste affichée, cochée (grisée si la marque n'est plus de ce pays).
      if (!o.eligible && !isChosen) continue;
    } else if (refused && !kept) {
      continue;
    }
    rows.push({
      id: o.id,
      label: o.label,
      icon: o.icon,
      family: o.allowedCountries ? "pays" : o.family,
      eligible: o.eligible || kept || Boolean(o.paused),
      reason: o.reason,
      paused: Boolean(o.paused),
      kept,
    });
  }
  // Styles de la fiche absents de la liste : en pause (la liste n'a que les styles actifs).
  for (const c of current) {
    if (rows.some((r) => r.id === c.id) || options.some((o) => o.id === c.id)) continue;
    rows.push({
      id: c.id,
      label: c.label,
      icon: c.icon,
      family: c.family ?? "genre",
      eligible: true,
      reason: null,
      paused: true,
      kept: false,
    });
  }
  return grouped(rows);
}

/**
 * Centres d'intérêt et critères d'événement (lot R5a, tour 2) : tous les styles actifs, par famille, pays en dernier,
 * avec leurs types quand ils sont restreints (« Américain · camion » à côté de « Américaine », « 4x4 · voiture »,
 * « Tout-terrain · moto, camion ») ; un style en pause n'y est que s'il est déjà choisi (coché, décochable).
 * `exclude` : catégories laissées à une autre question (les origines des critères d'événement).
 */
export function choiceGroups(
  options: readonly OptionLike[],
  chosen: readonly string[],
  exclude: (o: OptionLike) => boolean = () => false,
): { family: CategoryFamily; rows: { id: string; label: string; paused: boolean }[] }[] {
  const rows = options
    .filter((o) => (!o.paused || chosen.includes(o.id)) && (chosen.includes(o.id) || !exclude(o)))
    .map((o) => {
      const family: CategoryFamily = o.allowedCountries ? "pays" : o.family;
      const types = family === "pays" ? null : styleTypesLabel(o.allowedVehicleTypes);
      // « Moto · moto » ne dit rien de plus : le type n'est ajouté que s'il diffère du nom.
      const redundant = types !== null && styleKey(types) === styleKey(o.label);
      return {
        id: o.id,
        label: types && !redundant ? `${o.label} · ${types}` : o.label,
        paused: Boolean(o.paused),
        family,
      };
    });
  return grouped(rows);
}
