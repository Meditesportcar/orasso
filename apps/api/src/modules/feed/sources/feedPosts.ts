// Source « Publication » : publications des membres ET des pages (`feed_posts`, vague R8), non retirées.
// - Un passionné (`persona = 'fan'`) : auteur en règle, public, ou compte privé que la personne suit (abonnement accepté) ;
//   les siennes aussi.
// - Une page (structure, fiche pro, prestataire, média) : tant que la page est en règle et que la personne qui a publié n'est
//   pas bannie, quelle que soit la confidentialité de son compte (`canSeeFeedPost`, revérifié par `loadPostViews`, qui
//   écarte aussi une publication sans visuel). La carte d'une page porte `authorId: null` : elle ne suit JAMAIS les abonnés de
//   la personne qui l'a publiée (affinité, « Tu suis… », « Abonnements ») ; elle suit la structure ou la fiche pro.
// - « Abonnements » : personnes suivies (acceptées), structures et fiches pro suivies, et mes publications de passionné.
//   Prestataires et médias : pas avant la livraison 3 (ils restent dans « Pour toi » et « Autour de moi »).
// - « Autour de moi » : seulement des publications publiques (le texte de l'écran le dit).
// Rien d'un crew : les publications de crew sont une autre table et n'entrent jamais ici. Les photos portent toutes une
// décision de plaque vraie (contrainte de la table) ; rien d'autre n'est lu.
import { FEED_POPULARITY_WINDOW_MS, type FeedFilter } from "@orasso/shared";
import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { feedPosts, profiles } from "../../../db/schema";
import { authorVisibleSql, profileOkSql } from "../access";
import { loadPostViews } from "../posts";
import {
  atBounds,
  atMs,
  type FeedSource,
  inDepartments,
  type LoadedCard,
  type SourceInput,
  type SourceResult,
  sliceRows,
  tsParam,
} from "./types";

type PostRow = { post: typeof feedPosts.$inferSelect; author: typeof profiles.$inferSelect };

/**
 * Qui peut entrer dans l'onglet, en SQL (alias `profiles` = la personne qui a publié). `publicOnly` : « Autour de moi » et le
 * rail « Ça plaît en ce moment » ne prennent jamais le contenu d'un compte privé (même pour ses abonnés) ; une page est publique.
 */
export function feedPostScopeSql(args: {
  userId: string;
  ref: Date;
  filter: FeedFilter;
  nearby: readonly string[];
  publicOnly?: boolean;
}): SQL[] {
  const { userId, ref, filter } = args;
  const fan = sql`${feedPosts.persona} = 'fan'`;
  const fanVisible = args.publicOnly
    ? sql`(${profileOkSql("profiles", ref)} and profiles.visibility = 'public')`
    : authorVisibleSql("profiles", sql`${feedPosts.authorId}`, userId, ref);
  const out: SQL[] = [
    sql`((${fan} and ${fanVisible}) or (${feedPosts.persona} <> 'fan' and profiles.banned_at is null))`,
  ];
  if (filter === "following") {
    out.push(sql`(
      (${fan} and (${feedPosts.authorId} = ${userId}
        or exists (select 1 from user_follows uf where uf.follower_id = ${userId} and uf.followed_id = ${feedPosts.authorId} and uf.status = 'accepted')))
      or (${feedPosts.persona} = 'organizer'
        and exists (select 1 from structure_follows sf where sf.user_id = ${userId} and sf.structure_id = ${feedPosts.structureId}))
      or (${feedPosts.persona} = 'pro'
        and exists (select 1 from pro_follows pf where pf.user_id = ${userId} and pf.pro_id = ${feedPosts.proId})))`);
  }
  if (filter === "nearby") out.push(inDepartments(sql`nullif(${feedPosts.department}, '')`, args.nearby));
  return out;
}

/** Flammes des 7 derniers jours (jusqu'à `ref`), de comptes en règle, par publication : une seule requête groupée. */
export async function flamesOf(postIds: readonly string[], ref: Date): Promise<Map<string, number>> {
  if (!postIds.length) return new Map();
  const from = new Date(ref.getTime() - FEED_POPULARITY_WINDOW_MS);
  const res = await db.execute<{ post_id: string; n: number }>(sql`
    select r.post_id::text as post_id, count(*)::int as n
    from feed_post_reactions r
    join profiles fl on fl.user_id = r.user_id
    where r.post_id in (${sql.join(
      postIds.map((i) => sql`${i}::uuid`),
      sql`, `,
    )})
      and r.created_at > ${from.toISOString()}::timestamptz and r.created_at <= ${ref.toISOString()}::timestamptz
      and ${profileOkSql("fl", ref)}
    group by r.post_id`);
  return new Map(res.rows.map((r) => [r.post_id, r.n]));
}

/**
 * Les cartes des publications lues : celles que la personne ne peut pas voir ou qui n'ont aucun visuel sont omises
 * (`loadPostViews`). `flames` : déjà comptées (le rail), sinon lues ici.
 */
export async function postCards(
  rows: PostRow[],
  userId: string,
  ref: Date,
  flames?: Map<string, number>,
): Promise<LoadedCard<"feed_post">[]> {
  if (!rows.length) return [];
  const views = new Map(
    (
      await loadPostViews(
        db,
        rows.map((r) => r.post.id),
        userId,
        ref,
      )
    ).map((v) => [v.id, v]),
  );
  const counts = flames ?? (await flamesOf([...views.keys()], ref));
  return rows.flatMap((r): LoadedCard<"feed_post">[] => {
    const view = views.get(r.post.id);
    if (!view) return [];
    const isPage = r.post.persona !== "fan";
    return [
      {
        id: `feed_post:${r.post.id}`,
        kind: "feed_post",
        at: r.post.createdAt,
        department: r.post.department || null,
        // Une page n'a pas d'auteur dans le Fil : ni « Tu suis… » ni abonnés de la personne qui l'a publiée.
        authorId: isPage ? null : r.post.authorId,
        structureId: r.post.persona === "organizer" ? r.post.structureId : null,
        proId: r.post.persona === "pro" ? r.post.proId : null,
        categoryIds: [],
        eventId: r.post.eventId,
        mine: r.post.authorId === userId,
        flames7d: counts.get(r.post.id) ?? 0,
        authorPseudo: isPage ? view.author.name : r.author.pseudo,
        official: isPage ? false : r.author.official,
        payload: { post: view },
      },
    ];
  });
}

export const source: FeedSource<"feed_post"> = {
  kind: "feed_post",
  async load(input: SourceInput): Promise<SourceResult<"feed_post">> {
    const atExpr = atMs(sql`${feedPosts.createdAt}`);
    const filters: (SQL | undefined)[] = [
      sql`${feedPosts.deletedAt} is null`,
      ...feedPostScopeSql({
        userId: input.userId,
        ref: input.ref,
        filter: input.filter,
        nearby: input.nearby,
        publicOnly: input.filter === "nearby",
      }),
      sql`${feedPosts.createdAt} <= ${tsParam(input.ref)}`,
      ...atBounds(atExpr, sql`${feedPosts.id}`, "feed_post", input),
    ];
    const raw = await db
      .select({ post: feedPosts, author: profiles, at: sql<Date>`${atExpr}` })
      .from(feedPosts)
      .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
      .where(and(...filters))
      .orderBy(desc(atExpr), desc(feedPosts.id))
      .limit(input.limit + 1);
    const { rows, more, tail } = sliceRows(raw, input.limit, (r) => ({
      at: new Date(r.at),
      id: `feed_post:${r.post.id}`,
    }));
    return { cards: await postCards(rows, input.userId, input.ref), more, tail };
  },
};

/** Lignes (publication + personne qui a publié) de ces identifiants, pour `postCards`. */
export async function postRows(ids: readonly string[]): Promise<PostRow[]> {
  if (!ids.length) return [];
  return db
    .select({ post: feedPosts, author: profiles })
    .from(feedPosts)
    .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
    .where(inArray(feedPosts.id, [...ids]));
}
