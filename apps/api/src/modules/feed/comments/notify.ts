// Notifications d'un nouveau commentaire (lot R8k1, ARCHITECTURE-R8 § 2.6). Au plus **une par personne et par
// commentaire**, par ordre de priorité : citation (`feed_comment_mention`), puis réponse (`feed_comment_reply`), puis
// l'auteur de la publication (`feed_comment`, une ligne non lue par publication, jamais une par commentaire). Jamais à soi,
// jamais à un compte hors règle, jamais à quelqu'un qui ne voit plus la publication ou ne lit pas le commentaire
// (`commentReaders`) : le texte et le pseudo ne partent pas vers qui n'y a plus accès. Écrit dans la transaction du
// commentaire ; `kick()` part dans `after`.
//
// Une ligne regroupée (plusieurs personnes) n'a **pas** d'extrait : il serait attribué à la première personne nommée alors
// qu'il vient de la dernière. Seule la première occurrence d'une ligne cite le début du commentaire (120 caractères).
import { commentExcerpt, feedCommentLabels, r8NotificationTable } from "@orasso/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { notifications } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import type { Tx } from "../../../lib/tx";
import { notificationsService, registerDeliveryGuard } from "../../notifications/service";
import { postWithAuthor, unavailable } from "../access";
import { commentReaders, stillReadable } from "./readers";
import { commentRow } from "./view";

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
  /** Le commentaire de premier niveau quand c'est une réponse. */
  rootId?: string | null;
  /** Personnes citées (en règle, ni soi-même) : seules celles qui lisent le commentaire sont prévenues. */
  mentioned: string[];
};

/** Une ligne non lue de cette clé existe-t-elle déjà (la prochaine occurrence s'y ajoutera) ? */
async function hasOpenLine(tx: Tx, userId: string, groupKey: string): Promise<boolean> {
  const [open] = await tx
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.groupKey, groupKey),
        isNull(notifications.readAt),
        sql`${notifications.createdAt} > now() - interval '24 hours'`,
      ),
    )
    .limit(1);
  return Boolean(open);
}

export async function notifyNewComment(ctx: NewCommentContext): Promise<void> {
  const { tx, commenter, at } = ctx;
  const post = await postWithAuthor(ctx.postId, tx);
  if (!post) return;
  const actor: Actor = {
    userId: commenter.userId,
    pseudo: commenter.pseudo,
    avatarUrl: storage.url(commenter.avatarKey),
  };
  const quote = feedCommentLabels.quote(commentExcerpt(ctx.text));
  const candidates = [...new Set([...ctx.mentioned, ctx.repliedTo?.authorId, ctx.postAuthorId])].filter(
    (id): id is string => !!id,
  );
  const top = ctx.rootId ? await commentRow(ctx.rootId, tx) : null;
  const root = top
    ? { authorId: top.c.authorId, visibility: top.p.visibility, unavailable: unavailable(top.p, at) }
    : null;
  const readers = await commentReaders(tx, post, commenter, candidates, at, root);
  const notified = new Set<string>([commenter.userId]);
  const data = (extra: Record<string, unknown> = {}) => ({
    postId: ctx.postId,
    commentId: ctx.commentId,
    link: "/app/fil",
    ...extra,
  });

  // 1. Cité : une notification par personne, rangée sous la clé du commentaire (une seule ligne possible).
  for (const userId of ctx.mentioned) {
    if (notified.has(userId) || !readers.has(userId)) continue;
    notified.add(userId);
    await notificationsService.notify(tx, userId, "feed_comment_mention", {
      title: r8NotificationTable.feed_comment_mention.title,
      body: quote,
      data: data(),
      groupKey: `feed_comment_mention:${ctx.commentId}`,
      actor,
      after: ctx.after,
    });
  }

  // 2. Réponse : l'auteur du commentaire auquel on répond ; les réponses de la journée se regroupent (sans extrait).
  const replied = ctx.repliedTo;
  if (replied && !notified.has(replied.authorId) && readers.has(replied.authorId)) {
    notified.add(replied.authorId);
    const groupKey = `feed_comment_reply:${replied.id}`;
    const merge = await hasOpenLine(tx, replied.authorId, groupKey);
    await notificationsService.notify(tx, replied.authorId, "feed_comment_reply", {
      title: r8NotificationTable.feed_comment_reply.title,
      body: merge ? r8NotificationTable.feed_comment_reply.body : quote,
      data: data({ parentId: replied.id }),
      groupKey,
      actor,
      after: ctx.after,
    });
  }

  // 3. L'auteur de la publication : une ligne non lue par publication, les personnes s'ajoutent à la même ligne.
  if (!notified.has(ctx.postAuthorId) && readers.has(ctx.postAuthorId)) {
    notified.add(ctx.postAuthorId);
    const groupKey = `feed_comment:${ctx.postId}`;
    const merge = await hasOpenLine(tx, ctx.postAuthorId, groupKey);
    await notificationsService.notify(tx, ctx.postAuthorId, "feed_comment", {
      title: r8NotificationTable.feed_comment.title,
      body: merge ? r8NotificationTable.feed_comment.body : quote,
      data: data(),
      groupKey,
      actor,
      after: ctx.after,
    });
  }
  ctx.after(() => notificationsService.kick());
}

/** Une flamme sur un commentaire : Journal seul, regroupée par commentaire. Jamais à soi, jamais sans accès à la publication. */
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
  if (!(await stillReadable(tx, args.commentAuthorId, args.commentId))) return;
  await notificationsService.notify(tx, args.commentAuthorId, "feed_comment_like", {
    title: r8NotificationTable.feed_comment_like.title,
    body: r8NotificationTable.feed_comment_like.body,
    data: { postId: args.postId, commentId: args.commentId, link: "/app/fil" },
    groupKey: `feed_comment_like:${args.commentId}`,
    actor: { userId: liker.userId, pseudo: liker.pseudo, avatarUrl: storage.url(liker.avatarKey) },
    after: args.after,
  });
}

const COMMENT_TYPES = ["feed_comment", "feed_comment_reply", "feed_comment_like", "feed_comment_mention"] as const;

/**
 * Retire des Journaux les notifications qui citent des commentaires retirés (suppression, modération, compte supprimé) :
 * citation et flamme (toujours à propos d'un seul commentaire), réponse ou commentaire à une seule personne dont le dernier
 * commentaire est retiré, et les réponses d'un commentaire de premier niveau retiré. Une ligne regroupée de plusieurs
 * personnes reste : elle n'a pas d'extrait (voir plus haut).
 */
export async function dropCommentNotifications(tx: Tx, commentIds: string[], postIds: string[] = []): Promise<void> {
  if (!commentIds.length) return;
  const ids = sql.join(
    commentIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const single = sql`coalesce((${notifications.data} ->> 'count')::int, 1) <= 1`;
  await tx.delete(notifications).where(
    and(
      inArray(notifications.type, [...COMMENT_TYPES]),
      sql`(
        (${notifications.type} in ('feed_comment_like', 'feed_comment_mention') and ${notifications.data} ->> 'commentId' in (${ids}))
        or (${notifications.type} in ('feed_comment', 'feed_comment_reply') and ${single} and ${notifications.data} ->> 'commentId' in (${ids}))
        or (${notifications.type} = 'feed_comment_reply' and ${notifications.data} ->> 'parentId' in (${ids}))
      )`,
    ),
  );

  // Une ligne « a commenté ta publication » dont il ne reste plus aucun commentaire d'un autre sur la publication.
  if (postIds.length) {
    const posts = sql.join(
      postIds.map((id) => sql`${id}`),
      sql`, `,
    );
    await tx.delete(notifications).where(
      and(
        eq(notifications.type, "feed_comment"),
        isNull(notifications.readAt),
        sql`${notifications.data} ->> 'postId' in (${posts})`,
        sql`not exists (select 1 from feed_post_comments k where k.post_id::text = ${notifications.data} ->> 'postId'
          and k.deleted_at is null and k.author_id <> ${notifications.userId})`,
      ),
    );
  }
}

/**
 * Garde de livraison (heures calmes) : la notification part seulement si son destinataire voit encore la publication et lit
 * encore le commentaire ; sinon elle est supprimée. Une ligne regroupée dont le dernier commentaire n'est plus lisible
 * part sans extrait.
 */
export async function guardCommentNotification(n: typeof notifications.$inferSelect) {
  const data = n.data as { commentId?: unknown; postId?: unknown };
  if (typeof data.commentId !== "string") return true;
  return stillReadable(db, n.userId, data.commentId);
}

registerDeliveryGuard([...COMMENT_TYPES], guardCommentNotification);
