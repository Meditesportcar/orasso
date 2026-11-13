// Commentaires d'une publication du Fil (lot R8k1, ARCHITECTURE-R8 § 2.6). Toutes les règles sont ici, jamais dans l'écran :
// - commente et lit qui voit la publication (`requireVisiblePost` d'abord : 404 sinon, sans rien révéler) ; un commentaire
//   n'est servi que si son auteur est en règle, et celui d'un compte privé qu'à lui, à ses abonnés acceptés et à qui gère
//   la publication ;
// - 300 caractères, un seul niveau de réponses, `@pseudo` (ne prévient et ne s'affiche en lien que si la personne voit la
//   publication) ; en livraison 2 on commente en son nom seulement (`persona` reste `fan`, aucune casquette en entrée) ;
// - compteurs (`comments_count`, `replies_count`, `reactions_count`) tenus sous verrou de ligne, dans la transaction :
//   la publication d'abord, puis le commentaire (même ordre que la flamme d'une publication) ;
// - un commentaire s'attache à une ligne de `feed_posts` : aucune route n'accepte un identifiant de carte du Fil.
import {
  commentMentions,
  commentParent,
  FEED_COMMENTS_PAGE,
  type FeedCommentCreated,
  type FeedCommentPage,
  type FeedCommentReaction,
  feedCommentLabels,
  type MentionSuggestion,
  type ReportReason,
} from "@orasso/shared";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import {
  feedCommentMentions,
  feedPostCommentReactions,
  feedPostComments,
  feedPosts,
  profiles,
} from "../../../db/schema";
import type { Actor } from "../../../lib/actor";
import { isPageActor } from "../../../lib/actor";
import { canManagePost } from "../../../lib/authorship";
import { now } from "../../../lib/deps";
import { AppError, conflict, notFound, validation } from "../../../lib/errors";
import { decodeCursor, encodeCursor } from "../../../lib/pagination";
import { rateLimit } from "../../../lib/rateLimit";
import type { Viewer } from "../../../lib/session";
import { type Tx, withTx } from "../../../lib/tx";
import { moderationService } from "../../moderation/service";
import { postWithAuthor, profileOkSql, requireVisiblePost, UUID_RE } from "../access";
import { loadPageInfo, pageKeyOf } from "../authors";
import { PAGE_VIEWER_ID } from "../sources/types";
import { notifyCommentLike, notifyNewComment } from "./notify";
import { softDeleteComment } from "./remove";
import { mentionSuggestions } from "./suggest";
import {
  type CommentWithAuthor,
  commentRow,
  commentVisibleSql,
  managesPost,
  managesPostStrict,
  repliesCountsOf,
  requireVisibleComment,
  toViews,
} from "./view";

const sqlState = (error: unknown): string | undefined => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code;
};

const c = feedPostComments;

function readCursor(raw: string | undefined) {
  if (!raw) return null;
  const cursor = decodeCursor(raw);
  if (!cursor || !UUID_RE.test(cursor.id)) throw validation("Curseur invalide : recharge la liste.");
  return cursor;
}

/** Une page de commentaires, du plus ancien au plus récent : `where` choisit premier niveau ou réponses. */
async function page(
  v: Viewer,
  where: ReturnType<typeof and>,
  manages: boolean,
  cursor: string | undefined,
): Promise<FeedCommentPage> {
  const at = now();
  const after = readCursor(cursor);
  const rows: CommentWithAuthor[] = await db
    .select({ c, p: profiles })
    .from(c)
    .innerJoin(profiles, eq(profiles.userId, c.authorId))
    .where(
      and(
        where,
        isNull(c.deletedAt),
        commentVisibleSql(v.user.id, manages, at),
        after
          ? sql`(${c.createdAt}, ${c.id}) > (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(asc(c.createdAt), asc(c.id))
    .limit(FEED_COMMENTS_PAGE + 1);
  const shown = rows.slice(0, FEED_COMMENTS_PAGE);
  const last = shown.at(-1);
  return {
    items: await toViews(db, shown, v, manages, at),
    nextCursor: rows.length > FEED_COMMENTS_PAGE && last ? encodeCursor(last.c.createdAt, last.c.id) : null,
  };
}

/**
 * Les personnes citées : tout pseudo existant et en règle, ni l'auteur du commentaire, rendu de la même façon à tous. La
 * liste `mentions` ne dépend jamais des droits du compte cité (elle révélerait qui est abonné à un compte privé) : seule la
 * notification dépend de ce qu'il peut lire (`commentReaders`).
 */
async function mentionedPeople(
  tx: Tx,
  commenterId: string,
  text: string,
  at: Date,
  /** Lot R9a : une page ne cite que des comptes publics (une citation d'un compte privé est ignorée, sans notification). */
  publicOnly = false,
): Promise<{ userId: string; pseudo: string }[]> {
  const pseudos = commentMentions(text);
  if (!pseudos.length) return [];
  const people = await tx
    .select({ userId: profiles.userId, pseudo: profiles.pseudo })
    .from(profiles)
    .where(
      and(
        inArray(
          sql`lower(${profiles.pseudo})`,
          pseudos.map((p) => p.toLowerCase()),
        ),
        profileOkSql("profiles", at),
        sql`${profiles.userId} <> ${commenterId}`,
        publicOnly ? sql`${profiles.visibility} = 'public'` : undefined,
      ),
    );
  // Dans l'ordre où le texte les cite.
  const order = new Map(pseudos.map((p, i) => [p.toLowerCase(), i]));
  return people.sort((x, y) => (order.get(x.pseudo.toLowerCase()) ?? 0) - (order.get(y.pseudo.toLowerCase()) ?? 0));
}

export const feedCommentsService = {
  /** `GET /feed-posts/:id/comments?cursor=` : le premier niveau, du plus ancien au plus récent, 20 par page. */
  async list(v: Viewer, postId: string, cursor?: string): Promise<FeedCommentPage> {
    rateLimit("feedRead", v.user.id);
    const post = await requireVisiblePost(v, postId);
    const manages = await managesPost(v, post.post);
    return page(v, and(eq(c.postId, post.post.id), isNull(c.parentId)), manages, cursor);
  },

  /** `GET /feed-comments/:id/replies?cursor=` : les réponses d'un commentaire de premier niveau. */
  async replies(v: Viewer, commentId: string, cursor?: string): Promise<FeedCommentPage> {
    rateLimit("feedRead", v.user.id);
    const parent = await requireVisibleComment(v, commentId);
    // Un seul niveau : un commentaire qui est lui-même une réponse n'a pas de réponses.
    if (parent.c.parentId) return { items: [], nextCursor: null };
    return page(v, eq(c.parentId, parent.c.id), parent.manages, cursor);
  },

  /** `POST /feed-posts/:id/comments` */
  async create(
    v: Viewer,
    postId: string,
    input: { text: string; parentId?: string | null; clientId: string },
    /** Lot R9a (T7) : la page au nom de laquelle on commente (`writeActor` : second facteur d'une structure compris). */
    actor?: Actor | null,
  ): Promise<FeedCommentCreated> {
    rateLimit("feedComment", v.user.id);
    const userId = v.user.id;
    const page = actor && isPageActor(actor) ? actor : null;
    // En casquette, on ne commente que ce qu'un membre sans aucun lien voit (lot R9a, tour 2) : la publication d'un compte
    // public ou d'une page, la réponse au commentaire d'un compte public ou d'une page. Jamais ce que la personne voit parce
    // qu'elle suit un compte privé : 404, comme une publication introuvable.
    const reader: Viewer = page ? { ...v, user: { ...v.user, id: PAGE_VIEWER_ID } } : v;
    // Les colonnes de la page : la contrainte de la table exige la persona et son identifiant, rien d'autre.
    const pageColumns = page
      ? {
          persona: (page.kind === "structure" ? "organizer" : page.kind) as "organizer" | "pro" | "provider" | "media",
          structureId: page.kind === "structure" ? page.id : null,
          proId: page.kind === "pro" ? page.id : null,
          providerId: page.kind === "provider" ? page.id : null,
          mediaId: page.kind === "media" ? page.id : null,
        }
      : null;
    let createdId: string;
    try {
      createdId = await withTx(async (tx, after) => {
        const post = await requireVisiblePost(reader, postId, tx);
        // Verrou de la publication : les compteurs ne se perdent pas à deux commentaires simultanés, et un second envoi
        // du même `clientId` attend le premier avant de le retrouver.
        const [locked] = await tx
          .select({ deletedAt: feedPosts.deletedAt, commentsOff: feedPosts.commentsOff, n: feedPosts.commentsCount })
          .from(feedPosts)
          .where(eq(feedPosts.id, post.post.id))
          .for("update");
        if (!locked || locked.deletedAt) throw notFound(feedCommentLabels.postNotFound);

        // Reprise après une réponse perdue : le même commentaire, sans second envoi ni seconde notification.
        const [again] = await tx
          .select({ id: c.id, postId: c.postId, deletedAt: c.deletedAt })
          .from(c)
          .where(and(eq(c.authorId, userId), eq(c.clientId, input.clientId)));
        if (again) {
          if (again.postId !== post.post.id || again.deletedAt) {
            throw conflict("conflict", "Quelqu'un vient de faire la même chose : réessaie.");
          }
          return again.id;
        }
        if (locked.commentsOff) throw conflict("comments_off", feedCommentLabels.commentsOff);

        // Le commentaire auquel on répond : même publication, ni lui ni son premier niveau supprimés, lisible par moi.
        let target: { id: string; authorId: string } | null = null;
        let parentId: string | null = null;
        if (input.parentId) {
          const asked = await requireVisibleComment(reader, input.parentId, tx).catch((error: unknown) => {
            if (error instanceof AppError && error.status === 404) return null;
            throw error;
          });
          const verdict = commentParent(
            asked && { id: asked.c.id, parentId: asked.c.parentId, postId: asked.c.postId, deleted: false },
            post.post.id,
          );
          if (!asked || !verdict.ok) throw notFound(feedCommentLabels.commentNotFound);
          parentId = verdict.parentId;
          target = { id: asked.c.id, authorId: asked.c.authorId };
          // Le commentaire de premier niveau reçoit la réponse : verrou (après la publication), compteur.
          if (parentId) {
            const [root] = await tx.select({ deletedAt: c.deletedAt }).from(c).where(eq(c.id, parentId)).for("update");
            if (!root || root.deletedAt) throw notFound(feedCommentLabels.commentNotFound);
          }
        }

        const at = now();
        const [row] = await tx
          .insert(c)
          .values({
            postId: post.post.id,
            authorId: userId,
            persona: pageColumns?.persona ?? "fan",
            structureId: pageColumns?.structureId ?? null,
            proId: pageColumns?.proId ?? null,
            providerId: pageColumns?.providerId ?? null,
            mediaId: pageColumns?.mediaId ?? null,
            parentId,
            replyToId: target?.id ?? null,
            text: input.text,
            clientId: input.clientId,
            createdAt: at,
            updatedAt: at,
          })
          .returning({ id: c.id });
        if (!row) throw new Error("Commentaire non enregistré");
        await tx
          .update(feedPosts)
          .set({ commentsCount: sql`${feedPosts.commentsCount} + 1` })
          .where(eq(feedPosts.id, post.post.id));
        if (parentId) {
          await tx
            .update(c)
            .set({ repliesCount: sql`${c.repliesCount} + 1` })
            .where(eq(c.id, parentId));
        }

        // `@pseudo` : la liste rendue est la même pour tous ; la notification ne part qu'à qui lit le commentaire.
        const mentioned = await mentionedPeople(tx, userId, input.text, at, page !== null);
        if (mentioned.length) {
          await tx
            .insert(feedCommentMentions)
            .values(mentioned.map((m) => ({ commentId: row.id, userId: m.userId })))
            .onConflictDoNothing();
        }

        const pageInfo = pageColumns
          ? (await loadPageInfo(tx, [{ ...pageColumns, authorId: userId }])).get(page?.key ?? "")
          : null;
        await notifyNewComment({
          tx,
          after,
          at,
          commenter: {
            userId,
            pseudo: v.profile.pseudo,
            avatarKey: v.profile.avatarKey,
            // Une page est publique : la confidentialité du compte de qui écrit ne joue pas (lot R9a).
            visibility: page ? "public" : v.profile.visibility,
          },
          page:
            page && pageInfo ? { key: page.key, name: pageInfo.view.name, avatarUrl: pageInfo.view.avatarUrl } : null,
          postPageKey: pageKeyOf(post.post),
          postId: post.post.id,
          postAuthorId: post.post.authorId,
          commentId: row.id,
          text: input.text,
          repliedTo: target,
          rootId: parentId,
          mentioned: mentioned.map((m) => m.userId),
        });
        return row.id;
      });
    } catch (error) {
      // Deux envois simultanés du même `clientId` : le second rend le commentaire du premier.
      if (sqlState(error) === "23505") {
        const [again] = await db
          .select({ id: c.id, postId: c.postId })
          .from(c)
          .where(and(eq(c.authorId, userId), eq(c.clientId, input.clientId)));
        if (again && again.postId === postId) return ownView(v, again.id);
      }
      if (sqlState(error) === "23505" || sqlState(error) === "40P01") {
        throw conflict("conflict", "Quelqu'un vient de faire la même chose : réessaie.");
      }
      throw error;
    }
    return ownView(v, createdId);
  },

  /** `DELETE /feed-comments/:id` : son auteur, ou qui gère la publication. Le reste répond 404. */
  async remove(
    v: Viewer,
    commentId: string,
  ): Promise<{ parent?: { id: string; repliesCount: number; countedAt: string } }> {
    rateLimit("feedWrite", v.user.id);
    const parentId = await withTx(async (tx) => {
      // Son propre commentaire se supprime même quand on ne voit plus la publication (rien d'autre n'est lu).
      const own = await commentRow(commentId, tx);
      // Son propre commentaire de passionné se supprime même sans voir la publication. Celui d'une page passe par les droits
      // sur la page (lot R9a) : qui n'en a plus ne peut plus le retirer.
      if (own && own.c.authorId === v.user.id && own.c.persona === "fan") {
        if (!(await softDeleteComment(tx, own.c.id, v.user.id, now()))) {
          throw notFound(feedCommentLabels.commentNotFound);
        }
        return own.c.parentId;
      }
      const found = await requireVisibleComment(v, commentId, tx);
      if (found.c.persona !== "fan") {
        // La page : `requireAuthorship` (second facteur d'une structure : son erreur remonte telle quelle) ; à défaut,
        // qui gère la publication. Sans droit, rien n'est révélé.
        const owns = await canManagePost(v, found.c, tx);
        const may =
          owns ||
          (await managesPostStrict(v, found.post.post, tx).catch((error: unknown) => {
            if (error instanceof AppError && error.code === "persona_forbidden") return false;
            throw error;
          }));
        if (!may) throw notFound(feedCommentLabels.commentNotFound);
      } else if (found.c.authorId !== v.user.id) {
        // Une page exige le second facteur : son erreur remonte telle quelle ; sans droit, rien n'est révélé.
        const may = await managesPostStrict(v, found.post.post, tx).catch((error: unknown) => {
          if (error instanceof AppError && error.code === "persona_forbidden") return false;
          throw error;
        });
        if (!may) throw notFound(feedCommentLabels.commentNotFound);
      }
      if (!(await softDeleteComment(tx, found.c.id, v.user.id, now()))) {
        throw notFound(feedCommentLabels.commentNotFound);
      }
      return found.c.parentId;
    });
    // Une réponse supprimée : le compteur de son parent, lu **après** la suppression (même lecture que le POST) ; l'écran ne décrémente rien.
    // La suppression est faite : une panne de lecture du compteur ne la transforme pas en 500 (l'écran réessaierait et
    // recevrait « Déjà retiré »). On journalise et on répond sans `parent` : le client sait relire.
    let parent: Awaited<ReturnType<typeof readableParentCount>>;
    try {
      parent = parentId ? await readableParentCount(v, parentId) : undefined;
    } catch (error) {
      console.error("Compteur du parent illisible après la suppression d'une réponse :", error);
      parent = undefined;
    }
    return parent ? { parent } : {};
  },

  /** `PUT|DELETE /feed-comments/:id/reaction` : la flamme (idempotent). */
  async react(v: Viewer, commentId: string, on: boolean): Promise<FeedCommentReaction> {
    rateLimit("feedReact", v.user.id);
    return withTx(async (tx, after) => {
      // Retirer **sa** flamme reste possible sans voir la publication (rien d'autre n'est lu) ; sinon, lire le commentaire.
      const [mineFlame] = on
        ? []
        : await tx
            .select({ id: feedPostCommentReactions.commentId })
            .from(feedPostCommentReactions)
            .where(
              and(eq(feedPostCommentReactions.commentId, commentId), eq(feedPostCommentReactions.userId, v.user.id)),
            );
      const found = mineFlame
        ? await commentRow(commentId, tx).then((r) => {
            if (!r || r.c.deletedAt) throw notFound(feedCommentLabels.commentNotFound);
            return r;
          })
        : await requireVisibleComment(v, commentId, tx);
      // Verrou du commentaire : les compteurs ne se perdent pas à deux flammes simultanées.
      const [locked] = await tx
        .select({ n: c.reactionsCount, deletedAt: c.deletedAt })
        .from(c)
        .where(eq(c.id, found.c.id))
        .for("update");
      if (!locked || locked.deletedAt) throw notFound(feedCommentLabels.commentNotFound);
      let count = locked.n;
      if (on) {
        const inserted = await tx
          .insert(feedPostCommentReactions)
          .values({ commentId: found.c.id, userId: v.user.id })
          .onConflictDoNothing()
          .returning({ id: feedPostCommentReactions.commentId });
        if (inserted.length) {
          count += 1;
          // Journal seul, regroupé par commentaire ; jamais à soi-même.
          await notifyCommentLike({
            tx,
            after,
            at: now(),
            commentId: found.c.id,
            postId: found.c.postId,
            commentAuthorId: found.c.authorId,
            liker: { userId: v.user.id, pseudo: v.profile.pseudo, avatarKey: v.profile.avatarKey },
          });
        }
      } else {
        const removed = await tx
          .delete(feedPostCommentReactions)
          .where(
            and(eq(feedPostCommentReactions.commentId, found.c.id), eq(feedPostCommentReactions.userId, v.user.id)),
          )
          .returning({ id: feedPostCommentReactions.commentId });
        if (removed.length) count = Math.max(0, count - 1);
      }
      if (count !== locked.n) await tx.update(c).set({ reactionsCount: count }).where(eq(c.id, found.c.id));
      return { reactionsCount: count, reactedByMe: on };
    });
  },

  /** `PUT /me/feed-posts/:id/comments-off` : couper (ou rouvrir) les commentaires ; les anciens restent lisibles. */
  async setCommentsOff(v: Viewer, postId: string, off: boolean): Promise<{ commentsOff: boolean }> {
    rateLimit("feedWrite", v.user.id);
    return withTx(async (tx) => {
      const post = await requireVisiblePost(v, postId, tx);
      const may = await managesPostStrict(v, post.post, tx).catch((error: unknown) => {
        if (error instanceof AppError && error.code === "persona_forbidden") return false;
        throw error;
      });
      if (!may) throw notFound(feedCommentLabels.postNotFound);
      const [locked] = await tx
        .select({ deletedAt: feedPosts.deletedAt })
        .from(feedPosts)
        .where(eq(feedPosts.id, post.post.id))
        .for("update");
      if (!locked || locked.deletedAt) throw notFound(feedCommentLabels.postNotFound);
      await tx.update(feedPosts).set({ commentsOff: off }).where(eq(feedPosts.id, post.post.id));
      return { commentsOff: off };
    });
  },

  /** `POST /feed-comments/:id/report` : la file de modération existante (cible `feed_comment`). */
  async report(
    v: Viewer,
    commentId: string,
    input: { reason: ReportReason; details: string | null },
  ): Promise<{ id: string }> {
    const created = await moderationService.create(v, {
      targetType: "feed_comment",
      targetId: commentId,
      reason: input.reason,
      details: input.details,
      screenshotKey: null,
    });
    return { id: created.id };
  },

  /** `GET /feed-posts/:id/mention-suggestions?q=` */
  async suggestions(v: Viewer, postId: string, q: string, actor?: Actor | null): Promise<MentionSuggestion[]> {
    rateLimit("feedRead", v.user.id);
    return mentionSuggestions(v, postId, q, actor && isPageActor(actor) ? actor : null);
  },
};

/** Le compteur de réponses d'un commentaire de premier niveau, lu maintenant, **si** ce commentaire se lit encore pour `v` (sinon `undefined`). */
async function readableParentCount(
  v: Viewer,
  parentId: string,
): Promise<{ id: string; repliesCount: number; countedAt: string } | undefined> {
  try {
    await requireVisibleComment(v, parentId);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return undefined;
    throw error;
  }
  const counted = (await repliesCountsOf(db, [parentId])).get(parentId);
  return counted ? { id: parentId, repliesCount: counted.n, countedAt: counted.at } : undefined;
}

/** Le commentaire que je viens d'écrire, tel que je le relis (mêmes champs que la liste). */
async function ownView(v: Viewer, id: string): Promise<FeedCommentCreated> {
  const row = await commentRow(id);
  if (!row || row.c.deletedAt) throw notFound(feedCommentLabels.commentNotFound);
  const post = await postWithAuthor(row.c.postId);
  const manages = post ? await managesPost(v, post.post) : false;
  const [view] = await toViews(db, [row], v, manages, now());
  if (!view) throw notFound(feedCommentLabels.commentNotFound);
  // Une réponse : le compteur de son commentaire de premier niveau, lu **après** l'enregistrement, avec l'instant de sa lecture (l'écran n'ajoute rien).
  // Seulement si ce commentaire se lit encore pour moi (compte privé qui m'a retiré de ses abonnés : le rejeu rend la réponse sans `parent`).
  const parent = row.c.parentId ? await readableParentCount(v, row.c.parentId) : undefined;
  return parent ? { ...view, parent } : view;
}
