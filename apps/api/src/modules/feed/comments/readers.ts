// Qui peut lire un commentaire (lot R8k1, tour 2) : la règle des notifications, de leur livraison différée et de la
// revérification. Un destinataire est prévenu seulement s'il est en règle, **voit la publication** (`canSeeFeedPost`) et
// **lit le commentaire** (`canSeeComment`, son premier niveau compris) : le texte et le pseudo de qui commente ne partent
// jamais vers quelqu'un qui n'y a plus accès (compte passé privé, abonné retiré).
import { canSeeComment, canSeeFeedPost, type FeedPostFacts } from "@orasso/shared";
import { and, eq, inArray } from "drizzle-orm";

import { feedPostComments, feedPosts, profiles, userFollows } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { storage } from "../../../lib/storage";
import type { Executor } from "../../../lib/tx";
import { postWithAuthor, profileOkSql, unavailable } from "../access";
import { factsMapOf, postFactsOf } from "./pagefacts";
import { anyOf } from "./sqlany";
import { commentRow } from "./view";

type PostRow = NonNullable<Awaited<ReturnType<typeof postWithAuthor>>>;
type Commenter = { userId: string; visibility: "public" | "private" };
/** Le commentaire de premier niveau d'une réponse : son auteur et sa confidentialité (il doit être lisible aussi). */
export type RootComment = { authorId: string; visibility: "public" | "private"; unavailable: boolean };

/** Parmi `ids`, ceux qui sont en règle, voient la publication et lisent un commentaire de `commenter` (jamais `commenter` lui-même). */
export async function commentReaders(
  ex: Executor,
  post: PostRow,
  commenter: Commenter,
  ids: string[],
  at: Date,
  root: RootComment | null = null,
): Promise<Set<string>> {
  const wanted = [...new Set(ids)].filter((id) => id !== commenter.userId);
  if (!wanted.length) return new Set();
  const live = new Set(
    (
      await ex
        .select({ id: profiles.userId })
        .from(profiles)
        .where(and(inArray(profiles.userId, wanted), profileOkSql("profiles", at)))
    ).map((r) => r.id),
  );
  const alive = wanted.filter((id) => live.has(id));
  if (!alive.length) return new Set();
  const follows = async (followedId: string) =>
    new Set(
      (
        await ex
          .select({ id: userFollows.followerId })
          .from(userFollows)
          .where(
            and(
              eq(userFollows.followedId, followedId),
              eq(userFollows.status, "accepted"),
              inArray(userFollows.followerId, alive),
            ),
          )
      ).map((r) => r.id),
    );
  const ofPostAuthor = await follows(post.post.authorId);
  const ofCommenter = commenter.visibility === "private" ? await follows(commenter.userId) : new Set<string>();
  const ofRoot = root && root.visibility === "private" ? await follows(root.authorId) : new Set<string>();
  const facts = await postFactsOf(ex, post, at);
  return new Set(
    alive.filter(
      (userId) =>
        canSeeFeedPost({ userId }, facts, { followAccepted: ofPostAuthor.has(userId) }) &&
        (!root ||
          canSeeComment(
            { userId, managesPost: post.post.persona === "fan" && userId === post.post.authorId },
            {
              authorId: root.authorId,
              authorVisibility: root.visibility,
              authorUnavailable: root.unavailable,
              deleted: false,
            },
            { followAccepted: ofRoot.has(userId) },
          )) &&
        canSeeComment(
          { userId, managesPost: post.post.persona === "fan" && userId === post.post.authorId },
          {
            authorId: commenter.userId,
            authorVisibility: commenter.visibility,
            authorUnavailable: false,
            deleted: false,
          },
          { followAccepted: ofCommenter.has(userId) },
        ),
    ),
  );
}

/**
 * `userId` voit-il encore ce commentaire (et sa publication) ? Faux si le commentaire ou son premier niveau est retiré, si
 * son auteur n'est plus en règle, si la publication n'est plus visible de lui. Sert à la garde de livraison.
 */
export async function stillReadable(ex: Executor, userId: string, commentId: string): Promise<boolean> {
  const row = await commentRow(commentId, ex);
  if (!row || row.c.deletedAt) return false;
  const at = now();
  if (unavailable(row.p, at)) return false;
  let root: RootComment | null = null;
  if (row.c.parentId) {
    const top = await commentRow(row.c.parentId, ex);
    if (!top || top.c.deletedAt) return false;
    root = { authorId: top.c.authorId, visibility: top.p.visibility, unavailable: unavailable(top.p, at) };
  }
  const post = await postWithAuthor(row.c.postId, ex);
  if (!post) return false;
  const readers = await commentReaders(
    ex,
    post,
    { userId: row.c.authorId, visibility: row.p.visibility },
    [userId],
    at,
    root,
  );
  // L'auteur du commentaire le lit toujours tant qu'il voit la publication (la flamme qu'il reçoit).
  if (readers.has(userId)) return true;
  if (userId !== row.c.authorId) return false;
  const [self] = await ex
    .select({ id: userFollows.followerId })
    .from(userFollows)
    .where(
      and(
        eq(userFollows.followerId, userId),
        eq(userFollows.followedId, post.post.authorId),
        eq(userFollows.status, "accepted"),
      ),
    );
  return canSeeFeedPost({ userId }, await postFactsOf(ex, post, at), { followAccepted: Boolean(self) });
}

/** Lesquels de ces commentaires `userId` lit-il encore ? (Verdicts identiques à `stillReadable`.) */
export async function readableBatch(
  ex: Executor,
  userId: string,
  commentIds: string[],
): Promise<{
  readable: Set<string>;
  authorOf: Map<string, string>;
  pseudoOf: Map<string, string>;
  avatarOf: Map<string, string | null>;
}> {
  const readable = new Set<string>();
  const authorOf = new Map<string, string>();
  const pseudoOf = new Map<string, string>();
  const avatarOf = new Map<string, string | null>();
  const ids = [...new Set(commentIds)];
  if (!ids.length) return { readable, authorOf, pseudoOf, avatarOf };
  const at = now();
  const rows = await ex
    .select({ c: feedPostComments, p: profiles })
    .from(feedPostComments)
    .innerJoin(profiles, eq(profiles.userId, feedPostComments.authorId))
    .where(anyOf(feedPostComments.id, ids, "uuid"));
  for (const r of rows) {
    authorOf.set(r.c.id, r.c.authorId);
    pseudoOf.set(r.c.authorId, r.p.pseudo);
    avatarOf.set(r.p.pseudo, storage.url(r.p.avatarKey));
  }
  const rootIds = [...new Set(rows.flatMap((r) => (r.c.parentId ? [r.c.parentId] : [])))];
  const roots = rootIds.length
    ? await ex
        .select({ c: feedPostComments, p: profiles })
        .from(feedPostComments)
        .innerJoin(profiles, eq(profiles.userId, feedPostComments.authorId))
        .where(anyOf(feedPostComments.id, rootIds, "uuid"))
    : [];
  const rootById = new Map(roots.map((r) => [r.c.id, r]));
  const postIds = [...new Set(rows.map((r) => r.c.postId))];
  const posts = postIds.length
    ? await ex
        .select({ post: feedPosts, author: profiles })
        .from(feedPosts)
        .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
        .where(anyOf(feedPosts.id, postIds, "uuid"))
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
                anyOf(userFollows.followedId, people, "text"),
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
    const viewer = { userId, managesPost: post.post.persona === "fan" && userId === post.post.authorId };
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
  return { readable, authorOf, pseudoOf, avatarOf };
}
