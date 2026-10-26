// Sérialiseurs par audience (ARCHITECTURE.md § 5.2) : la plaque ne sort que pour le propriétaire et l'organisateur.
import {
  type CategoryIcon,
  type CategoryRef,
  categoryLabelFor,
  formatPlate,
  maskedPhoto,
  maskedPhotos,
  type VehicleBrief,
  type VehicleFull,
  type VehiclePrivate,
  type VehiclePublic,
  vehicleName,
} from "@orasso/shared";

import { storage } from "../../lib/storage";
import type { VehicleWithAll } from "./repo";

/**
 * Catégories d'un véhicule (lot R5a) : libellé au masculin pour un camion (« Ancien »), famille et icône du style, et
 * `paused` quand l'admin l'a mis en pause (il ne se propose plus ; il reste sur la fiche).
 */
function categoryRefs(v: Pick<VehicleWithAll, "vehicleType" | "categories">): CategoryRef[] {
  return v.categories
    .map((c) => c.category)
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      label: categoryLabelFor(c, v.vehicleType),
      family: c.family,
      icon: c.icon as CategoryIcon,
      paused: !c.active,
    }));
}

/**
 * Lot R4a : marque et modèle tapés (niveau « Autre »). Obligatoires (tour 2) : toute lecture qui construit un nom de
 * véhicule doit lire les deux colonnes, le compilateur le vérifie. Lot R4e : la version aussi (« Peugeot 207 CC »).
 * `makeNameOf`, `modelNameOf` et `vehicleLabel`
 * prennent une ligne de `vehicles` (avec `make`, `model`, `generation`) : à utiliser partout où un nom s'affiche.
 */
export type Proposed = Pick<VehicleWithAll, "proposedMake" | "proposedModel" | "version">;

/** Marque affichée : la marque de la liste, ou celle tapée par la personne (« Autre » sinon). */
export const makeNameOf = (v: Pick<VehicleWithAll, "make"> & Proposed) =>
  v.make.isOther ? (v.proposedMake ?? v.make.name) : v.make.name;
/** Modèle affiché : le modèle de la liste, ou celui tapé (« 207 CC »). */
export const modelNameOf = (v: Pick<VehicleWithAll, "model"> & Proposed) =>
  v.model.isOther ? (v.proposedModel ?? v.model.name) : v.model.name;

/**
 * « BMW Série 3 E36 » ; la génération « Autre » n'apparaît pas. Lot R4a : un niveau « Autre » prend le nom tapé
 * (« Peugeot 207 CC »). Lot R4e : la version vient après le modèle et la génération (« Volkswagen Golf Mk4 GTI »).
 */
export function vehicleLabel(v: Pick<VehicleWithAll, "make" | "model" | "generation"> & Proposed): string {
  // Lot R4e, tour 2 : composition commune (`vehicleName`, packages/shared), version jamais répétée.
  return vehicleName(nameParts(v));
}

/** Morceaux du nom d'une ligne de `vehicles` : niveaux « Autre » remplacés par les noms tapés. */
export function nameParts(
  v: Pick<VehicleWithAll, "make" | "model"> & Partial<Pick<VehicleWithAll, "generation">> & Proposed,
) {
  return {
    make: v.make.isOther ? v.proposedMake : v.make.name,
    model: v.model.isOther ? v.proposedModel : v.model.name,
    generation: v.generation && !v.generation.isOther ? v.generation.name : null,
    version: v.version,
  };
}

/**
 * Fiche d'un véhicule vue par un autre (compte public ou ami). Vague R4, après fusion : seules les photos dont la plaque
 * est floutée ou « aucune plaque visible » confirmée sortent (toutes pour un véhicule non immatriculé). Le propriétaire
 * et l'organisation passent par `vehicleFull`, qui garde toutes les photos.
 */
export function vehiclePublic(v: VehicleWithAll, opts: { owner?: boolean } = {}): VehiclePublic {
  // Lot R4e (Damien) : le propriétaire qui regarde sa propre vitrine voit toutes ses photos, sans masque.
  return vehicleView(v, opts.owner ? v.photos : maskedPhotos(v.photos, v.unregistered));
}

function vehicleView(v: VehicleWithAll, photos: VehicleWithAll["photos"]): VehiclePublic {
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
    version: v.version,
    country: v.make.country,
    year: v.year,
    color: v.color,
    engine: v.engine,
    powerHp: v.powerHp,
    weightKg: v.weightKg,
    description: v.description,
    preparation: v.preparation,
    categories: categoryRefs(v),
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
    proposedMake: v.proposedMake,
    proposedModel: v.proposedModel,
  };
}

/**
 * Marque + modèle (fiche réduite d'un compte privé, lot 17) : « BMW Série 3 », jamais la génération ni l'année. Lot
 * R4e : la version suit le modèle (« Peugeot 207 CC »), c'est une précision du nom, comme le nom tapé.
 */
export function vehicleBriefLabel(v: Pick<VehicleWithAll, "make" | "model"> & Proposed): string {
  return vehicleName({ ...nameParts(v), generation: null });
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
    categories: categoryRefs(v),
  };
}
