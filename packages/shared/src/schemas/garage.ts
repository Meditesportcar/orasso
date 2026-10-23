// Garage et certification (lot 31) : entrées validées et types de sortie des nouvelles routes.
import { z } from "zod";
import { type PlateTransferStatus, vehicleTypes } from "../enums";
import {
  type CategoryMakeMode,
  type CertificationLostReason,
  type CertificationStatus,
  shareFormats,
  shareStyles,
} from "../garage";
import type { Grade } from "../grades";
import type { HomeSponsored } from "../home";
import type { CategoryRefusal, CertificationFields, CertificationMissing } from "../rules/garage";
import type { ProActivity } from "../rules/pro";
import { optionalText } from "./common";

/** `GET /vehicle-reference/categories?makeId&vehicleType&year` : chaque catégorie avec son éligibilité. */
export const categoryReferenceQuery = z.object({
  makeId: z.uuid().optional(),
  vehicleType: z.enum(vehicleTypes).optional(),
  year: z.coerce.number().int().min(1885).max(2200).optional(),
});
export type CategoryReferenceQuery = z.infer<typeof categoryReferenceQuery>;

/** `download=1` : l'image est servie en pièce jointe (téléchargement depuis le site) au lieu de s'afficher. */
export const shareImageQuery = z.object({
  format: z.enum(shareFormats).default("story"),
  /** Style de la story (lot 50) ; sans effet sur la publication 1:1. */
  style: z.enum(shareStyles).default("night"),
  download: z.literal("1").optional(),
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

/**
 * « Pour ta … » du Garage (lot M5, maquette 7.1) : `GET /me/vehicles/:id/pros`. Le sponsorisé est un emplacement ciblé
 * sur une catégorie du véhicule (jamais un emplacement ouvert à tous), compté comme celui de l'Accueil : seulement
 * quand l'API le renvoie. Les pros partenaires (qui accordent une remise aux membres) sont les plus proches.
 */
export type VehiclePro = {
  slug: string;
  name: string;
  logoUrl: string | null;
  activities: ProActivity[];
  city: string | null;
  /** Distance au secteur de la personne ; `null` sans adresse. */
  distanceKm: number | null;
  /** Remise à montrer : celle du grade de la personne, sinon celle du grade au-dessus (`from`). */
  discount: { percent: number; from: Grade | null } | null;
};

export type VehiclePros = {
  vehicleId: string;
  /** À compter par `POST /sponsored/:id/impression` quand il apparaît à l'écran (lot M5, tour 2). */
  sponsored: (HomeSponsored & { discount: VehiclePro["discount"]; city: string | null }) | null;
  pros: VehiclePro[];
  /** Aucun secteur connu : pas de liste ; l'écran invite à choisir son coin. */
  needsPlace: boolean;
};
