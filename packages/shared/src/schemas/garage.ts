// Garage et certification (lot 31) : entrées validées et types de sortie des nouvelles routes.
import { z } from "zod";
import { type PlateTransferStatus, vehicleTypes } from "../enums";
import {
  type CategoryMakeMode,
  type CertificationLostReason,
  type CertificationStatus,
  SHARE_MAX_MASKS,
  shareFormats,
  shareStyles,
} from "../garage";
import type { Grade } from "../grades";
import type { CategoryRefusal, CertificationFields, CertificationMissing } from "../rules/garage";
import { optionalText } from "./common";
import { type PlateRect, plateRectSchema } from "./vehicle";

/** `GET /vehicle-reference/categories?makeId&vehicleType&year` : chaque catégorie avec son éligibilité. */
export const categoryReferenceQuery = z.object({
  makeId: z.uuid().optional(),
  vehicleType: z.enum(vehicleTypes).optional(),
  year: z.coerce.number().int().min(1885).max(2200).optional(),
});
export type CategoryReferenceQuery = z.infer<typeof categoryReferenceQuery>;

/**
 * Zones à masquer sur l'affiche composée (filet de sécurité, lot M6) : « x,y,l,h[,angle] » séparés par « ; », fractions
 * de l'image (0 à 1, comme les cadres de plaque `plateRectSchema`), angle en degrés. Rien d'invalide ne passe : une
 * zone illisible fait refuser la requête.
 */
export function parseShareMasks(raw: string): PlateRect[] | null {
  const out: PlateRect[] = [];
  for (const part of raw.split(";").filter(Boolean)) {
    const [x, y, w, h, angle, ...rest] = part.split(",").map((s) => (s.trim() === "" ? Number.NaN : Number(s)));
    if (rest.length) return null;
    const parsed = plateRectSchema.safeParse({ x, y, w, h, ...(angle !== undefined ? { angle } : {}) });
    if (!parsed.success) return null;
    out.push(parsed.data);
  }
  return out.length <= SHARE_MAX_MASKS ? out : null;
}

/** L'inverse de `parseShareMasks` (l'appli l'envoie dans l'adresse de l'affiche). */
export const formatShareMasks = (rects: readonly PlateRect[]): string =>
  rects
    .slice(0, SHARE_MAX_MASKS)
    .map((r) =>
      [r.x, r.y, r.w, r.h, ...(r.angle ? [r.angle] : [])].map((n) => Number(n.toFixed(4)).toString()).join(","),
    )
    .join(";");

/**
 * `download=1` : l'image est servie en pièce jointe (téléchargement depuis le site) au lieu de s'afficher. `masks` :
 * zones à flouter sur l'affiche composée (plaque re-détectée par l'appli avant le partage).
 */
export const shareImageQuery = z.object({
  format: z.enum(shareFormats).default("story"),
  /** Style de l'affiche (lot 50) : story et post (lot M6). */
  style: z.enum(shareStyles).default("night"),
  download: z.literal("1").optional(),
  masks: z
    .string()
    .max(400)
    .optional()
    .transform((v, ctx) => {
      if (!v) return [];
      const rects = parseShareMasks(v);
      if (!rects) {
        ctx.addIssue({ code: "custom", message: "Zones à masquer invalides" });
        return z.NEVER;
      }
      return rects;
    }),
});

export const certificationRequestSchema = z.object({ message: optionalText(500) });

/** Décision de l'équipe Orasso (certification ou transfert de plaque). */
export const adminDecisionSchema = z.object({
  decision: z.enum(["accept", "refuse"]),
  note: optionalText(500),
});
export type AdminDecision = z.infer<typeof adminDecisionSchema>;

export type CategoryOption = {
  id: string;
  slug: string;
  label: string;
  minVehicleAge: number | null;
  allowedVehicleTypes: string[] | null;
  allowedCountries: string[] | null;
  makeMode: CategoryMakeMode;
  eligible: boolean;
  refusal: CategoryRefusal | null;
  /** Libellé français de la raison, quand la catégorie est grisée. */
  reason: string | null;
};

export type PlateTransferInfo = {
  id: string;
  status: PlateTransferStatus;
  /** Date de la demande (ISO) ; l'arbitrage a lieu 7 jours après. */
  createdAt: string;
};

export type VehicleCertification = {
  certified: boolean;
  certifiedAt: string | null;
  lostReason: CertificationLostReason | null;
  /** Dernière demande, quelle que soit son issue. */
  request: {
    id: string;
    status: CertificationStatus;
    createdAt: string;
    decidedAt: string | null;
    note: string | null;
  } | null;
  grade: Grade;
  eligible: boolean;
  missing: CertificationMissing[];
};

export type VehicleHistoryItem = {
  applicationId: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  startsAt: string;
  status: string;
  /** Entrée enregistrée sur place. */
  attended: boolean;
};

/** Demande de transfert vue par l'ancien propriétaire (sa plaque) ou par le demandeur. */
export type PlateTransferView = {
  id: string;
  status: PlateTransferStatus;
  createdAt: string;
  /** Plaque telle que saisie par le demandeur : visible de l'ancien propriétaire seulement. */
  plate: string | null;
  requesterPseudo: string;
  /** Mon véhicule qui porte la plaque. */
  holderVehicleId: string;
  holderVehicleLabel: string;
  /** Le véhicule créé par le demandeur. */
  requesterVehicleLabel: string | null;
  /** Échéance de la réponse de l'ancien propriétaire (ISO). */
  answerBy: string;
  note: string | null;
};

/** Demande vue par le demandeur : rien de l'ancien propriétaire (ni véhicule, ni plaque), seulement son propre véhicule. */
export type OutgoingPlateTransferView = {
  id: string;
  status: PlateTransferStatus;
  createdAt: string;
  answerBy: string;
  note: string | null;
  requesterVehicleLabel: string | null;
};

export type AdminPlateTransfer = PlateTransferView & {
  requesterId: string;
  holderPseudo: string;
  requesterVehicleId: string | null;
};

export type AdminCertificationRequest = {
  id: string;
  status: CertificationStatus;
  createdAt: string;
  decidedAt: string | null;
  note: string | null;
  message: string | null;
  userId: string;
  pseudo: string;
  grade: Grade;
  vehicleId: string;
  vehicleLabel: string;
  snapshot: CertificationSnapshot;
};

/** Fiche du véhicule au moment de la demande (ce que l'équipe a examiné). */
export type CertificationSnapshot = {
  label: string;
  year: number | null;
  engine: string | null;
  powerHp: number | null;
  weightKg: number | null;
  description: string | null;
  preparation: string | null;
  categories: string[];
  photoUrls: string[];
  /** Champs surveillés au moment de la demande : comparés à la fiche actuelle avant toute validation. */
  fields?: CertificationFields;
};
