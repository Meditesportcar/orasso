// Suggestions après « @ » (lot R8k1). Jamais un annuaire : sans texte, seulement les personnes déjà liées à ce que je lis
// (ceux qui ont commenté et que je peux lire, ceux que je suis, ceux qui me suivent) ; avec 2 caractères au moins, aussi les
// exposants retenus de l'événement rattaché (avant sa fin) dont le compte est public ou que je suis. Seulement des
// personnes en règle qui **peuvent voir la publication** ; 8 au plus ; un début de pseudo, jamais un identifiant de compte.
import { canSeeFeedPost, FEED_MENTION_SUGGESTIONS_MAX, type MentionSuggestion, type MentionWhy } from "@orasso/shared";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { applications, events, feedPostComments, profiles, userFollows } from "../../../db/schema";
import type { Actor } from "../../../lib/actor";
import { now } from "../../../lib/deps";
import { escapeLike } from "../../../lib/pagination";
import type { Viewer } from "../../../lib/session";
import { storage } from "../../../lib/storage";
import { followSets } from "../../social/pageFollows";
import { authorVisibleSql, profileOkSql, requireVisiblePost } from "../access";
import { PAGE_VIEWER_ID } from "../sources/types";
import { postFactsOf } from "./pagefacts";
import { commentPageOkSqlFor, commentVisibleSql, managesPost } from "./view";

/** Lignes lues par source avant de retirer ceux qui ne verraient pas la publication. */
const PER_SOURCE = 40;

type Candidate = { userId: string; pseudo: string; avatarKey: string | null };

export async function mentionSuggestions(
  v: Viewer,
  postId: string,
  q: string,
  /** Lot R9a : en casquette, la conversation et les comptes publics que la page suit, rien du réseau de la personne. */
  page: Actor | null = null,
): Promise<MentionSuggestion[]> {
  const row = await requireVisiblePost(v, postId);
  const at = now();
  const viewerId = page ? PAGE_VIEWER_ID : v.user.id;
  const manages = page ? false : await managesPost(v, row.post);
  const nameFilter = q ? sql`lower(${profiles.pseudo}) like ${`${escapeLike(q.toLowerCase())}%`}` : sql`true`;
  const live = and(
    profileOkSql("profiles", at),
    sql`${profiles.userId} <> ${v.user.id}`,
    nameFilter,
    // Une page ne cite que des comptes publics.
    page ? sql`${profiles.visibility} = 'public'` : undefined,
  );
  const pick = { userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey };

  const rootPerson = manages ? profileOkSql("rp", at) : authorVisibleSql("rp", sql`rc.author_id`, viewerId, at);
  // Une racine de page suit les règles d'une page (comme commentVisibleSql), pas la confidentialité du compte derrière elle.
  const rootVisible = sql`(case when rc.persona <> 'fan' then (rp.banned_at is null and ${commentPageOkSqlFor("rc")}) else ${rootPerson} end)`;
  // Ceux qui ont déjà commenté cette publication et dont je peux lire les commentaires, les plus récents d'abord.
  const thread: Candidate[] = await db
    .select(pick)
    .from(feedPostComments)
    .innerJoin(profiles, eq(profiles.userId, feedPostComments.authorId))
    .where(
      and(
        eq(feedPostComments.postId, row.post.id),
        isNull(feedPostComments.deletedAt),
        // Jamais le compte derrière un commentaire de page (lot R9a).
        eq(feedPostComments.persona, "fan"),
        commentVisibleSql(viewerId, manages, at),
        // Une réponse ne compte que si son commentaire de premier niveau se lit aussi (ni supprimé, ni d'un compte privé non suivi).
        sql`(${feedPostComments.parentId} is null or exists (select 1 from feed_post_comments rc join profiles rp on rp.user_id = rc.author_id
          where rc.id = ${feedPostComments.parentId} and rc.deleted_at is null and ${rootVisible}))`,
        live,
      ),
    )
    .groupBy(profiles.userId, profiles.pseudo, profiles.avatarKey)
    .orderBy(desc(sql`max(${feedPostComments.createdAt})`))
    .limit(PER_SOURCE);

  let following: Candidate[];
  if (page) {
    const followed = [...(await followSets(page, at)).users];
    following = followed.length
      ? await db
          .select(pick)
          .from(profiles)
          .where(and(inArray(profiles.userId, followed), live))
          .orderBy(sql`lower(${profiles.pseudo})`)
          .limit(PER_SOURCE)
      : [];
  } else {
    following = await db
      .select(pick)
      .from(userFollows)
      .innerJoin(profiles, eq(profiles.userId, userFollows.followedId))
      .where(and(eq(userFollows.followerId, viewerId), eq(userFollows.status, "accepted"), live))
      .orderBy(sql`lower(${profiles.pseudo})`)
      .limit(PER_SOURCE);
  }

  // Ceux qui me suivent : un lien de la personne, jamais proposé à une page.
  const followers: Candidate[] = page
    ? []
    : await db
        .select(pick)
        .from(userFollows)
        .innerJoin(profiles, eq(profiles.userId, userFollows.followerId))
        .where(and(eq(userFollows.followedId, viewerId), eq(userFollows.status, "accepted"), live))
        .orderBy(sql`lower(${profiles.pseudo})`)
        .limit(PER_SOURCE);

  let onEvent: Candidate[] = [];
  if (q && row.post.eventId && !page) {
    const [event] = await db.select({ endsAt: events.endsAt }).from(events).where(eq(events.id, row.post.eventId));
    // Après la fin de l'événement on ne dit plus qui était retenu (les absents ne se déduisent jamais).
    if (event && event.endsAt > at) {
      onEvent = await db
        .selectDistinct(pick)
        .from(applications)
        .innerJoin(profiles, eq(profiles.userId, applications.userId))
        .where(
          and(
            eq(applications.eventId, row.post.eventId),
            eq(applications.status, "accepted"),
            inArray(applications.kind, ["vehicle", "provider"]),
            live,
            sql`(${profiles.visibility} = 'public' or exists (select 1 from user_follows uf where uf.follower_id = ${viewerId}
              and uf.followed_id = ${profiles.userId} and uf.status = 'accepted'))`,
          ),
        )
        .limit(PER_SOURCE);
    }
  }

  const groups: [MentionWhy, Candidate[]][] = [
    ["thread", thread],
    ["following", following],
    ["follower", followers],
    ["event", onEvent],
  ];
  const seen = new Set<string>();
  const merged: (Candidate & { why: MentionWhy })[] = [];
  for (const [why, list] of groups) {
    for (const c of list) {
      if (seen.has(c.userId)) continue;
      seen.add(c.userId);
      merged.push({ ...c, why });
    }
  }
  if (!merged.length) return [];

  // Seulement des personnes qui peuvent voir la publication (même règle que sa lecture).
  const facts = await postFactsOf(db, row, at);
  const followsAuthor = new Set(
    (
      await db
        .select({ id: userFollows.followerId })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.followedId, row.post.authorId),
            eq(userFollows.status, "accepted"),
            inArray(
              userFollows.followerId,
              merged.map((m) => m.userId),
            ),
          ),
        )
    ).map((r) => r.id),
  );
  return merged
    .filter((m) => canSeeFeedPost({ userId: m.userId }, facts, { followAccepted: followsAuthor.has(m.userId) }))
    .slice(0, FEED_MENTION_SUGGESTIONS_MAX)
    .map((m) => ({ pseudo: m.pseudo, avatarUrl: storage.url(m.avatarKey), why: m.why }));
}
