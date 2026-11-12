// Commentaires d'une publication (lot R8k1) : qui voit quoi, et la vue rendue (liste blanche de `FeedCommentView`).
// Toute lecture suppose la publication visible (`requireVisiblePost`) puis applique `canSeeComment` : en SQL pour les
// listes (même règle, testée ensemble), en TypeScript pour un commentaire seul.
import { type CommentViewer, canSeeComment, type FeedCommentView, feedCommentLabels } from "@orasso/shared";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { feedCommentMentions, feedPostCommentReactions, feedPostComments, profiles } from "../../../db/schema";
import { canManagePost, managedPageKeys } from "../../../lib/authorship";
import { now } from "../../../lib/deps";
import { AppError, notFound } from "../../../lib/errors";
import type { Viewer } from "../../../lib/session";
import type { Executor } from "../../../lib/tx";
import { authorVisibleSql, profileOkSql, relationOf, requireVisiblePost, UUID_RE, unavailable } from "../access";
import { loadPageInfo, pageKeyOf } from "../authors";
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
  const person = manages
    ? profileOkSql("profiles", at)
    : authorVisibleSql("profiles", sql`${feedPostComments.authorId}`, viewerId, at);
  // Lot R9a : le commentaire d'une page est servi à qui voit la publication, tant que la page est en règle et que la personne
  // qui l'a écrit n'est pas bannie, quelle que soit la confidentialité de son compte (comme les publications d'une page).
  return sql`(case when ${feedPostComments.persona} <> 'fan' then (profiles.banned_at is null and ${commentPageOkSql}) else ${person} end)`;
}

/** Comme commentPageOkSql, pour une ligne de commentaire sous un alias SQL (suggestions : la racine d'une réponse). */
export function commentPageOkSqlFor(alias: string): SQL {
  const a = sql.raw(alias);
  return sql`(
    (${a}.persona = 'organizer' and exists (select 1 from structures st where st.id = ${a}.structure_id
      and st.deleted_at is null and st.verification <> 'suspended'))
    or (${a}.persona = 'pro' and exists (select 1 from pro_profiles pp where pp.id = ${a}.pro_id and pp.deleted_at is null))
    or (${a}.persona = 'provider' and exists (select 1 from provider_profiles pv where pv.id = ${a}.provider_id and pv.deleted_at is null))
    or (${a}.persona = 'media' and exists (select 1 from media_profiles mp where mp.id = ${a}.media_id and mp.deleted_at is null)))`;
}

/** La page d'un commentaire est en règle (structure ni supprimée ni suspendue, fiche pro, prestataire ou média non supprimé), en SQL. */
export const commentPageOkSql = sql`(
  (${feedPostComments.persona} = 'organizer' and exists (select 1 from structures st where st.id = ${feedPostComments.structureId}
    and st.deleted_at is null and st.verification <> 'suspended'))
  or (${feedPostComments.persona} = 'pro' and exists (select 1 from pro_profiles pp where pp.id = ${feedPostComments.proId} and pp.deleted_at is null))
  or (${feedPostComments.persona} = 'provider' and exists (select 1 from provider_profiles pv where pv.id = ${feedPostComments.providerId} and pv.deleted_at is null))
  or (${feedPostComments.persona} = 'media' and exists (select 1 from media_profiles mp where mp.id = ${feedPostComments.mediaId} and mp.deleted_at is null)))`;

/** La page de ces commentaires est-elle en règle ? (identifiant du commentaire → oui / non ; seulement les commentaires de page.) */
export async function commentStanding(ex: Executor, comments: readonly CommentRow[]): Promise<Map<string, boolean>> {
  const pages = comments.filter((c) => c.persona !== "fan");
  if (!pages.length) return new Map();
  const info = await loadPageInfo(ex, pages);
  return new Map(pages.map((c) => [c.id, info.get(pageKeyOf(c) ?? "")?.inGoodStanding === true]));
}

/**
 * Ce que la lecture sait de l'auteur d'un commentaire. Une personne : la confidentialité de son compte, et son état. Une
 * page (lot R9a) : toujours publique, indisponible seulement si la personne qui a écrit est bannie ou si la page n'est plus
 * en règle (standing : inconnu = en règle). Le compte derrière une page n'est jamais jugé sur sa confidentialité.
 */
export function authorStateOf(
  c: Pick<CommentRow, "id" | "persona">,
  p: Pick<Profile, "visibility" | "deletedAt" | "bannedAt" | "suspendedUntil">,
  at: Date,
  standing: ReadonlyMap<string, boolean> = new Map(),
): { visibility: "public" | "private"; unavailable: boolean } {
  if (c.persona === "fan") return { visibility: p.visibility, unavailable: unavailable(p, at) };
  return { visibility: "public", unavailable: p.bannedAt !== null || standing.get(c.id) === false };
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
  const root = row.c.parentId ? await commentRow(row.c.parentId, ex) : undefined;
  const standing = await commentStanding(ex, root ? [row.c, root.c] : [row.c]);
  const state = authorStateOf(row.c, row.p, at, standing);
  const visible = canSeeComment(
    viewer,
    {
      authorId: row.c.authorId,
      authorVisibility: state.visibility,
      authorUnavailable: state.unavailable,
      deleted: row.c.deletedAt !== null || (await rootDeleted(row.c, ex)),
    },
    rel,
  );
  if (!visible) throw notFound(feedCommentLabels.commentNotFound);
  // Une réponse ne se lit que si son commentaire de premier niveau se lit aussi (compte privé non suivi : ni flamme, ni signalement, ni citation).
  if (row.c.parentId) {
    const rootState = root ? authorStateOf(root.c, root.p, at, standing) : null;
    const rootOk =
      root &&
      rootState &&
      canSeeComment(
        viewer,
        {
          authorId: root.c.authorId,
          authorVisibility: rootState.visibility,
          authorUnavailable: rootState.unavailable,
          deleted: root.c.deletedAt !== null,
        },
        await relationOf(v.user.id, root.c.authorId, ex),
      );
    if (!rootOk) throw notFound(feedCommentLabels.commentNotFound);
  }
  return { ...row, post, manages };
}

/**
 * Le compteur de réponses de commentaires, relu **dans une seule requête** avec l'instant de sa lecture (`statement_timestamp()`, l'horloge de
 * la base, borne basse de l'instant où le compteur a été vu), en texte à largeur fixe : deux lectures se comparent comme du texte.
 */
export async function repliesCountsOf(ex: Executor, ids: string[]): Promise<Map<string, { n: number; at: string }>> {
  const out = new Map<string, { n: number; at: string }>();
  if (!ids.length) return out;
  const rows = await ex
    .select({
      id: feedPostComments.id,
      n: feedPostComments.repliesCount,
      at: sql<string>`to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(feedPostComments)
    .where(inArray(feedPostComments.id, ids));
  for (const r of rows) out.set(r.id, { n: r.n, at: r.at });
  return out;
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
  const counted = await repliesCountsOf(ex, ids);
  const mentions = new Map<string, string[]>();
  for (const m of mentionRows) mentions.set(m.id, [...(mentions.get(m.id) ?? []), m.pseudo]);
  // Lot R9a : un commentaire de page se montre sous le nom et le logo de la page, jamais sous le compte de qui l'a écrit ;
  // `mine` et `canDelete` se lisent sur les pages que je gère (affichage seulement : la suppression repasse par `requireAuthorship`).
  const pageRows = rows.filter((r) => r.c.persona !== "fan");
  const pages = pageRows.length
    ? await loadPageInfo(
        ex,
        pageRows.map((r) => r.c),
      )
    : new Map();
  const managed = pageRows.length ? await managedPageKeys(v.user.id, ex) : new Set<string>();
  return rows.flatMap(({ c, p }) => {
    const key = c.persona === "fan" ? null : pageKeyOf(c);
    // Une page introuvable : le commentaire est écarté, jamais montré sous le compte de la personne.
    const pageView = key ? pages.get(key)?.view : undefined;
    if (c.persona !== "fan" && !pageView) return [];
    const mine = key ? managed.has(key) : c.authorId === v.user.id;
    return [
      {
        id: c.id,
        author: pageView ?? personAuthorView(c.authorId, p),
        text: c.text,
        createdAt: c.createdAt.toISOString(),
        mentions: mentions.get(c.id) ?? [],
        reactionsCount: c.reactionsCount,
        reactedByMe: reacted.has(c.id),
        repliesCount: counted.get(c.id)?.n ?? c.repliesCount,
        countedAt: counted.get(c.id)?.at ?? c.createdAt.toISOString(),
        mine,
        canDelete: mine || manages,
      },
    ];
  });
}
