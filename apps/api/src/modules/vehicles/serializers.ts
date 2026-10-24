// Sérialiseurs par audience (ARCHITECTURE.md § 5.2) : la plaque ne sort que pour le propriétaire et l'organisateur.
import {
  formatPlate,
  maskedPhoto,
  maskedPhotos,
  type VehicleBrief,
  type VehicleFull,
  type VehiclePrivate,
  type VehiclePublic,
} from "@orasso/shared";

import { storage } from "../../lib/storage";
import type { VehicleWithAll } from "./repo";

/** « BMW Série 3 E36 » ; la génération « Autre » n'apparaît pas. */
export function vehicleLabel(v: Pick<VehicleWithAll, "make" | "model" | "generation">): string {
  const parts = [v.make.isOther ? null : v.make.name, v.model.isOther ? null : v.model.name];
  if (v.generation && !v.generation.isOther) parts.push(v.generation.name);
  const label = parts.filter(Boolean).join(" ");
  return label || "Autre véhicule";
}

/**
 * Fiche d'un véhicule vue par un autre (compte public ou ami). Vague R4, après fusion : seules les photos dont la plaque
 * est floutée ou « aucune plaque visible » confirmée sortent (toutes pour un véhicule non immatriculé). Le propriétaire
 * et l'organisation passent par `vehicleFull`, qui garde toutes les photos.
 */
export function vehiclePublic(v: VehicleWithAll): VehiclePublic {
  return vehicleView(v, maskedPhotos(v.photos, v.unregistered));
}

function vehicleView(v: VehicleWithAll, photos: VehicleWithAll["photos"]): VehiclePublic {
  return {
    id: v.id,
    label: vehicleLabel(v),
    vehicleType: v.vehicleType,
    makeId: v.makeId,
    makeName: v.make.name,
    modelId: v.modelId,
    modelName: v.model.name,
    generationId: v.generationId,
    generationName: v.generation?.name ?? null,
    country: v.make.country,
    year: v.year,
    color: v.color,
    engine: v.engine,
    powerHp: v.powerHp,
    weightKg: v.weightKg,
    description: v.description,
    preparation: v.preparation,
    categories: v.categories.map((c) => ({ id: c.category.id, slug: c.category.slug, label: c.category.label })),
    photos: photos.map((p) => ({
      id: p.id,
      position: p.position,
      url: storage.url(p.storageKey) ?? "",
      width: p.width,
      height: p.height,
      plateBlurred: p.plateBlurred,
    })),
    status: v.status,
    certified: Boolean(v.certifiedAt),
    audiencePrizes: v.audiencePrizes,
  };
}

/** Propriétaire et organisateur. */
export function vehicleFull(v: VehicleWithAll): VehicleFull {
  return {
    ...vehicleView(v, v.photos),
    // Lot M2 : toujours lisible (« AE-665-GH »), y compris pour une fiche saisie avant la normalisation.
    plate: v.plate ? formatPlate(v.plate) : null,
    unregistered: v.unregistered,
    archivedAt: v.archivedAt?.toISOString() ?? null,
    statusNote: v.statusNote,
    shareVersion: `${v.updatedAt.getTime()}-${v.photos.length}-${v.photos[0]?.id.slice(0, 8) ?? "0"}`,
    plateTransfer: v.pendingTransfer
      ? {
          id: v.pendingTransfer.id,
          status: v.pendingTransfer.status,
          createdAt: v.pendingTransfer.createdAt.toISOString(),
        }
      : null,
  };
}

/** Marque + modèle (fiche réduite d'un compte privé, lot 17) : « BMW Série 3 », jamais la génération ni l'année. */
export function vehicleBriefLabel(v: Pick<VehicleWithAll, "make" | "model">): string {
  const label = [v.make.isOther ? null : v.make.name, v.model.isOther ? null : v.model.name].filter(Boolean).join(" ");
  return label || "Autre véhicule";
}

export function vehicleBrief(v: VehicleWithAll): VehicleBrief {
  return {
    id: v.id,
    label: vehicleBriefLabel(v),
    makeName: v.make.name,
    modelName: v.model.name,
    vehicleType: v.vehicleType,
    photoUrl: null,
  };
}

/**
 * Lot R4b : la voiture d'un compte privé vue par un autre (`privateVehicleFields`) : la photo (plaque masquée), la
 * marque, le modèle, la génération et les catégories ; ni année, ni fiche technique, ni description, ni plaque.
 */
export function vehiclePrivate(v: VehicleWithAll): VehiclePrivate {
  return {
    id: v.id,
    label: vehicleLabel(v),
    vehicleType: v.vehicleType,
    makeName: v.make.name,
    modelName: v.model.name,
    generationName: v.generation && !v.generation.isOther ? v.generation.name : null,
    // Lot R4b, tour 2 : seulement une photo dont la plaque est floutée (ou d'un véhicule sans plaque).
    photoUrl: storage.url(maskedPhoto(v.photos, v.unregistered)?.storageKey ?? null),
    categories: v.categories.map((c) => ({ id: c.category.id, slug: c.category.slug, label: c.category.label })),
  };
}
