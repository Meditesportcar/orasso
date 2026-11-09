// Onglet Crew (lot R7b2, D38) : quel crew s'affiche. Pur, testé seul.
import type { MyCrew } from "@orasso/shared";

/** Clé du dernier crew ouvert, rangée par compte (`kv`) : « le dernier ouvert revient ». */
export const crewLastKey = (userId: string) => `crew-last.${userId}`;

/**
 * Le crew à montrer : celui qu'on demande (adresse dans le lien), sinon le dernier ouvert, sinon le premier. Une adresse
 * qui n'est plus dans mes crews (quitté, retiré, dissous) est ignorée : on ne montre jamais un crew dont je ne suis plus.
 */
export function pickCrew(
  crews: readonly MyCrew[],
  wanted: string | null | undefined,
  last: string | null | undefined,
): MyCrew | null {
  for (const slug of [wanted, last]) {
    const hit = slug ? crews.find((c) => c.slug === slug) : undefined;
    if (hit) return hit;
  }
  return crews[0] ?? null;
}

export type CrewTabId = "feed" | "outings" | "members" | "spots";
export const crewTabIds: readonly CrewTabId[] = ["feed", "outings", "members", "spots"];

/** L'onglet interne d'un lien (`?onglet=sorties`) ; l'ancien « garage » mène aux Membres, où sont les voitures. */
export function tabOfParam(value: string | null | undefined): CrewTabId {
  switch (value) {
    case "sorties":
    case "outings":
      return "outings";
    case "membres":
    case "garage":
    case "members":
      return "members";
    case "spots":
      return "spots";
    default:
      return "feed";
  }
}

/** Les voitures d'un membre, dans l'ordre du garage du crew (la principale d'abord, déjà triée par l'API). */
export function carsOf<T extends { ownerPseudo: string }>(garage: readonly T[], pseudo: string): T[] {
  const wanted = pseudo.toLowerCase();
  return garage.filter((g) => g.ownerPseudo.toLowerCase() === wanted);
}
