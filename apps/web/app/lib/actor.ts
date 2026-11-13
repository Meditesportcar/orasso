// L'acteur d'un espace du site (lot R9h, T48 et T49) : la casquette est portée par l'espace (`/orga/:structure`, `/pro/:pro`,
// `/app/media`, `/app/prestataire`), jamais par un cookie ni par la session : rien à mémoriser, rien à vider. Le layout de
// l'espace pose un `ActorProvider` ; les composants partagés (Fil, barre des stories, commentaires) lisent `useActor()`. Hors d'un
// espace de casquette, il rend `null` et rien ne change. Le serveur ne croit pas l'en-tête (il relit les droits) ; ce fichier ne fait
// que le poser, sur la liste blanche seulement (`actorRoutes.ts`).
import { createContext, createElement, type ReactNode, useContext, useEffect, useMemo } from "react";

import { postLive } from "../components/fil/commentsLive";

/** La casquette d'un espace : sa clé d'auteur (`X-Orasso-Actor`) et de quoi la nommer (pastille du Fil, barre du haut). */
export type Casquette = {
  /** `s:`, `p:`, `v:` ou `m:` + l'identifiant de la page. */
  key: string;
  name: string;
  logoUrl: string | null;
};

const CasquetteContext = createContext<Casquette | null>(null);

export function ActorProvider({ casquette, children }: { casquette: Casquette | null; children: ReactNode }) {
  const key = casquette?.key ?? null;
  const name = casquette?.name ?? "";
  const logoUrl = casquette?.logoUrl ?? null;
  const value = useMemo(() => (key ? { key, name, logoUrl } : null), [key, name, logoUrl]);
  // Le magasin des commentaires (brouillons, envois en attente, feuilles lues) est vidé au démontage de l'espace et au changement de
  // casquette : une conversation lue au nom d'une page ne reste jamais sous un autre acteur, quel que soit le lien suivi (R9h, tour 1).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` seul déclenche
  useEffect(() => () => postLive.clear(), [key]);
  return createElement(CasquetteContext.Provider, { value }, children);
}

/** La clé d'auteur de la casquette de l'espace, ou `null` (on agit en son propre nom). */
export function useActor(): string | null {
  return useContext(CasquetteContext)?.key ?? null;
}

/** La casquette de l'espace en entier, ou `null` hors d'un espace de casquette. */
export function useCasquette(): Casquette | null {
  return useContext(CasquetteContext);
}

/** Le 403 d'une casquette périmée (structure quittée, fiche supprimée) : l'adresse où le navigateur est renvoyé, avec l'avis. */
export const CASQUETTE_GONE_HREF = "/app/moi?casquette=indisponible";
