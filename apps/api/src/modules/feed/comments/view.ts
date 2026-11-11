// Commentaires d'une publication (lot R8k1) : qui voit quoi, et la vue rendue (liste blanche de `FeedCommentView`).
// Toute lecture suppose la publication visible (`requireVisiblePost`) puis applique `canSeeComment` : en SQL pour les
// listes (même règle, testée ensemble), en TypeScript pour un commentaire seul.
import { type CommentViewer, canSeeComment, type FeedCommentView, feedCommentLabels } from "@orasso/shared";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { feedCommentMentions, feedPostCommentReactions, feedPostComments, profiles } from "../../../db/schema";
import { canManagePost } from "../../../lib/authorship";
import { now } from "../../../lib/deps";
import { AppError, notFound } from "../../../lib/errors";
import type { Viewer } from "../../../lib/session";
import type { Executor } from "../../../lib/tx";
import { authorVisibleSql, profileOkSql, relationOf, requireVisiblePost, UUID_RE, unavailable } from "../access";
import { personAuthorView } from "../posts";

export type PostRow = Awaited<ReturnType<typeof requireVisiblePost>>;
export type CommentRow = typeof feedPostComments.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type CommentWithAuthor = { c: CommentRow; p: Profile };

/**
 * Le compte gère-t-il cette publication (son auteur, ou la page avec second facteur) ? Pour **lire**, une erreur (second
 * facteur manquant) vaut « non » : on ne montre simplement pas ce qu'un responsable verrait. Pour **agir**, voir `strict`.
 */
export async function managesPost(v: Viewer, post: PostRow["post"], ex: Executor = db): Promise<boolean> {
  try {
    return await canManagePost(v, post, ex);
  } catch (error) {
    if (error instanceof AppError) return false;
    throw error;
  }
}

/** Comme `managesPost`, mais l'erreur d'une page (second facteur manquant) remonte telle quelle : pour supprimer, couper. */
export const managesPostStrict = (v: Viewer, post: PostRow["post"], ex: Executor = db) => canManagePost(v, post, ex);

/**
 * Condition SQL « ce commentaire est servi à ce lecteur » (la table `profiles` est celle de l'auteur du commentaire). Le
 * commentaire d'un compte privé n'est servi qu'à lui, à ses abonnés acceptés et à qui gère la publication ; un auteur
 * supprimé, banni ou suspendu n'est jamais servi.
 */
export function commentVisibleSql(viewerId: string, manages: boolean, at: Date): SQL {
  return manages
    ? profileOkSql("profiles", at)
    : authorVisibleSql("profiles", sql`${feedPostComments.authorId}`, viewerId, at);
}

/** Le commentaire (avec son auteur) et la publication, ou `undefined` (identifiant mal formé, inconnu). */
export async function commentRow(id: string, ex: Executor = db) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await ex
    .select({ c: feedPostComments, p: profiles })
    .from(feedPostComments)
    .innerJoin(profiles, eq(profiles.userId, feedPostComments.authorId))
    .where(eq(feedPostComments.id, id));
  return row;
}

/** Le commentaire de premier niveau d'une réponse est-il supprimé ? (une réponse suit son commentaire.) */
async function rootDeleted(c: CommentRow, ex: Executor): Promise<boolean> {
  if (!c.parentId) return false;
  const [root] = await ex
    .select({ deletedAt: feedPostComments.deletedAt })
    .from(feedPostComments)
    .where(eq(feedPostComments.id, c.parentId));
  return !root || root.deletedAt !== null;
}

/**
 * Un commentaire que `v` peut lire : la publication doit être visible (404 sinon, sans rien révéler), puis le commentaire
 * lui-même (supprimé, auteur hors règle, compte privé non suivi : 404). Rend aussi si `v` gère la publication.
 */
export async function requireVisibleComment(v: Viewer, id: string, ex: Executor = db) {
  const row = await commentRow(id, ex);
  if (!row) throw notFound(feedCommentLabels.commentNotFound);
  const post = await requireVisiblePost(v, row.c.postId, ex).catch((error: unknown) => {
    if (error instanceof AppError && error.status === 404) throw notFound(feedCommentLabels.commentNotFound);
    throw error;
  });
  const manages = await managesPost(v, post.post, ex);
  const at = now();
  const rel = await relationOf(v.user.id, row.c.authorId, ex);
  const viewer: CommentViewer = { userId: v.user.id, managesPost: manages };
  const visible = canSeeComment(
    viewer,
    {
      authorId: row.c.authorId,
      authorVisibility: row.p.visibility,
      authorUnavailable: unavailable(row.p, at),
      deleted: row.c.deletedAt !== null || (await rootDeleted(row.c, ex)),
    },
    rel,
  );
  if (!visible) throw notFound(feedCommentLabels.commentNotFound);
  return { ...row, post, manages };
}

/** Les commentaires rendus, dans l'ordre reçu : flammes de `v`, pseudos cités (en règle), `mine`, `canDelete`. */
export async function toViews(
  ex: Executor,
  rows: CommentWithAuthor[],
  v: Viewer,
  manages: boolean,
  at: Date,
): Promise<FeedCommentView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.c.id);
  const reacted = new Set(
    (
      await ex
        .select({ id: feedPostCommentReactions.commentId })
        .from(feedPostCommentReactions)
        .where(and(inArray(feedPostCommentReactions.commentId, ids), eq(feedPostCommentReactions.userId, v.user.id)))
    ).map((r) => r.id),
  );
  const mentionRows = await ex
    .select({ id: feedCommentMentions.commentId, pseudo: profiles.pseudo })
    .from(feedCommentMentions)
    .innerJoin(profiles, eq(profiles.userId, feedCommentMentions.userId))
    .where(and(inArray(feedCommentMentions.commentId, ids), profileOkSql("profiles", at)));
  const mentions = new Map<string, string[]>();
  for (const m of mentionRows) mentions.set(m.id, [...(mentions.get(m.id) ?? []), m.pseudo]);
  return rows.map(({ c, p }) => ({
    id: c.id,
    author: personAuthorView(c.authorId, p),
    text: c.text,
    createdAt: c.createdAt.toISOString(),
    mentions: mentions.get(c.id) ?? [],
    reactionsCount: c.reactionsCount,
    reactedByMe: reacted.has(c.id),
    repliesCount: c.repliesCount,
    mine: c.authorId === v.user.id,
    canDelete: c.authorId === v.user.id || manages,
  }));
}
