import { z } from "zod";
import { type VehicleStatus, type VehicleType, vehicleStatuses, vehicleTypes } from "../enums";
import type { CategoryFamily, CategoryIcon } from "../rules/styles";
import { optionalText } from "./common";
import type { PlateTransferInfo, VehicleCertification } from "./garage";

const currentYear = new Date().getUTCFullYear();

/**
 * Fiche technique en saisie libre (décision de Damien du 23/10, lot M1, tour 2 : pas de catalogue des motorisations,
 * le propriétaire connaît sa voiture, préparation comprise). Les trois champs sont facultatifs.
 */
export const VEHICLE_ENGINE_MAX = 60;
export const VEHICLE_POWER_MIN = 1;
export const VEHICLE_POWER_MAX = 2000;
export const VEHICLE_WEIGHT_MIN = 50;
export const VEHICLE_WEIGHT_MAX = 10000;

const vehicleFields = z.object({
  vehicleType: z.enum(vehicleTypes),
  makeId: z.uuid(),
  modelId: z.uuid(),
  generationId: z.uuid().nullish(),
  year: z
    .number()
    .int()
    .min(1885)
    .max(currentYear + 1)
    .nullish(),
  color: optionalText(40),
  engine: optionalText(VEHICLE_ENGINE_MAX),
  powerHp: z.number().int().min(VEHICLE_POWER_MIN).max(VEHICLE_POWER_MAX).nullish(),
  weightKg: z.number().int().min(VEHICLE_WEIGHT_MIN).max(VEHICLE_WEIGHT_MAX).nullish(),
  /** Format libre (plaques étrangères ou anciennes). */
  plate: optionalText(20),
  unregistered: z.boolean().default(false),
  status: z.enum(vehicleStatuses).default("active"),
  /** Motif du passage en archive (vendu, souvenir, accidenté). */
  statusNote: optionalText(300),
  description: optionalText(2000),
  preparation: optionalText(2000),
  categoryIds: z.array(z.uuid()).max(10).default([]),
  /**
   * Lot R4a (maquette R4.8) : marque et modèle tapés quand ils ne sont pas dans la liste. Gardés seulement avec le
   * niveau « Autre » correspondant, nettoyés (`cleanProposedName`, 40 caractères au plus) par l'API.
   */
  proposedMake: optionalText(80),
  proposedModel: optionalText(80),
  /**
   * Lot R4e : version (« CC », « SW », « GTI », « Phase 2 »), facultative, nettoyée par l'API (`cleanVehicleVersion`,
   * 30 caractères au plus). Vaut aussi pour un modèle de la liste ; la changer ne fait pas perdre la certification.
   */
  version: optionalText(60),
});

/** Plaque obligatoire pour un véhicule actif, sauf « non immatriculé » (docs/01 « Véhicules et garage »). */
export function vehiclePlateIssue(v: {
  status?: VehicleStatus;
  unregistered?: boolean;
  plate?: string | null;
}): string | null {
  if (v.unregistered && v.plate) return "Pas de plaque pour un véhicule non immatriculé";
  if ((v.status ?? "active") === "active" && !v.unregistered && !v.plate) return "Plaque obligatoire";
  return null;
}

function plateRule(v: Parameters<typeof vehiclePlateIssue>[0], ctx: z.RefinementCtx) {
  const message = vehiclePlateIssue(v);
  if (message) ctx.addIssue({ code: "custom", path: ["plate"], message });
}

/**
 * Création. Lot M1, tour 2 : `clientKey` facultative, tirée par l'appli à l'ouverture de l'ajout : la même clé renvoie
 * le véhicule déjà créé (« Reprendre » après une réponse perdue ne crée pas de doublon).
 */
export const vehicleCreateSchema = vehicleFields
  .extend({
    clientKey: z.uuid().optional(),
    /**
     * Lot R5a : styles proposés pendant l'ajout (« Il manque un style ? Propose-le »), envoyés avant que le véhicule
     * existe ; ils lui sont rattachés à sa création (posés dessus s'ils sont retenus).
     */
    styleProposalIds: z.array(z.uuid()).max(5).optional(),
  })
  .superRefine(plateRule);
export type VehicleCreate = z.infer<typeof vehicleCreateSchema>;

/** Mise à jour partielle ; la règle de plaque est revérifiée par le service sur la fiche complète. */
export const vehicleUpdateSchema = vehicleFields.partial().extend({
  unregistered: z.boolean().optional(),
  status: z.enum(vehicleStatuses).optional(),
  categoryIds: z.array(z.uuid()).max(10).optional(),
});
export type VehicleUpdate = z.infer<typeof vehicleUpdateSchema>;

export const photoOrderSchema = z.object({ photoIds: z.array(z.uuid()).min(1).max(8) });

/**
 * Floutage de plaque (lot 51) : rectangles normalisés 0–1 par rapport à la photo telle qu'elle est stockée (après
 * recadrage et orientation), 4 au plus par photo. Un rectangle qui sort de l'image est refusé (400).
 * Lot 59c : `angle` facultatif, en degrés (−90 à 90), rotation du cadre autour de son centre dans le repère de la photo
 * en pixels (plaque penchée) ; absent ou 0 = cadre droit.
 */
export const MAX_PLATE_RECTS = 4;
const PLATE_EPSILON = 1e-6;
export const plateRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0.01).max(1),
    h: z.number().min(0.01).max(1),
    angle: z.number().min(-90).max(90).optional(),
  })
  .refine((r) => r.x + r.w <= 1 + PLATE_EPSILON && r.y + r.h <= 1 + PLATE_EPSILON, {
    message: "Le cadre de la plaque sort de la photo",
  });
export type PlateRect = z.infer<typeof plateRectSchema>;
export const plateRectsSchema = z.array(plateRectSchema).min(1).max(MAX_PLATE_RECTS);
export const photoBlurSchema = z.object({ rects: plateRectsSchema });
export type PhotoBlur = z.infer<typeof photoBlurSchema>;

export type VehiclePhoto = {
  id: string;
  position: number;
  url: string;
  width: number;
  height: number;
  /** Une plaque a été floutée sur cette photo (pastille « Plaque floutée »). */
  plateBlurred: boolean;
};
export type CategoryRef = {
  id: string;
  slug: string;
  label: string;
  /** Lot R5a (fiche du propriétaire) : famille et icône du style ; en pause (plus proposé, gardé sur la fiche). */
  family?: CategoryFamily;
  icon?: CategoryIcon;
  paused?: boolean;
};

/** Fiche visible des autres utilisateurs connectés : jamais de plaque. */
export type VehiclePublic = {
  id: string;
  /** « BMW Série 3 E36 » : ne se tronque jamais à l'affichage. */
  label: string;
  vehicleType: VehicleType;
  makeId: string;
  makeName: string;
  modelId: string;
  modelName: string;
  generationId: string | null;
  generationName: string | null;
  /** Lot R4e : version (« GTI »), affichée après le modèle et la génération ; null sans version. */
  version: string | null;
  country: string | null;
  year: number | null;
  color: string | null;
  engine: string | null;
  powerHp: number | null;
  weightKg: number | null;
  description: string | null;
  preparation: string | null;
  categories: CategoryRef[];
  photos: VehiclePhoto[];
  status: VehicleStatus;
  certified: boolean;
  /** Prix du public remportés avec ce véhicule (lot 50 : badge de la carte du garage). */
  audiencePrizes: number;
};

/** Fiche du propriétaire et de l'organisateur : avec la plaque. */
export type VehicleFull = VehiclePublic & {
  plate: string | null;
  unregistered: boolean;
  archivedAt: string | null;
  statusNote: string | null;
  /** Change quand la fiche ou ses photos changent : à ajouter (`?v=`) à l'adresse de la fiche Instagram (cache du navigateur). */
  shareVersion: string;
  /** Plaque déjà prise : demande de transfert en cours (le véhicule ne peut pas candidater). */
  plateTransfer: PlateTransferInfo | null;
  /**
   * Lot R4a : marque et modèle tapés, en attente de la liste Orasso (« à ajouter à la liste », pour le propriétaire
   * seulement : jamais sur la fiche publique).
   */
  proposedMake: string | null;
  proposedModel: string | null;
};

/** Page du véhicule (propriétaire) : fiche, plus l'état de la certification. */
export type VehicleDetail = VehicleFull & { certification: VehicleCertification };

/** Fiche réduite d'un compte privé : marque et modèle seulement. */
export type VehicleBrief = Pick<VehiclePublic, "id" | "label" | "makeName" | "modelName" | "vehicleType"> & {
  photoUrl: string | null;
};

/**
 * Lot R4b : la voiture d'un compte privé vue par un autre (plateau, `GET /vehicles/:id`), d'après
 * `privateVehicleFields` : photo (plaque masquée), marque, modèle, génération, catégories, rien d'autre.
 */
export type VehiclePrivate = VehicleBrief & Pick<VehiclePublic, "generationName" | "categories">;

export type VehicleMake = {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  isOther: boolean;
  /**
   * Lot R5a : les types de ses modèles de la liste (Honda : voiture et moto). Absent d'une réponse ancienne (cache) :
   * la marque vaut pour tous les types.
   */
  vehicleTypes?: VehicleType[];
};

/** Lot R5a : les marques d'un type (celles qui ont au moins un modèle de ce type), « Autre » toujours gardée. */
export const makesForType = <T extends Pick<VehicleMake, "isOther" | "vehicleTypes">>(
  rows: readonly T[],
  type: VehicleType,
): T[] => rows.filter((m) => m.isOther || !m.vehicleTypes || m.vehicleTypes.includes(type));
export type VehicleModel = { id: string; makeId: string; name: string; vehicleType: VehicleType; isOther: boolean };
export type VehicleGeneration = {
  id: string;
  modelId: string;
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
  isOther: boolean;
};
export type Category = CategoryRef & { minVehicleAge: number | null };
