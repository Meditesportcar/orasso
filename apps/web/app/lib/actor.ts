// L'acteur d'un espace du site (lot R9h, T48 et T49) : la casquette est portée par l'espace (`/orga/:structure`, `/pro/:pro`,
// `/app/media`, `/app/prestataire`), jamais par un cookie ni par la session : rien à mémoriser, rien à vider. Le layout de
// l'espace pose un `ActorProvider` ; les composants partagés (Fil, barre des stories, commentaires) lisent `useActor()`. Hors d'un
// espace de casquette, il rend `null` et rien ne change. Le serveur ne croit pas l'en-tête (il relit les droits) ; ce fichier ne fait
// que le poser, sur la liste blanche seulement (`actorRoutes.ts`).
import { type Me, resolveStoryAuthor } from "@orasso/shared";
import { createContext, createElement, type ReactNode, useContext, useLayoutEffect, useMemo } from "react";

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
  // Le magasin des commentaires (brouillons, envois en attente, feuilles lues) est vidé à l'entrée dans un espace, à son démontage et au changement de
  // casquette : une conversation lue au nom d'une page ne reste jamais sous un autre acteur, quel que soit le lien suivi (R9h, tour 1).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` seul déclenche
  useLayoutEffect(() => {
    // À l'entrée aussi (tour 2) : une navigation sans rechargement du Fil personnel vers une casquette ne garde jamais une feuille lue
    // avec les droits personnels ni un brouillon qui partirait au nom de la page. Effet de mise en page, non silencieux (tour 3, R1) :
    // le magasin est vidé avant l'affichage et avant les lectures des enfants, et les cartes déjà montées se redessinent sans image d'un autre acteur.
    postLive.clear();
    return () => postLive.clear();
  }, [key]);
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

/**
 * Lot R9h (partie 2, T48) : une page ouverte depuis l'espace d'une casquette (la vitrine d'un prestataire, la page d'un média) garde
 * la casquette **dans son adresse** (`?auteur=<clé>`), jamais dans un cookie : c'est la page qui suit (T6, T14). Sans casquette
 * (hors d'un espace), l'adresse ne change pas. La clé est revérifiée à l'arrivée (`resolveStoryAuthor`) et par l'API.
 */
export function withActorParam(href: string, actor: string | null): string {
  if (!actor) return href;
  return `${href}${href.includes("?") ? "&" : "?"}auteur=${encodeURIComponent(actor)}`;
}

/**
 * La casquette que porte une adresse (`?auteur=<clé>`) : la clé d'une page que le compte tient (structure, fiche pro, prestataire, média ;
 * jamais en assistance ni suspendue : `resolveStoryAuthor`), sinon `null` (la personne). Une clé qui n'est pas au compte n'est jamais crue.
 */
export function actorOfParam(asked: string | null, personas: Me["personas"]): string | null {
  return casquetteOfParam(asked, personas)?.key ?? null;
}

/**
 * La casquette en entier que porte une adresse (clé, nom, logo), ou `null` : de quoi dire, sur la page, au nom de qui on agit
 * (pastille « Tu agis au nom de » et « Suivre en tant que », partie 2, tour 1). Mêmes règles que `actorOfParam`.
 */
export function casquetteOfParam(asked: string | null, personas: Me["personas"]): Casquette | null {
  const usable = personas.filter((p) => p.kind !== "fan" && p.kind !== "visitor" && !p.suspended);
  const choice = resolveStoryAuthor(asked, usable);
  if (choice?.kind !== "page") return null;
  const persona = usable.find((p) => p.kind === choice.persona && p.id === choice.id);
  return { key: choice.key, name: choice.name, logoUrl: persona?.logoUrl ?? null };
}

/** La même adresse sans `auteur` (« En mon nom ») : chemin, onglet, retour et curseur restent. */
export function withoutActorParam(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete("auteur");
  const query = params.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}
