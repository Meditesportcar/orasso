// Listes administrables (lot 33) côté appli : réponse de `GET /settings/public` gardée dans le trousseau (visible hors
// ligne), sinon les constantes partagées. Seuls les codes connus de cette version de l'appli sont gardés.
import {
  knownCodes,
  POINTS,
  type RefusalReason,
  refusalReasons,
  type VendorTypeCode,
  vendorTypeCodes,
} from "@orasso/shared";

import { api } from "./api";
import { useApi } from "./useApi";

function usePublicSettings() {
  return useApi(() => api.publicSettings(), [], { cacheKey: "public-settings" }).data;
}

/** Motifs de refus proposés au tri (ordre et sélection de l'administration). */
export function useRefusalReasons(): RefusalReason[] {
  return knownCodes(usePublicSettings()?.refusalReasons, refusalReasons);
}

/** Malus en vigueur (barème de l'administration), négatif. */
export function useMalusPoints(): number {
  const value = usePublicSettings()?.malusPoints;
  return typeof value === "number" ? value : POINTS.malus;
}

/** Types de prestataires proposés au profil prestataire. */
export function useVendorTypes(): VendorTypeCode[] {
  return knownCodes(usePublicSettings()?.vendorTypes, vendorTypeCodes);
}
