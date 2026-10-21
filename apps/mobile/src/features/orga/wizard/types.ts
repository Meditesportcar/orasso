// Ce que chaque temps de l'assistant reçoit (lot 35b ; lot 53 : huit temps) : le brouillon, ses deux façons d'être
// modifié, et le contexte (références de véhicules, listes administrables, événement enregistré, affiche perso).
import type { CategoryOption, EventDraft, EventFormat, EventOrganizer, VehicleMake } from "@orasso/shared";

import type { PickedPhoto } from "@/lib/photos";

export type StepContext = {
  d: EventDraft;
  set: <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => void;
  setD: (update: (prev: EventDraft) => EventDraft) => void;
  editing: boolean;
  /** Événement enregistré (modification, ou brouillon déjà enregistré à un temps précédent). */
  event?: EventOrganizer;
  verified: boolean;
  structureId: string;
  structureName: string;
  followers: number | null;
  categories: readonly CategoryOption[];
  makes: readonly VehicleMake[];
  /** Formats proposés (administration, lot 33 ; celui d'un événement existant reste proposé). */
  formats: readonly EventFormat[];
  /** Types de prestataires proposés, en libellés (administration, lot 33). */
  vendorSuggestions: readonly string[];
  /** Affiche perso choisie (envoyée avec l'événement). */
  poster: PickedPhoto | null;
  setPoster: (photo: PickedPhoto | null) => void;
  /**
   * Envoi de la photo de l'affiche (progression 0 à 1, `null` hors envoi) et son erreur, tenus par l'assistant
   * (correctif 53c) : « Continuer » et « Publier » attendent la fin de l'envoi, l'erreur ne disparaît pas avec le temps.
   */
  photoSending: number | null;
  setPhotoSending: (progress: number | null) => void;
  photoError: string | null;
  setPhotoError: (error: string | null) => void;
  openStructure: () => void;
};

export const toggle = <T extends string>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
