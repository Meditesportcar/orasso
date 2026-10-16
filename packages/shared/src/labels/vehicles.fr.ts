import type { VehicleStatus, VehicleType } from "../enums";

// Véhicules et garage.

export const vehicleTypeLabels: Record<VehicleType, string> = {
  car: "Voiture",
  moto: "Moto",
  truck: "Camion",
};

export const vehicleStatusLabels: Record<VehicleStatus, string> = {
  active: "Actif",
  sold: "Vendu",
  keepsake: "Souvenir",
  wrecked: "Accidenté",
};

/** Libellé de la ligne « Autre » du référentiel (marque, modèle, génération). */
export const OTHER_LABEL = "Autre";
