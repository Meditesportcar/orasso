// Personnes dont le pseudo commence par le texte. Les règles de visibilité sont celles de la recherche de personnes
// (lot 17) : un compte privé n'est trouvable que par ce qu'il montre à tous, supprimés et suspendus jamais listés.
import type { PersonCard } from "@orasso/shared";

import { peopleSearch } from "../../social/search";
import type { SearchSource } from "./index";

export const peopleSource: SearchSource<"people"> = {
  group: "people",
  needsAccount: true,
  async run({ viewer, q, limit }): Promise<PersonCard[]> {
    if (!viewer) return [];
    return peopleSearch.byPseudo(viewer, q, limit);
  },
};
