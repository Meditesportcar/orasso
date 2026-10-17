// Administration (lot 33, ARCHITECTURE-SUITE § 16) : réglages de la plateforme (interrupteurs, barème des points et
// seuils des grades, listes administrables), mode assistance (S41), newsletter. Fonctions pures, communes à l'API, au
// site et à l'appli. Les valeurs par défaut sont les constantes déjà en vigueur : un réglage jamais touché ne change rien.
import { type RefusalReason, refusalReasons } from "../enums";
import { type Grade, grades } from "../grades";
import { type VendorTypeCode, vendorTypeCodes } from "../provider";
import { GRADE_THRESHOLDS } from "./misc";
import { POINTS } from "./points";
import { type ProActivity, proActivities } from "./pro";
import { DAY } from "./time";

/** Réglages de la plateforme gérés par `/admin/reglages` (table `platform_settings`, clé → valeur JSON). */
export const adminSettingKeys = [
  "signup.enabled",
  "sponsored.enabled",
  "providers.enabled",
  "points.participation",
  "points.staff",
  "points.referral",
  "points.malus",
  "grades.thresholds",
  "lists.refusal_reasons",
  "lists.vendor_types",
  "lists.pro_activities",
] as const;
export type AdminSettingKey = (typeof adminSettingKeys)[number];

export type AdminSettingValues = {
  "signup.enabled": boolean;
  "sponsored.enabled": boolean;
  "providers.enabled": boolean;
  "points.participation": number;
  "points.staff": number;
  "points.referral": number;
  "points.malus": number;
  "grades.thresholds": Record<Grade, number>;
  "lists.refusal_reasons": RefusalReason[];
  "lists.vendor_types": VendorTypeCode[];
  "lists.pro_activities": ProActivity[];
};

export const adminSettingDefaults: AdminSettingValues = {
  "signup.enabled": true,
  "sponsored.enabled": true,
  "providers.enabled": true,
  "points.participation": POINTS.participation,
  "points.staff": POINTS.staff,
  "points.referral": POINTS.referral,
  "points.malus": POINTS.malus,
  "grades.thresholds": { ...GRADE_THRESHOLDS },
  "lists.refusal_reasons": [...refusalReasons],
  "lists.vendor_types": [...vendorTypeCodes],
  "lists.pro_activities": [...proActivities],
};

/** Groupes de la page des réglages (ordre d'affichage). */
export const adminSettingGroups: Record<"switches" | "points" | "lists", readonly AdminSettingKey[]> = {
  switches: ["signup.enabled", "sponsored.enabled", "providers.enabled"],
  points: ["points.participation", "points.staff", "points.referral", "points.malus", "grades.thresholds"],
  lists: ["lists.refusal_reasons", "lists.vendor_types", "lists.pro_activities"],
};

/** Barème en vigueur, lu par le règlement des points, le parrainage et le calcul des grades. */
export type PointsConfig = {
  participation: number;
  staff: number;
  referral: number;
  malus: number;
  thresholds: Record<Grade, number>;
};

export function pointsConfigFrom(values: AdminSettingValues): PointsConfig {
  return {
    participation: values["points.participation"],
    staff: values["points.staff"],
    referral: values["points.referral"],
    malus: values["points.malus"],
    thresholds: values["grades.thresholds"],
  };
}

export const DEFAULT_POINTS_CONFIG: PointsConfig = pointsConfigFrom(adminSettingDefaults);

/** Seuils valides : « Rodage » à 0, puis strictement croissants dans l'ordre des grades. */
export function thresholdsProblem(t: Record<Grade, number>): string | null {
  if (t.rodage !== 0) return "Le grade Rodage commence à 0 point.";
  for (let i = 1; i < grades.length; i++) {
    const prev = grades[i - 1] as Grade;
    const cur = grades[i] as Grade;
    if (!(t[cur] > t[prev])) return "Chaque grade doit demander plus de points que le précédent.";
  }
  return null;
}

/** Liste administrable : codes connus, sans doublon ; les motifs de refus gardent toujours « Autre ». */
export function codeListProblem(key: AdminSettingKey, codes: readonly string[]): string | null {
  if (!codes.length) return "La liste ne peut pas être vide.";
  if (new Set(codes).size !== codes.length) return "Un même élément apparaît deux fois.";
  if (key === "lists.refusal_reasons" && !codes.includes("other")) return "Le motif « Autre » reste toujours proposé.";
  return null;
}

/** Codes possibles d'une liste administrable (les libellés restent ceux de `packages/shared`). */
export const adminListCodes = {
  "lists.refusal_reasons": refusalReasons,
  "lists.vendor_types": vendorTypeCodes,
  "lists.pro_activities": proActivities,
} as const;

/** Listes lues par le site et l'appli (`GET /settings/public`) ; repli sur les constantes si la lecture échoue. */
export type PublicSettings = {
  refusalReasons: RefusalReason[];
  vendorTypes: VendorTypeCode[];
  proActivities: ProActivity[];
  signupEnabled: boolean;
  providersEnabled: boolean;
  /** Malus en vigueur (négatif), pour l'avertissement du désistement après le verrouillage. */
  malusPoints: number;
};

export const defaultPublicSettings: PublicSettings = {
  refusalReasons: adminSettingDefaults["lists.refusal_reasons"],
  vendorTypes: adminSettingDefaults["lists.vendor_types"],
  proActivities: adminSettingDefaults["lists.pro_activities"],
  signupEnabled: true,
  providersEnabled: true,
  malusPoints: POINTS.malus,
};

/** Garde les seuls codes connus d'une liste reçue (réponse ancienne ou abîmée), dans l'ordre reçu. */
export function knownCodes<T extends string>(codes: readonly unknown[] | undefined, all: readonly T[]): T[] {
  const list = (codes ?? []).filter((c): c is T => typeof c === "string" && (all as readonly string[]).includes(c));
  return list.length ? list : [...all];
}

// --- Mode assistance (S41) ------------------------------------------------------------------------------------------

/** Une demande d'aide se ferme seule au bout de 7 jours. */
export const ASSISTANCE_MAX_MS = 7 * DAY;

export function assistanceExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ASSISTANCE_MAX_MS);
}

/** La demande ouvre-t-elle encore l'intervention (ouverte et de moins de 7 jours) ? */
export function assistanceActive(r: { status: string; createdAt: Date }, now: Date): boolean {
  return r.status === "open" && now < assistanceExpiresAt(r.createdAt);
}

// --- Newsletter -----------------------------------------------------------------------------------------------------

/** Destinataires traités par passage de la tâche `newsletter.send` (une par minute). */
export const NEWSLETTER_BATCH_SIZE = 200;
/** Un destinataire réservé mais jamais envoyé (arrêt brutal) est repris après ce délai. */
export const NEWSLETTER_RETRY_MS = 10 * 60_000;
