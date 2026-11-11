// Qui peut lire un commentaire (lot R8k1, tour 2) : la règle des notifications, de leur livraison différée et de la
// revérification. Un destinataire est prévenu seulement s'il est en règle, **voit la publication** (`canSeeFeedPost`) et
// **lit le commentaire** (`canSeeComment`, son premier niveau compris) : le texte et le pseudo de qui commente ne partent
// jamais vers quelqu'un qui n'y a plus accès (compte passé privé, abonné retiré).
import { canSeeComment, canSeeFeedPost } from "@orasso/shared";
import { and, eq, inArray } from "drizzle-orm";

import { feedPostComments, profiles, userFollows } from "../../../db/schema";
import { now } from "../../../lib/deps";
import type { Executor } from "../../../lib/tx";
import { factsOf, postWithAuthor, profileOkSql, unavailable } from "../access";
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
  const facts = factsOf(post, at);
  return new Set(
    alive.filter(
      (userId) =>
        canSeeFeedPost({ userId }, facts, { followAccepted: ofPostAuthor.has(userId) }) &&
        (!root ||
          canSeeComment(
            { userId, managesPost: userId === post.post.authorId },
            {
              authorId: root.authorId,
              authorVisibility: root.visibility,
              authorUnavailable: root.unavailable,
              deleted: false,
            },
            { followAccepted: ofRoot.has(userId) },
          )) &&
        canSeeComment(
          { userId, managesPost: userId === post.post.authorId },
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
  return canSeeFeedPost({ userId }, factsOf(post, at), { followAccepted: Boolean(self) });
}
