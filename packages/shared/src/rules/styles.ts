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
