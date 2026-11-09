// Source « Publication » : publications des membres (`feed_posts`), non retirées, d'auteurs en règle, publiques ou
// d'un compte privé que la personne suit (abonnement accepté) ; les siennes aussi (sauf « Mes abonnements »). Rien d'un
// crew : les publications de crew sont une autre table et n'entrent jamais ici. Les photos portent toutes une
// décision de plaque vraie (contrainte de la table) ; rien d'autre n'est lu.
import { isOfficialPseudo } from "@orasso/shared";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { feedPosts, profiles } from "../../../db/schema";
import { authorVisibleSql } from "../access";
import { loadPostViews } from "../posts";
import { atBounds, type FeedSource, inDepartments, type LoadedCard, type SourceInput, tsParam } from "./types";

export const source: FeedSource<"feed_post"> = {
  kind: "feed_post",
  async load(input: SourceInput): Promise<LoadedCard<"feed_post">[]> {
    const atExpr = sql`${feedPosts.createdAt}`;
    const filters: (SQL | undefined)[] = [
      sql`${feedPosts.deletedAt} is null`,
      authorVisibleSql("profiles", sql`${feedPosts.authorId}`, input.userId, input.ref),
      sql`${feedPosts.createdAt} <= ${tsParam(input.ref)}`,
      sql`exists (select 1 from feed_post_photos ph where ph.post_id = ${feedPosts.id})`,
      ...atBounds(atExpr, input),
    ];
    if (input.filter === "following") {
      filters.push(
        sql`exists (select 1 from user_follows uf where uf.follower_id = ${input.userId} and uf.followed_id = ${feedPosts.authorId} and uf.status = 'accepted')`,
      );
    }
    if (input.filter === "nearby") filters.push(inDepartments(sql`nullif(${feedPosts.department}, '')`, input.nearby));
    const rows = await db
      .select({ post: feedPosts, author: profiles })
      .from(feedPosts)
      .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
      .where(and(...filters))
      .orderBy(desc(feedPosts.createdAt), desc(feedPosts.id))
      .limit(input.limit);
    const views = new Map(
      (
        await loadPostViews(
          db,
          rows.map((r) => r.post.id),
          input.userId,
          input.ref,
        )
      ).map((v) => [v.id, v]),
    );
    return rows.flatMap((r): LoadedCard<"feed_post">[] => {
      const view = views.get(r.post.id);
      if (!view) return [];
      return [
        {
          id: `feed_post:${r.post.id}`,
          kind: "feed_post",
          at: r.post.createdAt,
          department: r.post.department || null,
          authorId: r.post.authorId,
          structureId: null,
          proId: null,
          categoryIds: [],
          authorPseudo: r.author.pseudo,
          official: isOfficialPseudo(r.author.pseudo),
          payload: { post: view },
        },
      ];
    });
  },
};
