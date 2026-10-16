// Source « crews » de la recherche de premier niveau (lot 29, 2de partie) : réutilise la recherche du lot 19
// (`GET /crews/search`, par nom, crews dissous exclus). Une carte de crew ne porte que nom, logo, département et nombre
// de membres : jamais la liste des membres. Réservée aux connectés, comme les personnes.
import type { CrewCard, CrewSearchQuery } from "@orasso/shared";

import type { SearchSource } from "../search/sources";
import { crewsService } from "./service";

export const crewsSource: SearchSource<"crews"> = {
  group: "crews",
  needsAccount: true,
  async run({ viewer, q, limit }): Promise<CrewCard[]> {
    if (!viewer) return [];
    const page = await crewsService.search(viewer, { q, limit: limit + 1 } as CrewSearchQuery);
    return page.items;
  },
};
