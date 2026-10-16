// Sources de la recherche de premier niveau (lot 29, ARCHITECTURE-SUITE § 13.1). Une source = un groupe de résultats,
// dans son propre fichier ; ce registre est le seul endroit à compléter.
//
// Point d'extension pour les crews (lot 19) : créer `modules/crews/search-source.ts` qui exporte une `SearchSource`
// de groupe `crews` (`needsAccount: true`, voir `people.ts` pour le modèle), puis ajouter UNE ligne au tableau
// `searchSources` ci-dessous. Le type `SearchCrewHit` est dans `@orasso/shared` (schemas/search.ts).
import type { SearchGroup, SearchResults } from "@orasso/shared";

import type { Viewer } from "../../../lib/session";
import { eventsSource } from "./events";
import { peopleSource } from "./people";
import { prosSource } from "./pros";
import { vehiclesSource } from "./vehicles";

export type SearchContext = {
  /** `null` : visiteur sans compte. */
  viewer: Viewer | null;
  q: string;
  /** Nombre de résultats affichés par groupe. */
  limit: number;
};

export type SearchSource<G extends SearchGroup = SearchGroup> = {
  group: G;
  /** Vrai : le groupe n'est cherché que pour un visiteur connecté (personnes, véhicules, crews). */
  needsAccount: boolean;
  /** Renvoie au plus `limit + 1` résultats : le dernier dit seulement qu'il y en a davantage. */
  run(ctx: SearchContext): Promise<SearchResults[G]>;
};

export const searchSources: SearchSource[] = [
  eventsSource,
  prosSource,
  peopleSource,
  vehiclesSource,
  // crewsSource (lot 19) : une ligne ici.
];
