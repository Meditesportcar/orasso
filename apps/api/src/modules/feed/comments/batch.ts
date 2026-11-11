// Lecture du Journal en lot (lot R8k1, tour 7). `readableBatch` est `stillReadable` pour beaucoup de commentaires à la fois :
// même règle, mêmes verdicts, mais un nombre **fixe** de requêtes (commentaires et auteurs, commentaires de premier niveau,
// publications et auteurs, profil du destinataire, ses abonnements) quel que soit le nombre de lignes. La garde de lecture
// du Journal et de la pastille (`registerJournalGuard`) s'en sert pour toutes les lignes `feed_comment*` d'une page.
import { canSeeComment, canSeeFeedPost, type FeedPostFacts } from "@orasso/shared";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "../../../db/client";
import { feedPostComments, feedPosts, type notifications, profiles, userFollows } from "../../../db/schema";
import { now } from "../../../lib/deps";
import type { Executor } from "../../../lib/tx";
import { registerJournalGuard } from "../../notifications/service";
import { profileOkSql, unavailable } from "../access";
import { COMMENT_TYPES, groupScopeKeys } from "./notify";
import { factsMapOf } from "./pagefacts";

type Row = typeof notifications.$inferSelect;

/** Lesquels de ces commentaires `userId` lit-il encore ? (Verdicts identiques à `stillReadable`.) */
export async function readableBatch(
  ex: Executor,
  userId: string,
  commentIds: string[],
): Promise<{ readable: Set<string>; authorOf: Map<string, string>; pseudoOf: Map<string, string> }> {
  const readable = new Set<string>();
  const authorOf = new Map<string, string>();
  const pseudoOf = new Map<string, string>();
  const ids = [...new Set(commentIds)];
  if (!ids.length) return { readable, authorOf, pseudoOf };
  const at = now();
  const rows = await ex
    .select({ c: feedPostComments, p: profiles })
    .from(feedPostComments)
    .innerJoin(profiles, eq(profiles.userId, feedPostComments.authorId))
    .where(inArray(feedPostComments.id, ids));
  for (const r of rows) {
    authorOf.set(r.c.id, r.c.authorId);
    pseudoOf.set(r.c.authorId, r.p.pseudo);
  }
  const rootIds = [...new Set(rows.flatMap((r) => (r.c.parentId ? [r.c.parentId] : [])))];
  const roots = rootIds.length
    ? await ex
        .select({ c: feedPostComments, p: profiles })
        .from(feedPostComments)
        .innerJoin(profiles, eq(profiles.userId, feedPostComments.authorId))
        .where(inArray(feedPostComments.id, rootIds))
    : [];
  const rootById = new Map(roots.map((r) => [r.c.id, r]));
  const postIds = [...new Set(rows.map((r) => r.c.postId))];
  const posts = postIds.length
    ? await ex
        .select({ post: feedPosts, author: profiles })
        .from(feedPosts)
        .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
        .where(inArray(feedPosts.id, postIds))
    : [];
  const postById = new Map(posts.map((p) => [p.post.id, p]));
  const [me] = await ex
    .select({ id: profiles.userId })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), profileOkSql("profiles", at)));
  const people = [
    ...new Set([
      ...rows.map((r) => r.c.authorId),
      ...roots.map((r) => r.c.authorId),
      ...posts.map((p) => p.post.authorId),
    ]),
  ];
  const followed = people.length
    ? new Set(
        (
          await ex
            .select({ id: userFollows.followedId })
            .from(userFollows)
            .where(
              and(
                eq(userFollows.followerId, userId),
                eq(userFollows.status, "accepted"),
                inArray(userFollows.followedId, people),
              ),
            )
        ).map((r) => r.id),
      )
    : new Set<string>();
  const facts = await factsMapOf(ex, posts, at);
  for (const r of rows) {
    if (r.c.deletedAt || unavailable(r.p, at)) continue;
    const root = r.c.parentId ? rootById.get(r.c.parentId) : null;
    if (r.c.parentId && (!root || root.c.deletedAt)) continue;
    const post = postById.get(r.c.postId);
    if (!post) continue;
    const seesPost = canSeeFeedPost({ userId }, facts.get(r.c.postId) as FeedPostFacts, {
      followAccepted: followed.has(post.post.authorId),
    });
    if (userId === r.c.authorId) {
      if (seesPost) readable.add(r.c.id);
      continue;
    }
    if (!me || !seesPost) continue;
    const viewer = { userId, managesPost: userId === post.post.authorId };
    if (
      root &&
      !canSeeComment(
        viewer,
        {
          authorId: root.c.authorId,
          authorVisibility: root.p.visibility,
          authorUnavailable: unavailable(root.p, at),
          deleted: false,
        },
        { followAccepted: followed.has(root.c.authorId) },
      )
    ) {
      continue;
    }
    const sees = canSeeComment(
      viewer,
      { authorId: r.c.authorId, authorVisibility: r.p.visibility, authorUnavailable: false, deleted: false },
      { followAccepted: followed.has(r.c.authorId) },
    );
    if (sees) readable.add(r.c.id);
  }
  return { readable, authorOf, pseudoOf };
}

type Verdict = { shown: boolean; actors?: string[]; commentReadable?: boolean };
type Cand = { id: string; authorId: string; postId: string; replyToId: string | null };

/**
 * Verdict de toutes les lignes `feed_comment*` d'une page (ou de la pastille) pour leur destinataire. Une ligne tient tant
 * qu'un de ses commentaires se lit ; pour une ligne regroupée, `actors` ne nomme que les personnes dont un commentaire se
 * lit (au plus les 15 plus récents de chacune, comme la recherche de remplacement de la garde de livraison).
 */
export async function commentNotificationVerdicts(userId: string, rows: Row[]): Promise<Map<string, Verdict>> {
  const c = feedPostComments;
  const out = new Map<string, Verdict>();
  const groups = rows.flatMap((n) => {
    const g = groupScopeKeys(n);
    return g ? [{ n, g }] : [];
  });
  const posts = [...new Set(groups.flatMap(({ g }) => (g.kind === "post" ? [g.key] : [])))];
  const targets = [...new Set(groups.flatMap(({ g }) => (g.kind === "reply" ? [g.key] : [])))];
  const actorUnion = [...new Set(groups.flatMap(({ g }) => g.actorIds))];
  const pool: Cand[] = [];
  const pick = { id: c.id, authorId: c.authorId, postId: c.postId, replyToId: c.replyToId };
  if (actorUnion.length && posts.length) {
    pool.push(
      ...(await db
        .select(pick)
        .from(c)
        .where(
          and(inArray(c.postId, posts), isNull(c.deletedAt), inArray(c.authorId, actorUnion), ne(c.authorId, userId)),
        )
        .orderBy(desc(c.createdAt), desc(c.id))
        .limit(2000)),
    );
  }
  if (actorUnion.length && targets.length) {
    pool.push(
      ...(await db
        .select(pick)
        .from(c)
        .where(
          and(
            inArray(c.replyToId, targets),
            isNull(c.deletedAt),
            inArray(c.authorId, actorUnion),
            ne(c.authorId, userId),
          ),
        )
        .orderBy(desc(c.createdAt), desc(c.id))
        .limit(2000)),
    );
  }
  const candidatesOf = (g: { kind: "post" | "reply"; key: string; actorIds: string[] }) => {
    const seen = new Map<string, number>();
    const mine: Cand[] = [];
    for (const cand of pool) {
      if (!g.actorIds.includes(cand.authorId)) continue;
      if (g.kind === "post" ? cand.postId !== g.key : cand.replyToId !== g.key) continue;
      const k = seen.get(cand.authorId) ?? 0;
      if (k >= 15) continue;
      seen.set(cand.authorId, k + 1);
      mine.push(cand);
    }
    return mine;
  };
  const byGroup = new Map(groups.map(({ n, g }) => [n.id, candidatesOf(g)]));
  const commentIds = rows.flatMap((n) => {
    const id = (n.data as { commentId?: unknown }).commentId;
    return typeof id === "string" ? [id] : [];
  });
  const extra = [...byGroup.values()].flatMap((list) => list.map((x) => x.id));
  const { readable, authorOf, pseudoOf } = await readableBatch(db, userId, [...commentIds, ...extra]);
  for (const n of rows) {
    const id = (n.data as { commentId?: unknown }).commentId;
    if (typeof id !== "string") {
      out.set(n.id, { shown: true });
      continue;
    }
    const cands = byGroup.get(n.id);
    if (!cands) {
      out.set(n.id, { shown: readable.has(id), commentReadable: readable.has(id) });
      continue;
    }
    const authors = new Set(cands.filter((x) => readable.has(x.id)).map((x) => x.authorId));
    const own = readable.has(id) ? authorOf.get(id) : undefined;
    if (own) authors.add(own);
    out.set(n.id, {
      shown: authors.size > 0,
      commentReadable: readable.has(id),
      actors: [...authors].flatMap((a) => pseudoOf.get(a) ?? []),
    });
  }
  return out;
}

registerJournalGuard([...COMMENT_TYPES], commentNotificationVerdicts);
