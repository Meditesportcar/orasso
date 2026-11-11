// Notifications d'un nouveau commentaire (lot R8k1, ARCHITECTURE-R8 § 2.6). Au plus **une par personne et par
// commentaire**, par ordre de priorité : citation (`feed_comment_mention`), puis réponse (`feed_comment_reply`), puis
// l'auteur de la publication (`feed_comment`, une ligne non lue par publication, jamais une par commentaire). Jamais à soi,
// jamais à un compte hors règle, jamais à quelqu'un qui ne pourrait pas lire le commentaire (le texte part dans la
// notification : le commentaire d'un compte privé ne sort pas vers qui ne le suit pas). Écrit dans la transaction du
// commentaire ; `kick()` part dans `after`.
import { canSeeComment, commentExcerpt, feedCommentLabels, r8NotificationTable } from "@orasso/shared";
import { and, eq, inArray } from "drizzle-orm";

import { profiles, userFollows } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import type { Tx } from "../../../lib/tx";
import { notificationsService } from "../../notifications/service";
import { profileOkSql } from "../access";

type Actor = { userId: string; pseudo: string; avatarUrl: string | null };
type Commenter = { userId: string; pseudo: string; avatarKey: string | null; visibility: "public" | "private" };

export type NewCommentContext = {
  tx: Tx;
  after: (cb: () => unknown) => void;
  at: Date;
  commenter: Commenter;
  postId: string;
  /** La personne qui a publié (pour une page : celle qui a publié, T7 / livraison 3 pour la structure). */
  postAuthorId: string;
  commentId: string;
  text: string;
  /** Le commentaire auquel on répond (avant rattachement au premier niveau) : son identifiant et son auteur. */
  repliedTo: { id: string; authorId: string } | null;
  /** Pseudos cités qui peuvent voir la publication (déjà filtrés : en règle, ni soi-même). */
  mentioned: string[];
};

/** Qui, parmi ces comptes, est en règle (ni supprimé, ni banni, ni suspendu à `at`). */
async function liveIds(tx: Tx, ids: string[], at: Date): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await tx
    .select({ id: profiles.userId })
    .from(profiles)
    .where(and(inArray(profiles.userId, ids), profileOkSql("profiles", at)));
  return new Set(rows.map((r) => r.id));
}

export async function notifyNewComment(ctx: NewCommentContext): Promise<void> {
  const { tx, commenter, at } = ctx;
  const actor: Actor = {
    userId: commenter.userId,
    pseudo: commenter.pseudo,
    avatarUrl: storage.url(commenter.avatarKey),
  };
  const body = feedCommentLabels.quote(commentExcerpt(ctx.text));
  const candidates = [
    ...new Set([...ctx.mentioned, ctx.repliedTo?.authorId, ctx.postAuthorId].filter((x): x is string => !!x)),
  ].filter((id) => id !== commenter.userId);
  const live = await liveIds(tx, candidates, at);
  // Qui lit le commentaire : un compte privé n'est lu que de ses abonnés acceptés (et de l'auteur de la publication).
  const followers =
    commenter.visibility === "private" && candidates.length
      ? new Set(
          (
            await tx
              .select({ id: userFollows.followerId })
              .from(userFollows)
              .where(
                and(
                  eq(userFollows.followedId, commenter.userId),
                  eq(userFollows.status, "accepted"),
                  inArray(userFollows.followerId, candidates),
                ),
              )
          ).map((r) => r.id),
        )
      : new Set<string>();
  const canRead = (userId: string) =>
    live.has(userId) &&
    canSeeComment(
      { userId, managesPost: userId === ctx.postAuthorId },
      {
        authorId: commenter.userId,
        authorVisibility: commenter.visibility,
        authorUnavailable: false,
        deleted: false,
      },
      { followAccepted: followers.has(userId) },
    );

  const notified = new Set<string>([commenter.userId]);
  const data = (extra: Record<string, unknown> = {}) => ({
    postId: ctx.postId,
    commentId: ctx.commentId,
    link: "/app/fil",
    ...extra,
  });

  // 1. Cité : une notification par personne, rangée sous la clé du commentaire (une seule ligne possible).
  for (const userId of ctx.mentioned) {
    if (notified.has(userId) || !canRead(userId)) continue;
    notified.add(userId);
    await notificationsService.notify(tx, userId, "feed_comment_mention", {
      title: r8NotificationTable.feed_comment_mention.title,
      body,
      data: data(),
      groupKey: `feed_comment_mention:${ctx.commentId}`,
      actor,
      after: ctx.after,
    });
  }

  // 2. Réponse : l'auteur du commentaire auquel on répond ; les réponses de la journée se regroupent.
  const replied = ctx.repliedTo;
  if (replied && !notified.has(replied.authorId) && canRead(replied.authorId)) {
    notified.add(replied.authorId);
    await notificationsService.notify(tx, replied.authorId, "feed_comment_reply", {
      title: r8NotificationTable.feed_comment_reply.title,
      body,
      data: data({ parentId: replied.id }),
      groupKey: `feed_comment_reply:${replied.id}`,
      actor,
      after: ctx.after,
    });
  }

  // 3. L'auteur de la publication : une ligne non lue par publication, les personnes s'ajoutent à la même ligne.
  if (!notified.has(ctx.postAuthorId) && canRead(ctx.postAuthorId)) {
    notified.add(ctx.postAuthorId);
    await notificationsService.notify(tx, ctx.postAuthorId, "feed_comment", {
      title: r8NotificationTable.feed_comment.title,
      body,
      data: data(),
      groupKey: `feed_comment:${ctx.postId}`,
      actor,
      after: ctx.after,
    });
  }
  ctx.after(() => notificationsService.kick());
}

/** Une flamme sur un commentaire : Journal seul, regroupée par commentaire. Jamais à soi-même. */
export async function notifyCommentLike(args: {
  tx: Tx;
  after: (cb: () => unknown) => void;
  at: Date;
  commentId: string;
  postId: string;
  commentAuthorId: string;
  liker: { userId: string; pseudo: string; avatarKey: string | null };
}): Promise<void> {
  const { tx, liker } = args;
  if (liker.userId === args.commentAuthorId) return;
  if (!(await liveIds(tx, [args.commentAuthorId], args.at)).has(args.commentAuthorId)) return;
  await notificationsService.notify(tx, args.commentAuthorId, "feed_comment_like", {
    title: r8NotificationTable.feed_comment_like.title,
    body: r8NotificationTable.feed_comment_like.body,
    data: { postId: args.postId, commentId: args.commentId, link: "/app/fil" },
    groupKey: `feed_comment_like:${args.commentId}`,
    actor: { userId: liker.userId, pseudo: liker.pseudo, avatarUrl: storage.url(liker.avatarKey) },
    after: args.after,
  });
}
