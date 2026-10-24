// Flux d'arrivée (lot 41) : l'état choisi d'un écran à l'autre (profil, départements, identité) et les règles pures,
// testées seules. Lot R3d : le brouillon (sans le mot de passe) est gardé sur l'appareil par `persist.ts`, pour survivre
// à la fermeture de l'appli ; il est effacé à la fin de l'inscription et à `reset()`.
import { type TabSetName, tabSets } from "@orasso/design-system";
import {
  departmentSchema,
  identityMissing,
  MAX_DEPARTMENTS,
  type MainProfile,
  mainProfiles,
  type PseudoAvailability,
  type SignupMissing,
} from "@orasso/shared";
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

/**
 * Lot R3d : ce qui manque au formulaire « Qui es-tu ? » (la première chose, règle partagée avec le site), départements
 * de l'étape d'avant compris. `null` : le bouton part.
 */
export function identityBlocker(
  i: Identity,
  pseudo: PseudoAvailability,
  departments: readonly string[],
): SignupMissing | null {
  return identityMissing(i, pseudo, departments);
}

/** Le formulaire « Qui es-tu ? » peut partir : tout est rempli et valide (le pseudo libre est vérifié à part). */
export function identityReady(i: Identity, pseudoOk: boolean): boolean {
  return identityMissing(i, pseudoOk ? "free" : "taken") === null;
}

/** L'étape où l'on était (reprise après une fermeture de l'appli). */
export type ArriveeStep = "profil" | "departement" | "identite";
const arriveeSteps: readonly ArriveeStep[] = ["profil", "departement", "identite"];

export type ArriveeState = {
  profile: MainProfile | null;
  departments: string[];
  identity: Identity;
  /** Où aller à la fin (lien partagé ouvert avant l'inscription), ou `null`. */
  next: string | null;
  /** Lot R3d : la dernière étape affichée, ou `null`. */
  step: ArriveeStep | null;
};

/** Comme le prototype, l'exposant est préchoisi : l'aperçu de la barre est visible dès l'arrivée. */
const initial: ArriveeState = {
  profile: "exhibitor",
  departments: [],
  identity: emptyIdentity,
  next: null,
  step: null,
};

/** L'état de départ (le même objet : `persist.ts` y reconnaît un `reset()`). */
export const arriveeInitial: ArriveeState = initial;

/** Le brouillon gardé sur l'appareil : tout l'état, **jamais le mot de passe**. */
export type ArriveeDraft = {
  v: 1;
  profile: MainProfile | null;
  departments: string[];
  identity: Omit<Identity, "password">;
  next: string | null;
  step: ArriveeStep | null;
};

export function draftOf(s: ArriveeState): ArriveeDraft {
  const { password: _password, ...identity } = s.identity;
  return { v: 1, profile: s.profile, departments: s.departments, identity, next: s.next, step: s.step };
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Remet un brouillon relu sur l'appareil dans l'état courant. Le brouillon est relu au lancement, avant toute saisie :
 * il complète ce qui est encore vide, sans écraser un choix déjà fait (lien partagé ouvert entre-temps, champ rempli).
 * Un brouillon illisible ou d'une autre forme est ignoré champ par champ. Le mot de passe n'en vient jamais.
 */
export function mergeDraft(current: ArriveeState, raw: unknown): ArriveeState {
  if (!raw || typeof raw !== "object") return current;
  const d = raw as Partial<Record<keyof ArriveeDraft, unknown>>;
  const profile = (mainProfiles as readonly unknown[]).includes(d.profile) ? (d.profile as MainProfile) : null;
  const departments = Array.isArray(d.departments)
    ? [...new Set(d.departments.filter((c): c is string => departmentSchema.safeParse(c).success))].slice(
        0,
        MAX_DEPARTMENTS,
      )
    : [];
  const id = (d.identity && typeof d.identity === "object" ? d.identity : {}) as Record<string, unknown>;
  const ci = current.identity;
  const identity: Identity = {
    pseudo: ci.pseudo || text(id.pseudo, 24),
    firstName: ci.firstName || text(id.firstName, 60),
    lastName: ci.lastName || text(id.lastName, 60),
    email: ci.email || text(id.email, 254),
    password: ci.password,
    terms: ci.terms || id.terms === true,
  };
  const next = typeof d.next === "string" && d.next.startsWith("/") ? d.next : null;
  const step = arriveeSteps.includes(d.step as ArriveeStep) ? (d.step as ArriveeStep) : null;
  return {
    // Le profil préchoisi (exposant) n'est pas un choix : celui du brouillon le remplace.
    profile: profile && current.profile === initial.profile ? profile : current.profile,
    departments: current.departments.length > 0 ? current.departments : departments,
    identity,
    next: current.next ?? next,
    step: current.step ?? step,
  };
}

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
