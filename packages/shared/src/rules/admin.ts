// Administration (lot 33, ARCHITECTURE-SUITE § 16) : réglages de la plateforme (interrupteurs, barème des points et
// seuils des grades, listes administrables), mode assistance (S41), newsletter. Fonctions pures, communes à l'API, au
// site et à l'appli. Les valeurs par défaut sont les constantes déjà en vigueur : un réglage jamais touché ne change rien.
import { type EventFormat, eventFormats, type RefusalReason, refusalReasons } from "../enums";
import { type Grade, grades } from "../grades";
import { type VendorTypeCode, vendorTypeCodes } from "../provider";
import { AUDIENCE_PRIZE_POINTS_DEFAULT } from "./audiencePrize";
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
  // Lot 49 : prix du public (H6, valeur « en discussion » dans docs/01).
  "points.audience_prize",
  "grades.thresholds",
  "lists.refusal_reasons",
  "lists.vendor_types",
  "lists.pro_activities",
  "lists.event_formats",
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
  "points.audience_prize": number;
  "grades.thresholds": Record<Grade, number>;
  "lists.refusal_reasons": RefusalReason[];
  "lists.vendor_types": VendorTypeCode[];
  "lists.pro_activities": ProActivity[];
  "lists.event_formats": EventFormat[];
};

export const adminSettingDefaults: AdminSettingValues = {
  "signup.enabled": true,
  "sponsored.enabled": true,
  "providers.enabled": true,
  "points.participation": POINTS.participation,
  "points.staff": POINTS.staff,
  "points.referral": POINTS.referral,
  "points.malus": POINTS.malus,
  "points.audience_prize": AUDIENCE_PRIZE_POINTS_DEFAULT,
  "grades.thresholds": { ...GRADE_THRESHOLDS },
  "lists.refusal_reasons": [...refusalReasons],
  "lists.vendor_types": [...vendorTypeCodes],
  "lists.pro_activities": [...proActivities],
  "lists.event_formats": [...eventFormats],
};

/** Groupes de la page des réglages (ordre d'affichage). */
export const adminSettingGroups: Record<"switches" | "points" | "lists", readonly AdminSettingKey[]> = {
  switches: ["signup.enabled", "sponsored.enabled", "providers.enabled"],
  points: [
    "points.participation",
    "points.staff",
    "points.referral",
    "points.malus",
    "points.audience_prize",
    "grades.thresholds",
  ],
  lists: ["lists.refusal_reasons", "lists.vendor_types", "lists.pro_activities", "lists.event_formats"],
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
  "lists.event_formats": eventFormats,
} as const;

/** Listes lues par le site et l'appli (`GET /settings/public`) ; repli sur les constantes si la lecture échoue. */
export type PublicSettings = {
  refusalReasons: RefusalReason[];
  vendorTypes: VendorTypeCode[];
  proActivities: ProActivity[];
  eventFormats: EventFormat[];
  signupEnabled: boolean;
  providersEnabled: boolean;
  /** Malus en vigueur (négatif), pour l'avertissement du désistement après le verrouillage. */
  malusPoints: number;
};

export const defaultPublicSettings: PublicSettings = {
  refusalReasons: adminSettingDefaults["lists.refusal_reasons"],
  vendorTypes: adminSettingDefaults["lists.vendor_types"],
  proActivities: adminSettingDefaults["lists.pro_activities"],
  eventFormats: adminSettingDefaults["lists.event_formats"],
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
/** Essais d'envoi par destinataire avant d'abandonner (échecs du service d'e-mail). */
export const NEWSLETTER_MAX_ATTEMPTS = 3;
/** Échecs de suite qui mettent l'envoi en pause (« Envoi interrompu : erreurs du service d'e-mail »). */
export const NEWSLETTER_FAILURE_PAUSE = 20;
/** Part du budget non réservé du jour que la newsletter peut prendre (le reste va aux e-mails des événements). */
export const NEWSLETTER_BUDGET_SHARE = 0.5;

/**
 * E-mails de newsletter encore permis aujourd'hui : au plus `NEWSLETTER_BUDGET_SHARE` du budget non réservé, et jamais
 * plus que ce qui reste de ce budget une fois comptés tous les envois du jour (les e-mails des événements passent avant).
 */
export function newsletterAllowance(o: {
  budget: number;
  reserve: number;
  sentToday: number;
  newsletterToday: number;
}): number {
  const open = Math.max(0, o.budget - o.reserve);
  const cap = Math.floor(open * NEWSLETTER_BUDGET_SHARE);
  return Math.max(0, Math.min(cap - o.newsletterToday, open - o.sentToday));
}
