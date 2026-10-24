// Règles de l'étape Plaque (lot M2), sans React ni réseau (testé par `plateStep.test.ts`) : ce que la détection laisse
// sur une photo du brouillon, le numéro proposé d'après la lecture des photos, l'avertissement d'un format étranger.
// L'étape s'en sert ; le conteneur du parcours (lot M1) n'a qu'à appeler `detectionPatch` après chaque détection.
import { vehicleWizardLabels as L, plateKind } from "@orasso/shared";

// Chemin relatif : Vitest (sans alias « @/ ») teste ce module.
import { type FoundPlate, suggestedPlate, surePlates } from "../../../lib/plates/detect";
import type { BlurMode, Draft, DraftPhoto } from "./model";

/**
 * Ce que la détection d'une photo change dans le brouillon : cadres proposés (posés d'office en mode Automatique),
 * état, et lectures (pour préremplir le numéro). Les plaques probables (filet de sécurité) ne donnent jamais de cadre :
 * elles restent dans `readings`, à vérifier. `found` à `null` : pas de détection possible ici.
 */
export function detectionPatch(
  photo: DraftPhoto,
  found: readonly FoundPlate[] | null,
  mode: BlurMode,
  failure?: string,
): Pick<DraftPhoto, "detected" | "detection" | "rects" | "readings" | "detectionFailure"> {
  const rects = surePlates(found ?? []).map((f) => f.rect);
  return {
    detectionFailure: failure,
    detected: rects,
    detection: found === null ? "unavailable" : rects.length ? "found" : "none",
    rects: mode === "auto" ? rects : photo.rects,
    readings: (found ?? []).map(({ plate, fixes, valid, ambiguous, probable, area }) => ({
      plate,
      fixes,
      valid,
      ambiguous,
      probable,
      area,
    })),
  };
}

/**
 * Numéro proposé d'après la lecture des photos, au format lisible (« W-623-AX »), ou `null` : jamais une plaque
 * probable ni une lecture ambiguë (voir `suggestedPlate`), jamais pour un véhicule non immatriculé.
 */
export function plateSuggestion(photos: readonly DraftPhoto[], unregistered = false): string | null {
  if (unregistered) return null;
  return suggestedPlate(photos.flatMap((p) => p.readings ?? []));
}

/**
 * Préremplissage du numéro, ou `null` : seulement si le champ est vide et n'a jamais été touché à la main (une saisie,
 * même effacée, n'est jamais remplacée), et qu'une lecture sûre existe.
 */
export function prefillPatch(draft: Draft): Pick<Draft, "plate"> | null {
  if (draft.plateTouched || draft.plate.trim()) return null;
  const plate = plateSuggestion(draft.photos, draft.unregistered);
  return plate ? { plate } : null;
}

/** Saisie du numéro à la main : il ne sera plus jamais prérempli. */
export const typedPlate = (plate: string): Pick<Draft, "plate" | "plateTouched"> => ({ plate, plateTouched: true });

/** Avertissement doux sous le numéro : format non français (plaque étrangère acceptée), sinon `null`. */
export function plateWarning(plate: string): string | null {
  const text = plate.trim();
  if (text.length < 3) return null;
  return plateKind(text) ? null : L.plateForeign;
}

/**
 * Aide sous le numéro : l'avertissement d'un format étranger passe toujours devant ; « Lu sur ta photo » seulement si
 * le numéro est encore celui proposé par la lecture.
 */
export function plateHelp(draft: Draft): string | null {
  if (draft.unregistered) return null;
  const warning = plateWarning(draft.plate);
  if (warning) return warning;
  const suggestion = plateSuggestion(draft.photos);
  return suggestion && !draft.plateTouched && draft.plate.trim() === suggestion ? L.plateRead : null;
}
