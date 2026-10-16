// Recherche de premier niveau (lot 29) : `GET /search?q=&limit=5` interroge chaque source en parallèle et ne garde que
// `limit` résultats par groupe (le `+1` demandé aux sources dit seulement s'il y en a davantage : « Voir tout »).
import { type SearchGroup, type SearchQuery, type SearchResults, searchGroups } from "@orasso/shared";

import type { Viewer } from "../../lib/session";
import { searchSources } from "./sources";

export const searchService = {
  async run(viewer: Viewer | null, query: SearchQuery): Promise<SearchResults> {
    const results = {
      q: query.q,
      authenticated: viewer !== null,
      events: [],
      pros: [],
      people: [],
      vehicles: [],
      crews: [],
      more: { events: false, pros: false, people: false, vehicles: false, crews: false },
    } as SearchResults;
    const filled = new Map<SearchGroup, unknown[]>();
    await Promise.all(
      searchSources
        .filter((source) => viewer !== null || !source.needsAccount)
        .map(async (source) => {
          const items = (await source.run({ viewer, q: query.q, limit: query.limit })) as unknown[];
          filled.set(source.group, items);
        }),
    );
    for (const group of searchGroups) {
      const items = filled.get(group) ?? [];
      (results[group] as unknown[]) = items.slice(0, query.limit);
      results.more[group] = items.length > query.limit;
    }
    return results;
  },
};
