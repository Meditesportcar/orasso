// Tutos par profil (lot 42) : les règles pures, testées seules. Les diapos sont dans `slides/`, les textes dans
// `@orasso/shared` (`tutoSlides`).
import { type MainProfile, mainProfiles } from "@orasso/shared";

/** Un profil de tuto (`exhibitor`, `visitor`, `pro`, `organizer`, `provider`, `media`) ou `null`. */
export function parseTutoProfile(value: string | string[] | undefined): MainProfile | null {
  const v = Array.isArray(value) ? value[0] : value;
  return (mainProfiles as readonly string[]).includes(v ?? "") ? (v as MainProfile) : null;
}

/** La clé mémorisée quand le tuto d'un profil a été vu (l'Accueil n'en propose plus la tuile). */
export const tutoSeenKey = (profile: MainProfile) => `tuto:${profile}`;

/** La casquette d'un compte → le profil de son tuto (l'ancienne casquette « passionné » est l'exposant). */
export function tutoProfileOfPersona(kind: string): MainProfile | null {
  if (kind === "fan") return "exhibitor";
  return parseTutoProfile(kind);
}

/**
 * Les tutos à rejouer depuis Profil › Aide : le profil choisi à l'arrivée d'abord (la casquette de base, exposant ou
 * visiteur, à défaut), puis les autres casquettes du compte, chacune une fois.
 */
export function replayProfiles(personaKinds: readonly string[], mainProfile: MainProfile | null): MainProfile[] {
  const list: MainProfile[] = [];
  const push = (p: MainProfile | null) => {
    if (p && !list.includes(p)) list.push(p);
  };
  const fromPersonas = personaKinds.map(tutoProfileOfPersona);
  push(mainProfile);
  push(fromPersonas.find((p) => p === "exhibitor" || p === "visitor") ?? null);
  for (const p of fromPersonas) push(p);
  return list.length ? list : ["visitor"];
}

/** Diapo voisine (−1 précédente, +1 suivante), bornée aux diapos qui existent. */
export function stepIndex(index: number, direction: 1 | -1, count: number): number {
  return Math.min(count - 1, Math.max(0, index + direction));
}
