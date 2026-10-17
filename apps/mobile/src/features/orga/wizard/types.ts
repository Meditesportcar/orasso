// Ce que chaque écran de l'assistant reçoit (lot 35b) : le brouillon, ses deux façons d'être modifié, et le contexte
// (références de véhicules, listes administrables, événement modifié, affiche choisie).
import type { CategoryOption, EventDraft, EventFormat, EventOrganizer, VehicleMake } from "@orasso/shared";

import type { PickedPhoto } from "@/lib/photos";

export type StepContext = {
  d: EventDraft;
  set: <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => void;
  setD: (update: (prev: EventDraft) => EventDraft) => void;
  editing: boolean;
  event?: EventOrganizer;
  verified: boolean;
  categories: readonly CategoryOption[];
  makes: readonly VehicleMake[];
  /** Formats proposés (administration, lot 33 ; celui d'un événement existant reste proposé). */
  formats: readonly EventFormat[];
  /** Types de prestataires proposés, en libellés (administration, lot 33). */
  vendorSuggestions: readonly string[];
  poster: PickedPhoto | null;
  setPoster: (photo: PickedPhoto | null) => void;
  openStructure: () => void;
};

export const toggle = <T extends string>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
