// Média et accréditation presse (lot 45, ARCHITECTURE-DA-V2 § 5.1 ; prototype DA v2 `s-agenda`, `s-accred`,
// `s-contenus`). L'accréditation est une candidature de genre `media` : mêmes statuts, même tri, même pass (badge presse).
import { z } from "zod";

import type { ApplicationStatus } from "../application";
import { departmentSchema, type EventFormat } from "../enums";
import { isoDate, optionalText } from "./common";

/** Adresse web : http ou https seulement (jamais javascript:, data:…). */
const httpUrl = z.url().refine((u) => /^https?:\/\//i.test(u), "Adresse en http ou https");
const emptyToNull = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.literal("").transform(() => null)]).nullish();

/** Ce que le média produit (`s-agenda` : formats ; demande d'accréditation : formats prévus). */
export const mediaFormats = ["photo", "video", "article", "live"] as const;
export type MediaFormat = (typeof mediaFormats)[number];

/** Contenu lié à un événement : un lien (article, vidéo) ou une galerie de photos. */
export const mediaContentKinds = ["link", "gallery"] as const;
export type MediaContentKind = (typeof mediaContentKinds)[number];

export const mediaPlatforms = ["youtube", "instagram", "website", "other"] as const;
export type MediaPlatform = (typeof mediaPlatforms)[number];

export const MEDIA_GALLERY_MAX_PHOTOS = 30;

const formatsSchema = z
  .array(z.enum(mediaFormats))
  .min(1, "Choisis au moins un format")
  .max(mediaFormats.length)
  .refine((f) => new Set(f).size === f.length, "Formats en double");

/**
 * Profil média (`PUT /me/media-profile`). `pressCardNumber` : privé (AS-V6), jamais renvoyé hors du titulaire et de
 * l'administration. `departments` vide = toute la France.
 */
export const mediaProfileSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(60),
  formats: formatsSchema,
  description: optionalText(800),
  website: emptyToNull(httpUrl.max(200)),
  instagram: optionalText(100),
  youtube: emptyToNull(httpUrl.max(200)),
  pressCardNumber: optionalText(40),
  departments: z.array(departmentSchema).max(101).default([]),
});
export type MediaProfileInput = z.infer<typeof mediaProfileSchema>;

/** `POST /me/media-profile/logo` : clé de `POST /me/uploads purpose=media_logo`. */
export const mediaLogoSchema = z.object({ key: z.string().min(1).max(200) });

/**
 * Ce qui manque au profil pour demander une accréditation (`null` = complet) : un nom, au moins un format et un lien
 * (site, Instagram ou YouTube) qui montre le travail du média à l'organisation.
 */
export function mediaProfileIssue(p: {
  name: string;
  formats: readonly string[];
  website: string | null;
  instagram: string | null;
  youtube: string | null;
}): string | null {
  if (p.name.trim().length < 2) return "Indique le nom du média";
  if (!p.formats.length) return "Choisis au moins un format";
  if (!p.website && !p.instagram && !p.youtube) return "Ajoute un lien vers ton travail (site, Instagram ou YouTube)";
  return null;
}

/** `POST /events/:id/accreditations` : formats prévus et message à l'organisation. */
export const accreditationRequestSchema = z.object({
  formats: formatsSchema,
  message: optionalText(500),
});
export type AccreditationRequest = z.infer<typeof accreditationRequestSchema>;

export const accreditationsQuerySchema = z.object({ scope: z.enum(["upcoming", "past", "all"]).default("upcoming") });

/** `PUT /events/:id/press-settings` (organisateur). Sans réglage, l'accréditation est fermée. */
export const pressSettingsSchema = z.object({
  accreditationOpen: z.boolean(),
  quota: z.number().int().min(1).max(500).nullish(),
  deadline: isoDate.nullish(),
  zones: optionalText(500),
  instructions: optionalText(1000),
  contact: optionalText(200),
});
export type PressSettingsInput = z.infer<typeof pressSettingsSchema>;

/** `POST /me/media-contents` : un lien (adresse obligatoire) ou une galerie (au moins une photo envoyée). */
export const mediaContentCreateSchema = z
  .object({
    eventId: z.uuid(),
    kind: z.enum(mediaContentKinds),
    title: z.string().trim().min(2, "Titre trop court").max(80),
    url: emptyToNull(httpUrl.max(500)),
    platform: z.enum(mediaPlatforms).default("other"),
    photoKeys: z.array(z.string().min(1).max(200)).max(MEDIA_GALLERY_MAX_PHOTOS).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "link" && !v.url) ctx.addIssue({ code: "custom", path: ["url"], message: "Adresse du contenu" });
    if (v.kind === "gallery" && !v.photoKeys.length) {
      ctx.addIssue({ code: "custom", path: ["photoKeys"], message: "Ajoute au moins une photo" });
    }
    if (v.kind === "link" && v.photoKeys.length) {
      ctx.addIssue({ code: "custom", path: ["photoKeys"], message: "Un lien n'a pas de photos" });
    }
  });
export type MediaContentCreate = z.infer<typeof mediaContentCreateSchema>;

export const mediaContentUpdateSchema = z.object({
  title: z.string().trim().min(2, "Titre trop court").max(80).optional(),
  url: emptyToNull(httpUrl.max(500)),
  platform: z.enum(mediaPlatforms).optional(),
});
export type MediaContentUpdate = z.infer<typeof mediaContentUpdateSchema>;

export const mediaContentFeatureSchema = z.object({ featured: z.boolean() });

// --- Vues -------------------------------------------------------------------------------------------------------------

/** Profil vu par son titulaire (et l'administration) : seule vue qui porte la carte de presse. */
export type MediaProfileView = {
  id: string;
  name: string;
  formats: MediaFormat[];
  description: string | null;
  website: string | null;
  instagram: string | null;
  youtube: string | null;
  logoUrl: string | null;
  pressCardNumber: string | null;
  pressCardVerifiedAt: string | null;
  departments: string[];
  /** Ce qui manque pour demander une accréditation (`null` = complet). */
  issue: string | null;
  createdAt: string;
};

/** Fiche publique (connectés, organisation) : jamais la carte de presse, seulement « vérifiée ». */
export type MediaPublic = {
  id: string;
  name: string;
  formats: MediaFormat[];
  description: string | null;
  website: string | null;
  instagram: string | null;
  youtube: string | null;
  logoUrl: string | null;
  departments: string[];
  pressCardVerified: boolean;
};

export type MediaEventBrief = {
  id: string;
  slug: string;
  title: string;
  format: EventFormat;
  startsAt: string;
  endsAt: string;
  city: string | null;
  department: string | null;
  structureName: string;
};

/** Réglages presse d'un événement montrés au média accrédité (consignes). */
export type PressBriefing = { zones: string | null; instructions: string | null; contact: string | null };

/** `GET /me/accreditations` : une accréditation du média (`s-accred`). */
export type MediaAccreditationView = {
  id: string;
  status: ApplicationStatus;
  formats: MediaFormat[];
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** Refus : la raison donnée par l'organisation (« Quota presse atteint… »). */
  refusalNote: string | null;
  event: MediaEventBrief;
  /** Badge presse : le pass d'accès (QR par `GET /applications/:id/pass`) ; `null` tant qu'il n'est pas émis. */
  pass: { id: string; valid: boolean } | null;
  /** Consignes de l'organisation : seulement une fois accrédité. */
  briefing: PressBriefing | null;
  /** « Couvert · 3 vidéos · 1 840 vues depuis la page de l'événement ». */
  coverage: { contents: number; views: number };
  canWithdraw: boolean;
};

/** Réglages presse vus par l'organisateur. */
export type PressSettingsView = {
  eventId: string;
  accreditationOpen: boolean;
  quota: number | null;
  deadline: string | null;
  zones: string | null;
  instructions: string | null;
  contact: string | null;
  /** Demandes en attente et accréditations données. */
  counts: { pending: number; accepted: number };
};

/** Demande vue par l'organisation (`GET /events/:id/accreditations`). */
export type AccreditationForOrganizer = {
  id: string;
  status: ApplicationStatus;
  formats: MediaFormat[];
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
  refusalNote: string | null;
  media: MediaPublic;
  /** Contenus publiés par ce média sur l'événement. */
  contents: MediaContentView[];
};

export type MediaContentView = {
  id: string;
  eventId: string;
  event: { id: string; slug: string; title: string; startsAt: string };
  kind: MediaContentKind;
  title: string;
  url: string | null;
  platform: MediaPlatform;
  photos: { key: string; url: string }[];
  featured: boolean;
  views: number;
  publishedAt: string;
  media: { id: string; name: string; logoUrl: string | null };
};

/** `GET /me/media/agenda` : accréditations et événements gardés, semaine par semaine (`s-agenda`, « Mon agenda »). */
export type MediaAgenda = {
  weeks: {
    /** Lundi de la semaine, date locale de Paris `AAAA-MM-JJ`. */
    weekStart: string;
    items: {
      event: MediaEventBrief;
      accreditation: { id: string; status: ApplicationStatus } | null;
      saved: boolean;
      accreditationOpen: boolean;
    }[];
  }[];
};

/** État de l'accréditation sur une carte d'événement (Explorer du média). */
export type EventAccreditationState = { open: boolean; mine: ApplicationStatus | null };
