// Listes administrables (lot 33) côté composants : celles du chargement racine (`root.tsx`), sinon les constantes
// partagées. Seuls les codes connus sont gardés (une réponse ancienne ou abîmée ne casse pas un écran).
import {
  defaultPublicSettings,
  type EventFormat,
  eventFormats,
  knownCodes,
  type ProActivity,
  proActivities,
  type RefusalReason,
  refusalReasons,
  type VendorTypeCode,
  vendorTypeCodes,
} from "@orasso/shared";
import { useRouteLoaderData } from "react-router";

import type { loader } from "../root";

function useLists() {
  return useRouteLoaderData<typeof loader>("root")?.lists ?? defaultPublicSettings;
}

/** Motifs de refus proposés au tri (ordre et sélection de l'administration). */
export function useRefusalReasons(): RefusalReason[] {
  return knownCodes(useLists().refusalReasons, refusalReasons);
}

/** Types de prestataires proposés (assistant d'événement, profil prestataire). */
export function useVendorTypes(): VendorTypeCode[] {
  return knownCodes(useLists().vendorTypes, vendorTypeCodes);
}

/** Formats proposés à la création d'un événement. */
export function useEventFormats(): EventFormat[] {
  return knownCodes(useLists().eventFormats, eventFormats);
}

/** Activités proposées sur une fiche pro. */
export function useProActivities(): ProActivity[] {
  return knownCodes(useLists().proActivities, proActivities);
}
