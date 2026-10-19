// Flux d'arrivée (lot 41) : l'état choisi d'un écran à l'autre (profil, départements, identité) et les règles pures,
// testées seules. Rien n'est enregistré avant la dernière étape : fermer le flux efface tout.
import { type TabSetName, tabSets } from "@orasso/design-system";
import { MAX_DEPARTMENTS, type MainProfile, mainProfiles, PASSWORD_MIN_LENGTH, pseudoSchema } from "@orasso/shared";
import { useSyncExternalStore } from "react";

/** Le profil choisi → la barre d'onglets dessinée sous les tuiles (`tabSets` v2 du système de design). */
export const tabSetOfProfile: Record<MainProfile, Exclude<TabSetName, "fan">> = {
  exhibitor: "exhibitor",
  visitor: "visitor",
  pro: "pro",
  organizer: "organizer",
  provider: "provider",
  media: "media",
};

/** L'onglet du milieu de la barre d'un profil (celui qui est actif dans l'aperçu). */
export function centerTabOf(profile: MainProfile): string {
  return tabSets[tabSetOfProfile[profile]].find((tab) => "center" in tab && tab.center)?.id ?? "home";
}

/** L'ordre des tuiles : grille de 3 × 2 du prototype. */
export const profileTileOrder: readonly MainProfile[] = mainProfiles;

/** Ajoute le département s'il n'est pas choisi, le retire sinon. Le premier de la liste est le favori. */
export function toggleDepartment(selected: readonly string[], code: string): string[] {
  return selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
}

/** Ajouter ce département dépasserait la limite (20) ? Retirer reste toujours possible. */
export function departmentLimitReached(selected: readonly string[], code: string): boolean {
  return !selected.includes(code) && selected.length >= MAX_DEPARTMENTS;
}

/** Le favori (ou département principal) : le premier choisi. */
export function favoriteOf(selected: readonly string[]): string | null {
  return selected[0] ?? null;
}

export type Identity = {
  pseudo: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  terms: boolean;
};

export const emptyIdentity: Identity = {
  pseudo: "",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  terms: false,
};

/** Le formulaire « Qui es-tu ? » peut partir : tout est rempli et valide (le pseudo libre est vérifié à part). */
export function identityReady(i: Identity, pseudoOk: boolean): boolean {
  return (
    pseudoSchema.safeParse(i.pseudo).success &&
    pseudoOk &&
    i.firstName.trim().length > 0 &&
    i.lastName.trim().length > 0 &&
    i.email.includes("@") &&
    i.password.length >= PASSWORD_MIN_LENGTH &&
    i.terms
  );
}

export type ArriveeState = {
  profile: MainProfile | null;
  departments: string[];
  identity: Identity;
  /** Où aller à la fin (lien partagé ouvert avant l'inscription), ou `null`. */
  next: string | null;
};

/** Comme le prototype, l'exposant est préchoisi : l'aperçu de la barre est visible dès l'arrivée. */
const initial: ArriveeState = {
  profile: "exhibitor",
  departments: [],
  identity: emptyIdentity,
  next: null,
};

let state: ArriveeState = initial;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const arriveeStore = {
  get: () => state,
  set(patch: Partial<ArriveeState>) {
    state = { ...state, ...patch };
    emit();
  },
  reset() {
    state = initial;
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useArrivee(): ArriveeState {
  return useSyncExternalStore(arriveeStore.subscribe, arriveeStore.get, arriveeStore.get);
}
