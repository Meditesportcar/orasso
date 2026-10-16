// Prestataires : profil, candidatures, accréditation, présence sur la fiche d'un événement
// (docs/01 « Prestataires », ARCHITECTURE-SUITE § 6, lot 21).
import { z } from "zod";

import type { ApplicationStatus } from "../application";
import { departmentSchema, type EventFormat } from "../enums";
import { type VendorTypeCode, vendorTypeCodes } from "../provider";
import { optionalText } from "./common";

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
  })
  .superRefine((v, ctx) => {
    if (v.type === "other" && !v.customType) {
      ctx.addIssue({ code: "custom", path: ["customType"], message: "Précise ton activité" });
    }
  });
export type ProviderProfileInput = z.infer<typeof providerProfileSchema>;

export const providerPhotoOrderSchema = z.object({ photoIds: z.array(z.uuid()).max(16) });

/** Candidature d'un prestataire : message facultatif, règlement accepté. */
export const providerApplicationCreateSchema = z.object({
  rulesAccepted: z.literal(true),
  message: optionalText(300),
});
export type ProviderApplicationCreate = z.infer<typeof providerApplicationCreateSchema>;

export const accreditationSchema = z.object({ accredited: z.boolean() });

export const providerApplicationsQuerySchema = z.object({ scope: z.enum(["upcoming", "past"]).default("upcoming") });

export const openToProvidersQuerySchema = z.object({
  /** Type de prestataire ; par défaut, celui de mon profil. */
  type: z.enum(vendorTypeCodes).optional(),
});

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

/** Le profil vu par son propriétaire. */
export type ProviderProfileView = {
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
  /** Fiche pro liée (stand d'un pro). */
  proProfileId: string | null;
  proSlug: string | null;
  /** Ce qui manque pour candidater (`null` = complet). */
  issue: string | null;
  createdAt: string;
};

/** `GET /providers/:id` (connectés) : jamais le téléphone ni l'e-mail. */
export type ProviderPublic = {
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
