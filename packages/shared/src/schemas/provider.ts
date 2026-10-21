// Prestataires : profil, candidatures, accréditation, présence sur la fiche d'un événement
// (docs/01 « Prestataires », ARCHITECTURE-SUITE § 6, lot 21).
import { z } from "zod";

import type { ApplicationStatus } from "../application";
import { departmentSchema, type EventFormat } from "../enums";
import {
  EVENT_NEED_MAX_QUANTITY,
  type ProviderPower,
  providerPowers,
  type VendorTypeCode,
  vendorTypeCodes,
} from "../provider";
import { type MenuItem, parseMenuLines } from "../rules/menu";
import { PROVIDER_REVIEW_MAX_RATING, PROVIDER_REVIEW_MIN_RATING } from "../rules/missions";
import { optionalText } from "./common";

/** Texte facultatif : absent reste absent (inchangé), vide devient `null` (effacé). */
const nullIfEmpty = (v: string | null | undefined) => (v === undefined ? undefined : v ? v : null);

/** Adresse web : http ou https seulement (jamais javascript:, data:…). */
const httpUrl = z.url().refine((u) => /^https?:\/\//i.test(u), "Adresse en http ou https");

const emptyToNull = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.literal("").transform(() => null)]).nullish();

/**
 * Types du profil. « stand » vient de la fiche pro : le service le refuse pour un nouveau profil et le garde pour un
 * profil déjà lié (le formulaire d'un stand n'a pas de choix de type).
 */
const selectableType = z.enum(vendorTypeCodes);

/**
 * Profil prestataire (`PUT /me/provider-profile`). Seuls le nom et le type sont obligatoires pour l'enregistrer ;
 * la complétude exigée pour candidater est vérifiée à la candidature (`providerProfileIssue`).
 * `instagram` : « @pseudo » ou adresse du compte.
 */
export const providerProfileSchema = z
  .object({
    type: selectableType,
    /** Texte libre (≤ 40) quand le type est « autres ». */
    customType: optionalText(40),
    name: z.string().trim().min(2, "Nom trop court").max(60),
    description: optionalText(800),
    phone: z
      .string()
      .trim()
      .regex(/^[+\d][\d\s.()-]{5,20}$/, "Numéro de téléphone invalide")
      .nullish()
      .or(z.literal("").transform(() => null)),
    email: z
      .email()
      .max(120)
      .nullish()
      .or(z.literal("").transform(() => null)),
    website: emptyToNull(httpUrl.max(200)),
    instagram: optionalText(100),
    portfolioUrl: emptyToNull(httpUrl.max(200)),
    departments: z.array(departmentSchema).max(20).default([]),
    // Vitrine (lot 46, `s-vitrine`). Absent = inchangé (un ancien client qui ne les envoie pas ne les efface pas) ;
    // `null` = effacé.
    /** Métiers cochés (« Métier · touche pour cocher ») ; `type` reste le métier principal. */
    trades: z.array(z.enum(vendorTypeCodes)).max(vendorTypeCodes.length).optional(),
    tagline: z.string().trim().max(80).nullish(),
    teamSize: z.number().int().min(1).max(50).nullish(),
    /** « Une ligne par plat, avec son prix » : analysé par `parseMenuLines`, chaque ligne illisible est une erreur. */
    menu: z.string().max(4000).nullish(),
    powerNeed: z.enum(providerPowers).nullish(),
    frontageM: z.number().int().min(1).max(30).nullish(),
    waterNeed: z.boolean().nullish(),
    radiusKm: z.number().int().min(5).max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "other" && !v.customType) {
      ctx.addIssue({ code: "custom", path: ["customType"], message: "Précise ton activité" });
    }
    if (v.menu) {
      for (const e of parseMenuLines(v.menu).errors) {
        ctx.addIssue({ code: "custom", path: ["menu"], message: e.message });
      }
    }
  });
export type ProviderProfileInput = z.infer<typeof providerProfileSchema>;

export const providerPhotoOrderSchema = z.object({ photoIds: z.array(z.uuid()).max(16) });

/**
 * Candidature d'un prestataire : message facultatif, règlement accepté ; `needId` (lot 46) = la mission (besoin de
 * l'organisateur) à laquelle elle répond, qui doit appartenir à l'événement et ne pas être comblée.
 */
export const providerApplicationCreateSchema = z.object({
  rulesAccepted: z.literal(true),
  message: optionalText(300),
  needId: z.uuid().nullish(),
});
export type ProviderApplicationCreate = z.infer<typeof providerApplicationCreateSchema>;

export const accreditationSchema = z.object({ accredited: z.boolean() });

export const providerApplicationsQuerySchema = z.object({ scope: z.enum(["upcoming", "past"]).default("upcoming") });

export const openToProvidersQuerySchema = z.object({
  /** Type de prestataire ; par défaut, celui de mon profil. */
  type: z.enum(vendorTypeCodes).optional(),
});

// --- Prestataires v2 (lot 46) : missions, emplacement, avis ------------------------------------------------------

/** Besoin d'un événement (mission), saisi par l'organisateur : « cherche 1 food truck, électricité fournie ». */
export const eventNeedSchema = z.object({
  trade: z.enum(vendorTypeCodes),
  quantity: z.number().int().min(1).max(EVENT_NEED_MAX_QUANTITY).default(1),
  /** Ce que l'organisateur fournit : rien, 16 A, 32 A, ou pas d'électricité mais groupe autorisé. */
  power: z.enum(providerPowers).default("none"),
  water: z.boolean().default(false),
  /** Façade offerte (mètres). */
  frontageM: z.number().int().min(1).max(30).nullish(),
  /** Arrivée et installation (« arrivée 16 h »). */
  installAt: z.iso.datetime({ offset: true }).nullish(),
  notes: optionalText(300),
  /**
   * Correctif 53c : clé de création (UUID) posée par l'assistant. Une seule mission par clé et par événement : la même
   * clé renvoyée (nouvel essai après une réponse perdue) rend la mission déjà créée.
   */
  clientKey: z.uuid().optional(),
});
export type EventNeedInput = z.infer<typeof eventNeedSchema>;

/** Modification d'un besoin : champs envoyés seulement. */
export const eventNeedUpdateSchema = z
  .object({
    trade: z.enum(vendorTypeCodes),
    quantity: z.number().int().min(1).max(EVENT_NEED_MAX_QUANTITY),
    power: z.enum(providerPowers),
    water: z.boolean(),
    frontageM: z.number().int().min(1).max(30).nullable(),
    installAt: z.iso.datetime({ offset: true }).nullable(),
    notes: z.string().trim().max(300).nullable().transform(nullIfEmpty),
    position: z.number().int().min(0).max(99),
  })
  .partial();
export type EventNeedUpdate = z.infer<typeof eventNeedUpdateSchema>;

/** Emplacement attribué à un prestataire retenu (« B2 ») et sa note (« près de l'entrée, prise au poteau »). */
export const providerSpotSchema = z.object({
  spotLabel: z
    .string()
    .trim()
    .max(12)
    .nullable()
    .transform((v) => v || null),
  spotNote: optionalText(200),
});
export type ProviderSpotInput = z.infer<typeof providerSpotSchema>;

/** Avis d'un organisateur sur un prestataire retenu (note entière, V10). */
export const providerReviewSchema = z.object({
  rating: z.number().int().min(PROVIDER_REVIEW_MIN_RATING).max(PROVIDER_REVIEW_MAX_RATING),
  comment: optionalText(300),
});
export type ProviderReviewInput = z.infer<typeof providerReviewSchema>;

/** `GET /missions?trade=&radiusKm=&from=` : métier (défaut : mon métier principal), rayon (défaut : celui de ma
 * vitrine), département de départ (défaut : le premier de ma zone d'intervention). */
export const missionsQuerySchema = z.object({
  trade: z.enum(vendorTypeCodes).optional(),
  radiusKm: z.coerce.number().int().min(1).max(500).optional(),
  from: departmentSchema.optional(),
});
export type MissionsQuery = z.infer<typeof missionsQuerySchema>;

/** `@pseudo` ou adresse → adresse du compte Instagram (`null` si vide). */
export function instagramUrl(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    // Seule une adresse de compte Instagram est gardée (jamais un lien vers un autre site déguisé en Instagram).
    try {
      const host = new URL(v).hostname.toLowerCase();
      return host === "instagram.com" || host === "www.instagram.com" ? v : null;
    } catch {
      return null;
    }
  }
  const handle = v.replace(/^@/, "").replace(/[^A-Za-z0-9_.]/g, "");
  return handle ? `https://www.instagram.com/${handle}` : null;
}

/** « @pseudo » à afficher pour un compte Instagram (`null` si l'adresse n'est pas celle d'un compte). */
export function instagramHandle(value: string | null | undefined): string | null {
  const url = instagramUrl(value);
  const m = url?.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  return m?.[1] ? `@${m[1]}` : null;
}

// --- Vues ---------------------------------------------------------------------------------------------------

export type ProviderPhotoView = { id: string; url: string };

/** Vitrine d'un prestataire (lot 46, `s-vitrine`) : métiers, menu avec prix, besoins sur place, rayon. */
export type ProviderVitrine = {
  /** Métiers cochés (le métier principal `type` en tête). */
  trades: VendorTypeCode[];
  tagline: string | null;
  teamSize: number | null;
  menu: MenuItem[];
  /** Prix le plus bas et le plus haut (« De 4 à 11 € »), `null` sans menu. */
  menuRange: { min: number; max: number } | null;
  powerNeed: ProviderPower | null;
  frontageM: number | null;
  waterNeed: boolean | null;
  radiusKm: number;
};

/** Le profil vu par son propriétaire. */
export type ProviderProfileView = ProviderVitrine & {
  id: string;
  type: VendorTypeCode;
  customType: string | null;
  typeLabel: string;
  name: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  portfolioUrl: string | null;
  departments: string[];
  photos: ProviderPhotoView[];
  /** Vitrine (lot 46) ; `menuText` = le menu remis en texte pour le champ de saisie. */
  menuText: string;
  /** Fiche pro liée (stand d'un pro). */
  proProfileId: string | null;
  proSlug: string | null;
  /** Ce qui manque pour candidater (`null` = complet). */
  issue: string | null;
  createdAt: string;
};

/** `GET /providers/:id` (connectés) : jamais le téléphone ni l'e-mail. */
export type ProviderPublic = ProviderVitrine & {
  id: string;
  type: VendorTypeCode;
  typeLabel: string;
  name: string;
  description: string | null;
  website: string | null;
  instagram: string | null;
  portfolioUrl: string | null;
  departments: string[];
  photos: ProviderPhotoView[];
  proSlug: string | null;
};

/** Ce que l'organisateur voit d'un prestataire dans le tri. Coordonnées : organisateur seulement. */
export type ProviderForTriage = ProviderPublic & {
  phone: string | null;
  email: string | null;
  accreditedMedia: boolean;
  /** Lot 46 : mission à laquelle la candidature répond, emplacement attribué, avis déjà donné. */
  need: { id: string; trade: VendorTypeCode; tradeLabel: string } | null;
  spot: { label: string; note: string | null } | null;
  review: { rating: number; comment: string | null; createdAt: string } | null;
};

export type ProviderEventBrief = {
  id: string;
  slug: string;
  title: string;
  format: EventFormat;
  startsAt: string;
  endsAt: string;
  city: string | null;
  status: "draft" | "published" | "cancelled";
};

/** Une candidature de prestataire vue par lui. */
export type ProviderApplicationView = {
  id: string;
  status: ApplicationStatus;
  accreditedMedia: boolean;
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
  waitlistRank: number | null;
  refusalNote: string | null;
  event: ProviderEventBrief;
  /** Entrée enregistrée au jour J. */
  checkedInAt: string | null;
  /** Peut se désister (pas terminée). */
  canWithdraw: boolean;
  /** Lot 46 : la mission à laquelle elle répond. */
  need: EventNeedView | null;
  /** Emplacement attribué (retenue seulement) : « B2 » et la note de l'organisateur. */
  spot: { label: string; note: string | null } | null;
  /** Arrivée et installation (celle de la mission), électricité fournie. */
  installAt: string | null;
  power: ProviderPower | null;
  /** Consignes de l'événement (retenue seulement). */
  instructions: string | null;
  /** Avis de l'organisateur après l'événement ; `authorName` : son pseudo (« Compte supprimé » si son compte l'est). */
  review: { rating: number; comment: string | null; createdAt: string; authorName: string } | null;
};

/** Événement ouvert à un type de prestataire (`GET /events/open-to-providers`). */
export type OpenEventForProvider = ProviderEventBrief & {
  department: string | null;
  structureName: string;
  lockAt: string;
  vendorTypes: string[];
  /** Ma candidature active ou la dernière, s'il y en a une. */
  myApplication: { id: string; status: ApplicationStatus } | null;
};

/** « Prestataires présents » sur la fiche d'un événement (retenus). */
export type EventProviderPublic = {
  id: string;
  name: string;
  type: VendorTypeCode;
  typeLabel: string;
  /** Pour les photographes seulement. */
  instagram: string | null;
  photoUrl: string | null;
  proSlug: string | null;
  /** Badge « Média officiel ». */
  accreditedMedia: boolean;
};

/** Un besoin d'un événement (mission) avec ses places comblées. */
export type EventNeedView = {
  id: string;
  trade: VendorTypeCode;
  tradeLabel: string;
  quantity: number;
  /** Candidatures retenues rattachées au besoin. */
  filled: number;
  remaining: number;
  power: ProviderPower;
  water: boolean;
  frontageM: number | null;
  installAt: string | null;
  notes: string | null;
  position: number;
  /** Correctif 53c : clé de création donnée par l'assistant (`null` pour une mission créée sans clé). */
  clientKey?: string | null;
};

/** Une carte de `GET /missions` (`s-missions`). */
export type MissionCard = ProviderEventBrief & {
  department: string | null;
  structureName: string;
  /** Distance au point de départ (km, arrondie), `null` si l'événement n'a pas de position. */
  distanceKm: number | null;
  lockAt: string;
  /** Visiteurs attendus : places de la billetterie Orasso ouverte, `null` sans billetterie ou sans limite. */
  expectedVisitors: number | null;
  /** Les besoins non comblés de ce métier. */
  needs: EventNeedView[];
  /** Ma candidature active ou la dernière, s'il y en a une. */
  myApplication: { id: string; status: ApplicationStatus; needId: string | null } | null;
};

export type MissionsResult = {
  trade: VendorTypeCode;
  radiusKm: number;
  /** Département de départ (`null` : ni zone d'intervention ni `from`, aucune mission). */
  from: string | null;
  items: MissionCard[];
};

/** Un avis d'organisateur, tel que montré sur la vitrine. */
export type ProviderReviewView = {
  id: string;
  rating: number;
  comment: string | null;
  structureName: string;
  eventTitle: string;
  eventEndsAt: string;
  createdAt: string;
};

/** « Avis des organisateurs 4,9 sur 5 · 13 événements » et les 3 derniers. */
export type ProviderReviewsSummary = {
  average: number | null;
  count: number;
  latest: ProviderReviewView[];
};

/** `GET /providers/:id` : la vitrine et ses avis. */
export type ProviderPublicWithReviews = ProviderPublic & { reviews: ProviderReviewsSummary };

/** Ce que cherche un événement (fiche publique, sans les candidats). */
export type EventNeedPublic = Omit<EventNeedView, "filled" | "notes" | "position" | "clientKey">;

/** Candidature retenue sur un besoin, vue par l'organisation (`GET /events/:id/needs`). */
export type NeedRetainedProvider = {
  applicationId: string;
  providerId: string;
  providerName: string;
  spot: { label: string; note: string | null } | null;
  reviewed: boolean;
};

/** Un besoin vu par l'organisation : qui l'occupe. */
export type EventNeedForOrganizer = EventNeedView & { retained: NeedRetainedProvider[] };
