// Pros publiés, titulaire en règle : visibles sans compte (fiche de base ou complète selon `proVisibility`).
import { type ProCard, proListQuery } from "@orasso/shared";

import { exploreProsList } from "../../pros/explore";
import type { SearchSource } from "./index";

export const prosSource: SearchSource<"pros"> = {
  group: "pros",
  needsAccount: false,
  run({ viewer, q, limit }): Promise<ProCard[]> {
    const query = proListQuery.parse({ q, limit: limit + 1 });
    return exploreProsList(query, viewer).then((page) => page.items);
  },
};
