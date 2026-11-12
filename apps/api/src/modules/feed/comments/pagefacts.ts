// Faits d'une publication pour `canSeeFeedPost`, **avec l'état réel de la page** (lot R8k1, tour 9) : pour une publication de
// structure, de fiche pro, de prestataire ou de média, `factsOf` sans l'état de la page refuse tout le monde (page « pas en
// règle »). Toute vérification de lecture des commentaires (notifications, garde, suggestions, lot) passe par ici.
import type { FeedPostFacts } from "@orasso/shared";

import type { Executor } from "../../../lib/tx";
import { factsOf, type postWithAuthor } from "../access";
import { loadPageInfo, pageKeyOf } from "../authors";

type PostRow = NonNullable<Awaited<ReturnType<typeof postWithAuthor>>>;

/** Faits de chaque publication (par identifiant), l'état des pages lu en un lot. */
export async function factsMapOf(ex: Executor, rows: PostRow[], at: Date): Promise<Map<string, FeedPostFacts>> {
  const pages = rows.some((r) => pageKeyOf(r.post))
    ? await loadPageInfo(
        ex,
        rows.map((r) => r.post),
      )
    : new Map();
  return new Map(
    rows.map((r) => {
      const key = pageKeyOf(r.post);
      return [r.post.id, factsOf(r, at, key ? (pages.get(key)?.inGoodStanding ?? false) : false)];
    }),
  );
}

export async function postFactsOf(ex: Executor, row: PostRow, at: Date): Promise<FeedPostFacts> {
  return (await factsMapOf(ex, [row], at)).get(row.post.id) as FeedPostFacts;
}
