// Règles de l'étape Plaque (lot M2), sans React ni réseau (testé par `plateStep.test.ts`) : ce que la détection laisse
// sur une photo du brouillon, le numéro proposé d'après la lecture des photos, l'avertissement d'un format étranger.
// L'étape s'en sert ; le conteneur du parcours (lot M1) n'a qu'à appeler `detectionPatch` après chaque détection.
import { vehicleWizardLabels as L, plateKind } from "@orasso/shared";

// Chemin relatif : Vitest (sans alias « @/ ») teste ce module.
import { type FoundPlate, suggestedPlate } from "../../../lib/plates/detect";
import type { BlurMode, DraftPhoto } from "./model";

/**
 * Ce que la détection d'une photo change dans le brouillon : cadres proposés (posés d'office en mode Automatique),
 * état, et lectures (pour préremplir le numéro). `found` à `null` : pas de détection possible ici.
 */
export function detectionPatch(
  photo: DraftPhoto,
  found: readonly FoundPlate[] | null,
  mode: BlurMode,
): Pick<DraftPhoto, "detected" | "detection" | "rects" | "readings"> {
  const rects = found?.map((f) => f.rect) ?? [];
  return {
    detected: rects,
    detection: found === null ? "unavailable" : rects.length ? "found" : "none",
    rects: mode === "auto" ? rects : photo.rects,
    readings: found?.map(({ reading, probable }) => ({ reading, probable })) ?? [],
  };
}

/**
 * Numéro proposé d'après la lecture des photos, au format lisible (« W-623-AX ») : la première plaque reconnue (dans
 * l'ordre des photos), sinon la première probable ; `null` si rien n'a été lu. Jamais pour un véhicule non immatriculé.
 */
export function plateSuggestion(photos: readonly DraftPhoto[], unregistered = false): string | null {
  if (unregistered) return null;
  return suggestedPlate(photos.flatMap((p) => p.readings ?? []));
}

/** Avertissement doux sous le numéro : format non français (plaque étrangère acceptée), sinon `null`. */
export function plateWarning(plate: string): string | null {
  const text = plate.trim();
  if (text.length < 3) return null;
  return plateKind(text) ? null : L.plateForeign;
}
