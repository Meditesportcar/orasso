// Accueil complet (lot 30) : réglage des widgets, paramètres de `GET /me/home`, emplacements sponsorisés.
import { z } from "zod";

import { departmentSchema } from "../enums";
import { HOME_RADIUS, homeWidgetIds } from "../home";
import { personaKinds } from "./profile";

const widgetId = z.enum(homeWidgetIds);

/**
 * Widgets de l'accueil enregistrés dans `profiles.home_widgets` (posé borné au lot 15, précisé au lot 30) : un ordre et
 * une liste de widgets masqués, rien d'autre. Chaque liste est bornée au nombre de widgets : aucun champ libre.
 */
export const homeWidgetsSchema = z
  .object({
    order: z.array(widgetId).max(homeWidgetIds.length),
    hidden: z.array(widgetId).max(homeWidgetIds.length),
  })
  .strict();
export type HomeWidgets = z.infer<typeof homeWidgetsSchema>;

/** `PUT /me/home/widgets`. */
export const homeWidgetsPutSchema = homeWidgetsSchema;

/**
 * `GET /me/home` : `radiusKm` règle le rayon des suggestions (et l'enregistre dans le profil) ; `lat` et `lng` sont la
 * position de l'appareil pour cette requête seulement (« Utiliser ma position »), ramenée au dixième de degré par le
 * serveur et jamais enregistrée.
 */
export const homeQuerySchema = z
  .object({
    radiusKm: z.coerce.number().int().min(HOME_RADIUS.min).max(HOME_RADIUS.max).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    /** Lot 43 : la casquette dont on veut l'accueil (la casquette active de l'appli). */
    persona: z.enum(personaKinds).optional(),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), "lat et lng vont ensemble");
export type HomeQuery = z.infer<typeof homeQuerySchema>;

// --- Emplacements sponsorisés (administration, routes posées au lot 30, page au lot 33) ----------------------------

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date AAAA-MM-JJ");

export const placementStatuses = ["draft", "active", "paused", "ended"] as const;

/** Lien d'un emplacement : http(s) uniquement, jamais `javascript:` ni un schéma de l'appareil. */
const httpUrl = z
  .url({ protocol: /^https?$/ })
  .max(500)
  .refine((u) => !/\s/.test(u), "Lien invalide");

export const sponsoredPlacementCreateSchema = z
  .object({
    proProfileId: z.uuid(),
    title: z.string().trim().min(1).max(60),
    body: z.string().trim().min(1).max(160),
    linkUrl: httpUrl,
    departments: z.array(departmentSchema).max(20).default([]),
    categoryIds: z.array(z.uuid()).max(30).default([]),
    startsOn: isoDay,
    endsOn: isoDay,
    dailyCap: z.number().int().min(1).max(100000).nullable().default(null),
    priceCents: z.number().int().min(0).max(1_000_000).optional(),
    status: z.enum(placementStatuses).default("draft"),
  })
  .refine((p) => p.startsOn <= p.endsOn, "La fin doit suivre le début");
export type SponsoredPlacementCreate = z.infer<typeof sponsoredPlacementCreateSchema>;

export const sponsoredPlacementUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    body: z.string().trim().min(1).max(160),
    linkUrl: httpUrl,
    departments: z.array(departmentSchema).max(20),
    categoryIds: z.array(z.uuid()).max(30),
    startsOn: isoDay,
    endsOn: isoDay,
    dailyCap: z.number().int().min(1).max(100000).nullable(),
    priceCents: z.number().int().min(0).max(1_000_000),
    status: z.enum(placementStatuses),
  })
  .partial()
  .refine((o) => Object.values(o).some((v) => v !== undefined), "Rien à modifier");
export type SponsoredPlacementUpdate = z.infer<typeof sponsoredPlacementUpdateSchema>;

/** Un emplacement vu par l'administration. */
export type SponsoredPlacementAdmin = {
  id: string;
  proProfileId: string;
  proName: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string;
  departments: string[];
  categoryIds: string[];
  startsOn: string;
  endsOn: string;
  dailyCap: number | null;
  priceCents: number;
  status: (typeof placementStatuses)[number];
  impressions: number;
  clicks: number;
};
