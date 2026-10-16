// Règles pures du garage (lot 31) : catégories cohérentes, éligibilité et perte de la certification, mise en page de
// la fiche Instagram. Aucune dépendance à la base ni à l'horloge (le « maintenant » est passé par l'appelant).
import {
  CERTIFICATION_INACTIVITY_MONTHS,
  CERTIFICATION_MIN_PHOTOS,
  type CategoryMakeMode,
  type ShareFormat,
} from "../garage";
import { type Grade, grades } from "../grades";
import { categoryAllowedForYear } from "./misc";

// --- Catégories cohérentes ----------------------------------------------------------------------------------------

/** Règles d'une catégorie : âge minimum, types, pays de la marque, liste blanche de marques. */
export type CategoryRule = {
  minVehicleAge: number | null;
  /** Null = tous les types. */
  allowedVehicleTypes: readonly string[] | null;
  /** Null = tous les pays (code ISO 3166-1 alpha-2). */
  allowedCountries: readonly string[] | null;
  makeMode: CategoryMakeMode;
  /** Marques de la liste blanche (utilisé si `makeMode` vaut `whitelist`). */
  allowedMakeIds: readonly string[];
};

export type VehicleFacts = {
  vehicleType: string;
  year: number | null;
  makeId: string | null;
  /** Pays de la marque ; null = inconnu. */
  makeCountry: string | null;
  /** Marque « Autre » du référentiel : l'équipe ne sait rien d'elle, donc ni pays ni liste blanche ne la refusent. */
  makeIsOther: boolean;
};

export type CategoryRefusal = "age" | "type" | "country" | "make";

/**
 * Pourquoi une catégorie est refusée à un véhicule, ou null si elle est permise. Ordre : âge, type, pays, liste
 * blanche. Marque « Autre » : le pays et la liste blanche ne s'appliquent pas (toutes les catégories sont permises,
 * sauf l'âge et le type, qui sont des faits du véhicule). Pays de marque inconnu : le pays ne refuse pas.
 */
export function categoryRefusal(category: CategoryRule, vehicle: VehicleFacts, now: Date): CategoryRefusal | null {
  if (!categoryAllowedForYear(category.minVehicleAge, vehicle.year, now)) return "age";
  if (category.allowedVehicleTypes && !category.allowedVehicleTypes.includes(vehicle.vehicleType)) return "type";
  if (vehicle.makeIsOther) return null;
  if (category.allowedCountries && vehicle.makeCountry && !category.allowedCountries.includes(vehicle.makeCountry)) {
    return "country";
  }
  if (category.makeMode === "whitelist" && (!vehicle.makeId || !category.allowedMakeIds.includes(vehicle.makeId))) {
    return "make";
  }
  return null;
}

export const categoryAllowedForVehicle = (category: CategoryRule, vehicle: VehicleFacts, now: Date): boolean =>
  categoryRefusal(category, vehicle, now) === null;

// --- Certification ------------------------------------------------------------------------------------------------

/** Grade minimum pour demander la certification (S37). */
export const CERTIFICATION_MIN_GRADE: Grade = "sport";

export type CertificationMissing =
  | "grade"
  | "status"
  | "plate"
  | "photos"
  | "description"
  | "category"
  | "pending"
  | "certified";

export type CertificationVehicleFacts = {
  status: string;
  photoCount: number;
  description: string | null;
  categoryCount: number;
  /** Plaque en attente de transfert (le véhicule ne peut pas candidater). */
  plateTransferPending: boolean;
  certified: boolean;
  hasPendingRequest: boolean;
};

/** Conditions de la demande de certification (S37) ; `missing` liste ce qui manque, dans l'ordre d'affichage. */
export function certificationEligibility(
  profile: { grade: Grade },
  vehicle: CertificationVehicleFacts,
): { ok: boolean; missing: CertificationMissing[] } {
  const missing: CertificationMissing[] = [];
  if (vehicle.certified) missing.push("certified");
  if (vehicle.hasPendingRequest) missing.push("pending");
  if (grades.indexOf(profile.grade) < grades.indexOf(CERTIFICATION_MIN_GRADE)) missing.push("grade");
  if (vehicle.status !== "active") missing.push("status");
  if (vehicle.plateTransferPending) missing.push("plate");
  if (vehicle.photoCount < CERTIFICATION_MIN_PHOTOS) missing.push("photos");
  if (!vehicle.description?.trim()) missing.push("description");
  if (vehicle.categoryCount < 1) missing.push("category");
  return { ok: missing.length === 0, missing };
}

/** Champs dont la modification fait perdre la certification (S38) : techniques, catégories et photos. */
export type CertificationFields = {
  makeId: string;
  modelId: string;
  generationId: string | null;
  year: number | null;
  engine: string | null;
  powerHp: number | null;
  weightKg: number | null;
  categoryIds: readonly string[];
  photoIds: readonly string[];
};

const textOrNull = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};
const sameSet = (a: readonly string[], b: readonly string[]) => {
  const sa = new Set(a);
  return sa.size === new Set(b).size && b.every((x) => sa.has(x));
};

/**
 * Vrai si le passage de `before` à `after` fait perdre la certification : tout champ technique, les catégories ou
 * les photos (ajout ou retrait ; l'ordre ne compte pas). Description, préparation, couleur et statut sont exclus.
 */
export function certificationLostByChange(before: CertificationFields, after: CertificationFields): boolean {
  return (
    before.makeId !== after.makeId ||
    before.modelId !== after.modelId ||
    (before.generationId ?? null) !== (after.generationId ?? null) ||
    (before.year ?? null) !== (after.year ?? null) ||
    textOrNull(before.engine) !== textOrNull(after.engine) ||
    (before.powerHp ?? null) !== (after.powerHp ?? null) ||
    (before.weightKg ?? null) !== (after.weightKg ?? null) ||
    !sameSet(before.categoryIds, after.categoryIds) ||
    !sameSet(before.photoIds, after.photoIds)
  );
}

/** Date limite : il y a six mois. */
export function certificationInactivityCutoff(now: Date): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - CERTIFICATION_INACTIVITY_MONTHS);
  return d;
}

/**
 * Vrai si la certification se perd par inactivité : certifiée depuis plus de six mois et aucune entrée sur un
 * événement depuis six mois.
 */
export function certificationInactive(certifiedAt: Date, lastCheckinAt: Date | null, now: Date): boolean {
  const cutoff = certificationInactivityCutoff(now);
  if (certifiedAt > cutoff) return false;
  return lastCheckinAt === null || lastCheckinAt < cutoff;
}

// --- Fiche Instagram ----------------------------------------------------------------------------------------------

export type ShareImageLayout = {
  /** Une ou deux lignes ; leur jonction par une espace redonne exactement le nom (jamais tronqué). */
  lines: string[];
  fontSize: number;
};

/** Largeur moyenne d'un caractère d'Archivo ExtraBold, en fraction du corps (mesure large, voir le test). */
export const SHARE_CHAR_WIDTH = 0.64;
/** Marge de chaque côté de l'image (px). */
export const SHARE_MARGIN = 80;
const MAX_FONT: Record<ShareFormat, number> = { story: 112, post: 96 };

const SPACES = /\s+/g;

/** Coupe en deux lignes au plus, la plus longue la plus courte possible ; jamais au milieu d'un mot. */
function balancedSplit(words: string[]): string[] {
  if (words.length < 2) return [words.join(" ")];
  let best: string[] = [words.join(" ")];
  let bestMax = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const longest = Math.max(a.length, b.length);
    if (longest < bestMax) {
      bestMax = longest;
      best = [a, b];
    }
  }
  return best;
}

/**
 * Taille de police et coupe du nom du véhicule pour la fiche Instagram : sur une ligne tant que ça tient à la taille
 * maximale, sinon sur deux lignes, en réduisant le corps jusqu'à ce que la ligne la plus large tienne. Le nom n'est
 * jamais tronqué : si un mot seul est très long, le corps baisse encore.
 */
export function shareImageLayout(name: string, format: ShareFormat, width = 1080): ShareImageLayout {
  const text = name.replace(SPACES, " ").trim() || "Véhicule";
  const available = width - SHARE_MARGIN * 2;
  const max = MAX_FONT[format];
  // Une ligne tant que le corps reste d'au moins 70 % du maximum ; en dessous, deux lignes plus grandes.
  const oneLine = Math.floor(available / (text.length * SHARE_CHAR_WIDTH));
  if (oneLine >= max * 0.7) return { lines: [text], fontSize: Math.min(max, oneLine) };
  const lines = balancedSplit(text.split(" "));
  const longest = Math.max(...lines.map((l) => l.length));
  const fit = Math.floor(available / (longest * SHARE_CHAR_WIDTH));
  return { lines, fontSize: Math.max(8, Math.min(max, fit)) };
}
