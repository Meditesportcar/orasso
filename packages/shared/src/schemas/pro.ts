// Professionnels : fiche, remises par grade, publications, statistiques (docs/01 « Professionnels », lot 14).
import { z } from "zod";

import { departmentSchema } from "../enums";
import { type Grade, gradeSchema } from "../grades";
import {
  PRO_DISCOUNT_MAX_PERCENT,
  type ProActivity,
  type ProDiscounts,
  type ProSubscriptionState,
  type ProVisibility,
  proActivities,
  type Weekday,
  weekdays,
} from "../rules/pro";
import { optionalText } from "./common";
import type { RegistryCheck } from "./structure";

/** Adresse web : http ou https seulement (jamais javascript:, data:…). */
const httpUrl = z.url().refine((u) => /^https?:\/\//i.test(u), "Adresse en http ou https");

const socialsSchema = z
  .object({
    instagram: httpUrl.max(200).nullish(),
    facebook: httpUrl.max(200).nullish(),
    tiktok: httpUrl.max(200).nullish(),
    youtube: httpUrl.max(200).nullish(),
  })
  .partial();

/** Horaires : un texte libre par jour (« 9h-12h / 14h-18h »), vide = fermé. */
export const proHoursSchema = z.partialRecord(z.enum(weekdays), z.string().trim().max(60).nullish());
export type ProHours = Partial<Record<Weekday, string | null | undefined>>;

const proFields = z.object({
  name: z.string().trim().min(2).max(80),
  activities: z.array(z.enum(proActivities)).min(1, "Choisis au moins une activité").max(6),
  description: optionalText(2000),
  addressLine: optionalText(200),
  postalCode: optionalText(10),
  city: optionalText(80),
  department: departmentSchema.nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  /** Pros sans local ou à domicile : départements d'intervention. */
  interventionDepartments: z.array(departmentSchema).max(20),
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
  website: httpUrl
    .max(200)
    .nullish()
    .or(z.literal("").transform(() => null)),
  socials: socialsSchema,
  hours: proHoursSchema,
});

export const proCreateSchema = proFields.extend({
  interventionDepartments: proFields.shape.interventionDepartments.default([]),
  socials: proFields.shape.socials.default({}),
  hours: proFields.shape.hours.default({}),
});
export type ProCreate = z.infer<typeof proCreateSchema>;

export const proUpdateSchema = proFields.partial();
export type ProUpdate = z.infer<typeof proUpdateSchema>;

/** Remises par grade : pourcentage entier de 1 à `PRO_DISCOUNT_MAX_PERCENT`, `null` ou absent = pas de remise. */
export const proDiscountsSchema = z.object({
  discounts: z.partialRecord(gradeSchema, z.number().int().min(1).max(PRO_DISCOUNT_MAX_PERCENT).nullable()),
});
export type ProDiscountsInput = z.infer<typeof proDiscountsSchema>;

export const proPostCreateSchema = z.object({
  title: z.string().trim().min(2, "Titre trop court").max(80),
  body: z.string().trim().min(2, "Texte trop court").max(1000),
});
export type ProPostCreate = z.infer<typeof proPostCreateSchema>;

export const proTrackSchema = z.object({ kind: z.enum(["view", "call", "route"]) });
export type ProTrackKind = z.infer<typeof proTrackSchema>["kind"];

export const proPublishSchema = z.object({ published: z.boolean() });

export const proPartnerRequestSchema = z.object({ structureSlug: z.string().trim().min(1).max(120) });

export const proListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.string().max(200).optional(),
  q: z.string().trim().max(80).optional(),
  activity: z.enum(proActivities).optional(),
  department: departmentSchema.optional(),
  /** Lot 29 : `name` (défaut, vérifiés d'abord) ou `distance` (position envoyée ou secteur du profil). */
  sort: z.enum(["name", "distance"]).default("name"),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(500).optional(),
});
export type ProListQuery = z.infer<typeof proListQuery>;

// --- Vues ---------------------------------------------------------------------------------------------------

export type ProCard = {
  slug: string;
  name: string;
  logoUrl: string | null;
  activities: ProActivity[];
  city: string | null;
  department: string | null;
  lat: number | null;
  lng: number | null;
  /** Zone d'intervention (pros sans local) : affichée quand il n'y a pas d'adresse. */
  interventionDepartments: string[];
  verified: boolean;
  /** Raison sociale du registre, affichée à côté du badge « Pro vérifié » (`null` sans badge). */
  registryName: string | null;
  followersCount: number;
  /** Distance à ma position (lot 29), seulement quand la requête en a une et que la fiche a une adresse. */
  distanceKm?: number | null;
};

export type ProPartner = { slug: string; name: string; logoUrl: string | null; city: string | null };

export type ProPostView = { id: string; title: string; body: string; createdAt: string };

export type ProPhotoView = { id: string; url: string };

export type ProPublic = ProCard & {
  id: string;
  /** Visible dans l'annuaire (faux : brouillon, vu par son propriétaire seulement). */
  published: boolean;
  description: string | null;
  addressLine: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  socials: Record<string, string | null | undefined>;
  hours: ProHours;
  photos: ProPhotoView[];
  /** Remises par grade (pourcentage entier). */
  discounts: ProDiscounts;
  /** Organisateurs dont le pro est partenaire (liens acceptés par l'organisateur). */
  partners: ProPartner[];
  postsCount: number;
  /** Publications : visibles par les abonnés (et par le pro) seulement ; `null` pour les autres. */
  posts: ProPostView[] | null;
  isFollowing: boolean | null;
  isOwner: boolean;
};

export type ProStatsDay = { day: string; views: number; calls: number; routes: number; discounts: number };

export type ProStats = {
  days: number;
  views: number;
  calls: number;
  routes: number;
  followers: number;
  /** Remises utilisées (scans du QR de compte validés). */
  discounts: number;
  discountsByGrade: Partial<Record<Grade, number>>;
  series: ProStatsDay[];
};

export type ProPartnerLink = {
  structureSlug: string;
  structureName: string;
  logoUrl: string | null;
  status: "pending" | "accepted";
};

/** Fiche pro vue par son propriétaire : tout ce qu'il peut modifier, l'état de l'abonnement et le compteur du mois. */
export type ProOwner = ProPublic & {
  siret: string | null;
  registryCheck: RegistryCheck | null;
  verifiedAt: string | null;
  /** Peut être publiée : nom, activité, adresse ou zone d'intervention. */
  canPublish: boolean;
  publishBlockedReason: string | null;
  subscription: ProSubscriptionState;
  /** Fiche complète ou « fiche de base » après le 21/06/2027 sans abonnement actif (lot 21). */
  visibility: ProVisibility;
  postsUsed: number;
  postsLimit: number;
  postsRemaining: number;
  partnerLinks: ProPartnerLink[];
};

/** Un lien de partenariat vu par l'organisateur. */
export type StructurePartnerRow = {
  proSlug: string;
  proName: string;
  logoUrl: string | null;
  status: "pending" | "accepted";
};
