// Notifications d'un nouveau commentaire (lot R8k1, ARCHITECTURE-R8 § 2.6). Au plus **une par personne et par
// commentaire**, par ordre de priorité : citation (`feed_comment_mention`), puis réponse (`feed_comment_reply`), puis
// l'auteur de la publication (`feed_comment`, une ligne non lue par publication, jamais une par commentaire). Jamais à soi,
// jamais à un compte hors règle, jamais à quelqu'un qui ne voit plus la publication ou ne lit pas le commentaire
// (`commentReaders`) : le texte et le pseudo ne partent pas vers qui n'y a plus accès. Écrit dans la transaction du
// commentaire ; `kick()` part dans `after`.
//
// Une ligne regroupée (plusieurs personnes) n'a **pas** d'extrait : il serait attribué à la première personne nommée alors
// qu'il vient de la dernière. Seule la première occurrence d'une ligne cite le début du commentaire (120 caractères).
import { ACTIVITY_MAX_ACTORS, commentExcerpt, feedCommentLabels, r8NotificationTable } from "@orasso/shared";
import { and, desc, eq, inArray, isNull, ne, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { feedPostComments, feedPosts, notifications, profiles } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import { type Executor, type Tx, withTx } from "../../../lib/tx";
import { fillTemplate } from "../../notifications/grouped";
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

export const COMMENT_TYPES = [
  "feed_comment",
  "feed_comment_reply",
  "feed_comment_like",
  "feed_comment_mention",
] as const;

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
 * encore le commentaire ; sinon elle est supprimée. Une ligne regroupée (`feed_comment`, `feed_comment_reply`) est
 * **recomposée entièrement** (acteurs, titre, extrait, `commentId`) à partir des commentaires que le destinataire peut
 * encore lire, de ses acteurs d'origine ; supprimée s'il n'en reste aucun. Aucun nom ni texte d'un commentaire devenu
 * illisible (auteur suspendu, passé privé, commentaire retiré) ne part.
 */
export async function guardCommentNotification(n: typeof notifications.$inferSelect) {
  const data = n.data as { commentId?: unknown; postId?: unknown };
  if (typeof data.commentId !== "string") return true;
  if (n.type !== "feed_comment" && n.type !== "feed_comment_reply") return stillReadable(db, n.userId, data.commentId);
  // Recomposition sous le verrou du regroupement (publication, puis clé de groupe, puis ligne : l'ordre de la création d'un
  // commentaire) et sur la ligne relue : un commentaire arrivé entre la réservation et la garde n'est pas effacé.
  return withTx(async (tx) => {
    if (typeof data.postId === "string") {
      await tx.select({ id: feedPosts.id }).from(feedPosts).where(eq(feedPosts.id, data.postId)).for("update");
    }
    if (n.groupKey) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`notif-group:${n.userId}:${n.groupKey}`}))`);
    }
    const [fresh] = await tx.select().from(notifications).where(eq(notifications.id, n.id)).for("update");
    return fresh ? recompose(tx, fresh) : false;
  });
}

type Readable = { id: string; authorId: string; text: string };

/**
 * Les commentaires lisibles du destinataire parmi ceux des acteurs d'une ligne regroupée : le premier lisible de chaque
 * personne, du plus récent au plus ancien (la lisibilité tient aussi au commentaire racine).
 */
async function findReadable(ex: Executor, userId: string, scope: SQL, actorIds: string[]): Promise<Readable[]> {
  const c = feedPostComments;
  const rows = await ex
    .select({ id: c.id, authorId: c.authorId, text: c.text, createdAt: c.createdAt })
    .from(c)
    .where(and(scope, isNull(c.deletedAt), inArray(c.authorId, actorIds), ne(c.authorId, userId)))
    .orderBy(desc(c.createdAt), desc(c.id))
    .limit(400);
  const tried = new Map<string, number>();
  const readable: Readable[] = [];
  for (const cand of rows) {
    if (readable.some((r) => r.authorId === cand.authorId)) continue;
    const count = tried.get(cand.authorId) ?? 0;
    if (count >= 15) continue;
    tried.set(cand.authorId, count + 1);
    if (await stillReadable(ex, userId, cand.id)) readable.push(cand);
  }
  return readable;
}

/** Portée d'une ligne regroupée (publication, ou réponses qui visent le commentaire) et ses acteurs d'origine. */
function groupScope(n: typeof notifications.$inferSelect): { scope: SQL; actorIds: string[] } | null {
  const data = n.data as { postId?: unknown; parentId?: unknown; _actorIds?: unknown };
  const c = feedPostComments;
  let scope: SQL | undefined;
  if (n.type === "feed_comment" && typeof data.postId === "string") scope = eq(c.postId, data.postId);
  if (n.type === "feed_comment_reply" && typeof data.parentId === "string") scope = eq(c.replyToId, data.parentId);
  const actorIds = Array.isArray(data._actorIds)
    ? data._actorIds.filter((x): x is string => typeof x === "string")
    : [];
  return scope && actorIds.length ? { scope, actorIds } : null;
}

async function recompose(tx: Tx, n: typeof notifications.$inferSelect) {
  if (n.type !== "feed_comment" && n.type !== "feed_comment_reply") return true;
  const data = n.data as { commentId?: unknown; postId?: unknown; parentId?: unknown; _actorIds?: unknown };
  if (typeof data.commentId !== "string") return true;
  const group = groupScope(n);
  if (!group) return stillReadable(tx, n.userId, data.commentId);
  const readable = await findReadable(tx, n.userId, group.scope, group.actorIds);
  const newest = readable[0];
  if (!newest) return false;
  const people = await tx
    .select({ userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
    .from(profiles)
    .where(
      inArray(
        profiles.userId,
        readable.map((r) => r.authorId),
      ),
    );
  const byId = new Map(people.map((p) => [p.userId, p]));
  const actors = readable.flatMap((r) => {
    const p = byId.get(r.authorId);
    return p ? [{ pseudo: p.pseudo, avatarUrl: storage.url(p.avatarKey) }] : [];
  });
  const first = byId.get(newest.authorId);
  if (!first) return false;
  const spec = r8NotificationTable[n.type];
  const bodyTemplate = readable.length === 1 ? feedCommentLabels.quote(commentExcerpt(newest.text)) : spec.body;
  const [updated] = await tx
    .update(notifications)
    .set({
      title: fillTemplate(spec.title, first.pseudo),
      body: fillTemplate(bodyTemplate, first.pseudo),
      data: {
        ...n.data,
        commentId: newest.id,
        _actorIds: readable.map((r) => r.authorId),
        actors: actors.slice(0, ACTIVITY_MAX_ACTORS),
        count: readable.length,
        _text: { title: spec.title, body: bodyTemplate },
      },
    })
    .where(eq(notifications.id, n.id))
    .returning();
  return updated ?? false;
}

registerDeliveryGuard([...COMMENT_TYPES], guardCommentNotification);

/** Clés d'une ligne regroupée pour la lecture en lot (`batch.ts`) : la publication ou le commentaire visé, et les acteurs d'origine. */
export function groupScopeKeys(
  n: typeof notifications.$inferSelect,
): { kind: "post" | "reply"; key: string; actorIds: string[] } | null {
  const data = n.data as { postId?: unknown; parentId?: unknown; _actorIds?: unknown };
  const actorIds = Array.isArray(data._actorIds)
    ? data._actorIds.filter((x): x is string => typeof x === "string")
    : [];
  if (!actorIds.length) return null;
  if (n.type === "feed_comment" && typeof data.postId === "string") return { kind: "post", key: data.postId, actorIds };
  if (n.type === "feed_comment_reply" && typeof data.parentId === "string") {
    return { kind: "reply", key: data.parentId, actorIds };
  }
  return null;
}
