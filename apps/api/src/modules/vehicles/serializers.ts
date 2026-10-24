// Sérialiseurs par audience (ARCHITECTURE.md § 5.2) : la plaque ne sort que pour le propriétaire et l'organisateur.
import { formatPlate, type VehicleBrief, type VehicleFull, type VehiclePublic } from "@orasso/shared";

import { storage } from "../../lib/storage";
import type { VehicleWithAll } from "./repo";

/**
 * Lot R4a : marque et modèle tapés (niveau « Autre »). Obligatoires (tour 2) : toute lecture qui construit un nom de
 * véhicule doit lire les deux colonnes, le compilateur le vérifie. `makeNameOf`, `modelNameOf` et `vehicleLabel`
 * prennent une ligne de `vehicles` (avec `make`, `model`, `generation`) : à utiliser partout où un nom s'affiche.
 */
export type Proposed = Pick<VehicleWithAll, "proposedMake" | "proposedModel">;

/** Marque affichée : la marque de la liste, ou celle tapée par la personne (« Autre » sinon). */
export const makeNameOf = (v: Pick<VehicleWithAll, "make"> & Proposed) =>
  v.make.isOther ? (v.proposedMake ?? v.make.name) : v.make.name;
/** Modèle affiché : le modèle de la liste, ou celui tapé (« 207 CC »). */
export const modelNameOf = (v: Pick<VehicleWithAll, "model"> & Proposed) =>
  v.model.isOther ? (v.proposedModel ?? v.model.name) : v.model.name;

/**
 * « BMW Série 3 E36 » ; la génération « Autre » n'apparaît pas. Lot R4a : un niveau « Autre » prend le nom tapé
 * (« Peugeot 207 CC »).
 */
export function vehicleLabel(v: Pick<VehicleWithAll, "make" | "model" | "generation"> & Proposed): string {
  const parts = [
    v.make.isOther ? (v.proposedMake ?? null) : v.make.name,
    v.model.isOther ? (v.proposedModel ?? null) : v.model.name,
  ];
  if (v.generation && !v.generation.isOther) parts.push(v.generation.name);
  const label = parts.filter(Boolean).join(" ");
  return label || "Autre véhicule";
}

export function vehiclePublic(v: VehicleWithAll): VehiclePublic {
  return {
    id: v.id,
    label: vehicleLabel(v),
    vehicleType: v.vehicleType,
    makeId: v.makeId,
    makeName: makeNameOf(v),
    modelId: v.modelId,
    modelName: modelNameOf(v),
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
    photos: v.photos.map((p) => ({
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
    ...vehiclePublic(v),
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
    proposedMake: v.proposedMake,
    proposedModel: v.proposedModel,
  };
}

/** Marque + modèle (fiche réduite d'un compte privé, lot 17) : « BMW Série 3 », jamais la génération ni l'année. */
export function vehicleBriefLabel(v: Pick<VehicleWithAll, "make" | "model"> & Proposed): string {
  const label = [
    v.make.isOther ? (v.proposedMake ?? null) : v.make.name,
    v.model.isOther ? (v.proposedModel ?? null) : v.model.name,
  ]
    .filter(Boolean)
    .join(" ");
  return label || "Autre véhicule";
}

export function vehicleBrief(v: VehicleWithAll): VehicleBrief {
  return {
    id: v.id,
    label: vehicleBriefLabel(v),
    makeName: makeNameOf(v),
    modelName: modelNameOf(v),
    vehicleType: v.vehicleType,
    photoUrl: null,
  };
}
