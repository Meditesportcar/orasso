// Rail « Ça plaît en ce moment » (lot R8c1, ARCHITECTURE-R8 § 2.5) : première page d'« Abonnements » et d'« Autour de moi »
// seulement. Au plus 10 publications du périmètre de l'onglet, qui ont reçu au moins 3 flammes de comptes en règle sur les
// 7 derniers jours, triées par flammes puis par date. Règles de vie privée (invariants R8, « Le Fil ») :
// - **jamais** la publication d'un compte privé, même pour ses abonnés (le rail se montre comme « ce qui plaît », pas comme
//   un moyen de lire un compte fermé) ; une page est publique ;
// - jamais la mienne ; jamais du « Sponsorisé » (ce n'est pas une publication) ;
// - les flammes d'un compte banni, suspendu ou supprimé ne comptent pas ;
// - le rail ne fait jamais entrer une publication que la personne ne pourrait pas voir : `loadPostViews` revérifie
//   (`canSeeFeedPost`, page en règle, visuel) et écarte le reste.
// Une seule requête groupée, puis une lecture par lot : jamais une requête par publication.
import { FEED_HOT_MAX, FEED_HOT_MIN_FLAMES, FEED_POPULARITY_WINDOW_MS, type FeedFilter } from "@orasso/shared";
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../../db/client";
import { feedPostReactions, feedPosts, profiles } from "../../db/schema";
import type { Actor } from "../../lib/actor";
import { profileOkSql } from "./access";
import { feedPostScopeSql, ownPageSql, postCards, postRows } from "./sources/feedPosts";
import type { LoadedCard } from "./sources/types";

/** Candidats lus avant la revérification : une publication sans visuel ou d'une page hors règle est écartée ensuite. */
const HOT_READ = 3 * FEED_HOT_MAX;

export async function hotCards(args: {
  userId: string;
  ref: Date;
  filter: FeedFilter;
  nearby: readonly string[];
  /** Lot R9a : le rail d'une page est celui de son périmètre (public seulement), jamais une publication de la page. */
  page?: Actor | null;
  follows?: Parameters<typeof feedPostScopeSql>[0]["follows"];
}): Promise<LoadedCard<"feed_post">[]> {
  if (args.filter === "for_you") return [];
  const { userId, ref } = args;
  const from = new Date(ref.getTime() - FEED_POPULARITY_WINDOW_MS);
  const flamer = alias(profiles, "fl");
  const flames = sql<number>`count(*)::int`;
  const ranked = await db
    .select({ id: feedPosts.id, flames })
    .from(feedPostReactions)
    .innerJoin(feedPosts, eq(feedPosts.id, feedPostReactions.postId))
    .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
    .innerJoin(flamer, eq(flamer.userId, feedPostReactions.userId))
    .where(
      and(
        isNull(feedPosts.deletedAt),
        lte(feedPosts.createdAt, ref),
        gt(feedPostReactions.createdAt, from),
        lte(feedPostReactions.createdAt, ref),
        // Sans casquette : jamais la mienne. En casquette : seulement la page active (pas la personne derrière elle).
        args.page ? sql`not ${ownPageSql(args.page)}` : sql`${feedPosts.authorId} <> ${userId}`,
        profileOkSql("fl", ref),
        ...feedPostScopeSql({
          userId,
          ref,
          filter: args.filter,
          nearby: args.nearby,
          publicOnly: true,
          page: args.page ?? null,
          follows: args.follows,
        }),
      ),
    )
    .groupBy(feedPosts.id)
    .having(sql`count(*) >= ${FEED_HOT_MIN_FLAMES}`)
    .orderBy(desc(flames), desc(feedPosts.createdAt), desc(feedPosts.id))
    .limit(HOT_READ);
  if (!ranked.length) return [];
  const counts = new Map(ranked.map((r) => [r.id, r.flames]));
  const rows = await postRows(ranked.map((r) => r.id));
  const cards = await postCards(rows, userId, ref, counts, args.page ?? null);
  const order = new Map(ranked.map((r, i) => [`feed_post:${r.id}`, i]));
  return cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).slice(0, FEED_HOT_MAX);
}
