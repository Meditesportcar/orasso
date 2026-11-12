// Collaboration (vague R8, lot R8o, ARCHITECTURE-R8 § 1.6 et § 2.8) : le co-auteur d'une publication. **Sensible** : écriture
// publique au nom d'un autre, droits, vie privée. Les règles :
// - un seul co-auteur invité, à la création ; tant qu'il n'a pas accepté, rien ne le montre (ni la publication sur son profil, ni
//   son nom, ni le Fil de ses abonnés) ; l'auteur d'origine seul voit l'état de son invitation (`coAuthorInvite`) ;
// - accepté : la publication est sur les deux profils, signée des deux, une seule carte dans le Fil ; la règle de visibilité
//   reste celle de l'auteur d'origine (une co-signature n'ouvre jamais une publication d'un compte privé à qui ne le suit pas) ;
// - le co-auteur se retire quand il veut ; seul l'auteur d'origine supprime (`canManagePost` ne change pas : le co-auteur ne
//   supprime pas, ne coupe pas les commentaires, n'épingle pas) ;
// - répondre au nom d'une page passe par `requireAuthorship` (structure : second facteur) ;
// - tout se décide sous le verrou de la publication puis de la ligne du co-auteur (même ordre partout) : accepter pendant un
//   retrait ou une suppression ne laisse jamais un état impossible.
import {
  authorKeyOf,
  COAUTHOR_INVITES_PER_DAY,
  COAUTHOR_SEARCH_MAX,
  COAUTHOR_SEARCH_MIN_CHARS,
  type CoAuthorSearchItem,
  type CoauthorKind,
  type CoauthorStatus,
  canRespond,
  canWithdraw,
  coauthorLabels,
  type FeedAuthorView,
  type FeedCoAuthorInvite,
  inviteRefusal,
  parseAuthorKey,
  r8DefaultContent,
  type StoryPersona,
} from "@orasso/shared";
import { and, eq, gt, inArray, lt, or, type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  feedCoauthorInviteLog,
  feedPostCoauthors,
  feedPosts,
  mediaProfiles,
  notifications,
  proFollows,
  profiles,
  proProfiles,
  structureFollows,
  structureMembers,
  structures,
  userFollows,
} from "../../db/schema";
import { canManagePost, managedPageKeys, type PostPageColumns, requireAuthorship } from "../../lib/authorship";
import { now } from "../../lib/deps";
import { AppError, notFound } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { anyColumnContains, fold, searchTokens } from "../../lib/text-search";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { activePartnerCandidates } from "../partnerships/commercial";
import { proShown } from "../partnerships/shown";
import { requireVisiblePost, unavailable } from "./access";
import { loadPageInfo } from "./authors";
import { postOkSql } from "./lists";
import { loadPostViews as loadPostViewsFor } from "./posts";

const err = (status: 400 | 409 | 422 | 429, code: keyof typeof coauthorLabels.errors) =>
  new AppError(status, code, coauthorLabels.errors[code]);

/** Les colonnes de page d'une cible, pour réutiliser `loadPageInfo` (qui lit des publications). */
const pageColumns = (kind: CoauthorKind | "provider", id: string): PostPageColumns => ({
  persona: kind === "structure" ? "organizer" : kind === "user" ? "fan" : kind,
  authorId: "",
  structureId: kind === "structure" ? id : null,
  proId: kind === "pro" ? id : null,
  providerId: kind === "provider" ? id : null,
  mediaId: kind === "media" ? id : null,
});

const personaOf = (kind: CoauthorKind | "provider"): StoryPersona =>
  kind === "structure" ? "organizer" : kind === "user" ? "fan" : kind;

/** Les comptes à prévenir et à qui revient la réponse pour une cible. */
async function recipientsOf(ex: Executor, kind: CoauthorKind | "provider", id: string): Promise<string[]> {
  if (kind === "user") return [id];
  if (kind === "structure") {
    const rows = await ex
      .select({ userId: structureMembers.userId })
      .from(structureMembers)
      .where(
        and(
          eq(structureMembers.structureId, id),
          eq(structureMembers.status, "active"),
          inArray(structureMembers.role, ["owner", "co_organizer"]),
        ),
      );
    return rows.map((r) => r.userId);
  }
  if (kind === "pro") {
    const [r] = await ex.select({ u: proProfiles.ownerUserId }).from(proProfiles).where(eq(proProfiles.id, id));
    return r ? [r.u] : [];
  }
  if (kind === "media") {
    const [r] = await ex.select({ u: mediaProfiles.userId }).from(mediaProfiles).where(eq(mediaProfiles.id, id));
    return r ? [r.u] : [];
  }
  return [];
}

/** Le nom et la photo de l'auteur d'origine (la page, ou la personne) pour la notification d'invitation. */
export async function authorCard(
  ex: Executor,
  v: Viewer,
  authorship: { kind: CoauthorKind | "provider"; id: string },
): Promise<{ name: string; avatarUrl: string | null }> {
  if (authorship.kind === "user") return { name: v.profile.pseudo, avatarUrl: storage.url(v.profile.avatarKey) };
  const page = (await loadPageInfo(ex, [pageColumns(authorship.kind, authorship.id)])).get(
    authorKeyOf(authorship.kind, authorship.id),
  );
  return { name: page?.view.name ?? v.profile.pseudo, avatarUrl: page?.view.avatarUrl ?? null };
}

export type PreparedInvite = {
  kind: CoauthorKind;
  id: string;
  key: string;
  name: string;
  avatarUrl: string | null;
  /** Les comptes à prévenir (la personne, ou chaque responsable actif de la page). */
  recipients: string[];
  /** Pro partenaire actif de l'auteur : la mention « Collaboration commerciale » s'applique. */
  partnerProId: string | null;
};

/**
 * Vérifie une invitation **avant** d'écrire la publication (rien n'est écrit ici) : refus de soi-même, d'une info importante,
 * d'un prestataire (400) ; cible introuvable, supprimée, suspendue (422 `coauthor_unavailable`) ; cible qui ne pourrait pas
 * voir la publication d'un compte privé (422 `coauthor_cannot_see`).
 */
export async function prepareInvite(
  ex: Executor,
  v: Viewer,
  input: { kind: CoauthorKind | "provider"; id: string },
  ctx: { authorKey: string; persona: StoryPersona; important: boolean },
  at: Date,
): Promise<PreparedInvite> {
  const key = authorKeyOf(input.kind, input.id);
  const refusal = inviteRefusal({
    authorKey: ctx.authorKey,
    publisherKey: authorKeyOf("user", v.user.id),
    targetKey: key,
    targetKind: input.kind,
    important: ctx.important,
  });
  if (refusal === "self") throw err(400, "coauthor_self");
  if (refusal === "important") throw err(400, "coauthor_important");
  if (refusal === "provider") throw err(400, "coauthor_provider");
  const kind = input.kind as CoauthorKind;
  // La cible : en règle, et — pour une fiche pro — publiée.
  let name: string;
  let avatarUrl: string | null;
  if (kind === "user") {
    const [p] = await ex.select().from(profiles).where(eq(profiles.userId, input.id));
    if (!p || unavailable(p, at)) throw err(422, "coauthor_unavailable");
    // Un compte privé que je ne suis pas ne s'invite pas, même par son identifiant (la recherche ne le rend jamais).
    if (p.visibility === "private") {
      const [follows] = await ex
        .select({ id: userFollows.followerId })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.followerId, v.user.id),
            eq(userFollows.followedId, input.id),
            eq(userFollows.status, "accepted"),
          ),
        );
      if (!follows) throw err(422, "coauthor_unavailable");
    }
    name = p.pseudo;
    avatarUrl = storage.url(p.avatarKey);
  } else {
    if (kind === "pro") {
      const [ok] = await ex
        .select({ id: proProfiles.id })
        .from(proProfiles)
        .where(and(eq(proProfiles.id, input.id), proShown(at)));
      if (!ok) throw err(422, "coauthor_unavailable");
    }
    const page = (await loadPageInfo(ex, [pageColumns(kind, input.id)])).get(key);
    if (!page?.inGoodStanding) throw err(422, "coauthor_unavailable");
    name = page.view.name;
    avatarUrl = page.view.avatarUrl;
  }
  const recipients = [...new Set(await recipientsOf(ex, kind, input.id))];
  if (!recipients.length) throw err(422, "coauthor_unavailable");
  // Compte privé : celles et ceux qui répondent doivent pouvoir voir la publication, donc suivre l'auteur.
  if (ctx.persona === "fan" && v.profile.visibility === "private") {
    const followers = await ex
      .select({ id: userFollows.followerId })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followedId, v.user.id),
          eq(userFollows.status, "accepted"),
          inArray(userFollows.followerId, recipients),
        ),
      );
    if (new Set(followers.map((f) => f.id)).size < recipients.length) throw err(422, "coauthor_cannot_see");
  }
  // Pro partenaire actif de l'auteur (une publication personnelle seulement : le partenariat est entre une personne et un pro).
  let partnerProId: string | null = null;
  if (kind === "pro" && ctx.persona === "fan") {
    const partners = await activePartnerCandidates(ex, v.user.id);
    if (partners.some((p) => p.proId === input.id)) partnerProId = input.id;
  }
  return { kind, id: input.id, key, name, avatarUrl, recipients, partnerProId };
}

/**
 * Plafond de 10 invitations par jour et par compte, compté **sous verrou** dans la transaction de la publication, **avant** d'y
 * écrire la publication (`replayed` rend d'abord le même envoi rejoué, comme les autres plafonds).
 */
export async function reserveInvite(
  tx: Tx,
  input: { inviterId: string; at: Date; replayed: () => Promise<void> },
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`coauthor-invites:${input.inviterId}`}, 0))`);
  await input.replayed();
  // Les envois des dernières 24 h, quel que soit leur sort (annulée, supprimée, refusée) : le journal des envois, pas les lignes.
  const since = new Date(input.at.getTime() - 86_400_000);
  await tx
    .delete(feedCoauthorInviteLog)
    .where(and(eq(feedCoauthorInviteLog.invitedBy, input.inviterId), lt(feedCoauthorInviteLog.invitedAt, since)));
  const [used] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(feedCoauthorInviteLog)
    .where(and(eq(feedCoauthorInviteLog.invitedBy, input.inviterId), gt(feedCoauthorInviteLog.invitedAt, since)));
  if ((used?.n ?? 0) >= COAUTHOR_INVITES_PER_DAY) throw err(429, "coauthor_quota");
}

/**
 * Écrit l'invitation dans la transaction de la publication (après `reserveInvite` et l'écriture de la publication) : ligne
 * `pending`, notification `coauthor_invited` à chaque responsable (jamais à soi).
 */
export async function writeInvite(
  tx: Tx,
  input: {
    postId: string;
    invite: PreparedInvite;
    inviterId: string;
    /** Le nom et la photo de l'auteur d'origine (la page, ou la personne) pour la notification. */
    author: { name: string; avatarUrl: string | null };
    at: Date;
  },
): Promise<void> {
  await tx.insert(feedCoauthorInviteLog).values({ invitedBy: input.inviterId, invitedAt: input.at });
  await tx.insert(feedPostCoauthors).values({
    postId: input.postId,
    coauthorKind: input.invite.kind,
    coauthorId: input.invite.id,
    status: "pending",
    invitedBy: input.inviterId,
    invitedAt: input.at,
  });
  const content = r8DefaultContent("coauthor_invited", input.author.name);
  for (const userId of input.invite.recipients) {
    if (userId === input.inviterId) continue;
    await notificationsService.notify(tx, userId, "coauthor_invited", {
      title: content.title,
      body: content.body,
      data: {
        actor: { pseudo: input.author.name, avatarUrl: input.author.avatarUrl },
        postId: input.postId,
        link: "/app/activite/demandes",
      },
    });
  }
}

// --- Lecture ---------------------------------------------------------------------------------------------------------

export type CoAuthorLoaded = {
  coAuthor: FeedAuthorView | null;
  invite: FeedCoAuthorInvite | null;
  /** Je suis le co-auteur accepté (moi, ou une page que je gère). */
  byMe: boolean;
};

/**
 * Le co-auteur de ces publications, par lots (jamais une requête par publication). `coAuthor` seulement si `accepted` et si la
 * cible est en règle ; `invite` (l'état de l'invitation) seulement à l'auteur d'origine (`mine`). Une cible disparue ou hors
 * règle ne se montre jamais, quel que soit l'état.
 */
export async function loadCoAuthors(
  ex: Executor,
  posts: { id: string; mine: boolean }[],
  viewerId: string,
  /** Lot R9a : les pages dont le lecteur a les droits (la page active en casquette), à la place de celles de son compte. */
  managedKeys?: ReadonlySet<string>,
): Promise<Map<string, CoAuthorLoaded>> {
  const out = new Map<string, CoAuthorLoaded>();
  if (!posts.length) return out;
  const rows = await ex
    .select()
    .from(feedPostCoauthors)
    .where(
      inArray(
        feedPostCoauthors.postId,
        posts.map((p) => p.id),
      ),
    );
  if (!rows.length) return out;
  const views = await coAuthorViews(
    ex,
    rows.map((r) => ({ kind: r.coauthorKind, id: r.coauthorId })),
  );
  const mineBy = new Map(posts.map((p) => [p.id, p.mine]));
  const needsManaged = rows.some((r) => r.status === "accepted" && r.coauthorKind !== "user");
  const managed = managedKeys ?? (needsManaged ? await managedPageKeys(viewerId, ex) : new Set<string>());
  for (const r of rows) {
    const view = views.get(authorKeyOf(r.coauthorKind, r.coauthorId));
    if (!view) continue;
    const accepted = r.status === "accepted";
    out.set(r.postId, {
      coAuthor: accepted ? view : null,
      invite: mineBy.get(r.postId) ? { key: view.key, name: view.name, status: r.status } : null,
      byMe: accepted && (view.key === authorKeyOf("user", viewerId) || managed.has(view.key)),
    });
  }
  return out;
}

/** Les cartes d'auteur de ces cibles (clé → carte), seulement celles qui existent et sont en règle. */
export async function coAuthorViews(
  ex: Executor,
  targets: { kind: CoauthorKind | "provider"; id: string }[],
  at: Date = now(),
): Promise<Map<string, FeedAuthorView>> {
  const out = new Map<string, FeedAuthorView>();
  const userIds = [...new Set(targets.filter((t) => t.kind === "user").map((t) => t.id))];
  if (userIds.length) {
    const rows = await ex.select().from(profiles).where(inArray(profiles.userId, userIds));
    for (const p of rows) {
      if (unavailable(p, at)) continue;
      out.set(authorKeyOf("user", p.userId), {
        key: authorKeyOf("user", p.userId),
        kind: "user",
        name: p.pseudo,
        avatarUrl: storage.url(p.avatarKey),
        verified: false,
        pseudo: p.pseudo,
        grade: p.grade,
        official: p.official,
      });
    }
  }
  const pages = targets.filter((t) => t.kind !== "user");
  if (pages.length) {
    const info = await loadPageInfo(
      ex,
      pages.map((t) => pageColumns(t.kind, t.id)),
    );
    for (const [key, page] of info) if (page.inGoodStanding) out.set(key, page.view);
  }
  return out;
}

// --- Répondre, se retirer ----------------------------------------------------------------------------------------------

type LockedPost = PostPageColumns & { id: string; deletedAt: Date | null };

/** La publication puis la ligne du co-auteur, verrouillées dans cet ordre (partout pareil). */
async function lockPost(tx: Tx, postId: string) {
  const [post] = await tx
    .select({
      id: feedPosts.id,
      authorId: feedPosts.authorId,
      persona: feedPosts.persona,
      structureId: feedPosts.structureId,
      proId: feedPosts.proId,
      providerId: feedPosts.providerId,
      mediaId: feedPosts.mediaId,
      deletedAt: feedPosts.deletedAt,
    })
    .from(feedPosts)
    .where(eq(feedPosts.id, postId))
    .for("update");
  if (!post || post.deletedAt) throw notFound("Publication introuvable");
  const [row] = await tx.select().from(feedPostCoauthors).where(eq(feedPostCoauthors.postId, postId)).for("update");
  if (!row) throw notFound("Invitation introuvable");
  return { post: post as LockedPost, row };
}

/**
 * Le compte parle-t-il au nom de la cible invitée ? Une personne : elle seule. Une page : `requireAuthorship` (structure :
 * second facteur, dont l'erreur remonte). Qui n'est pas concerné reçoit un 404 (on ne révèle pas l'invitation).
 */
async function actAs(v: Viewer, row: { coauthorKind: CoauthorKind | "provider"; coauthorId: string }, tx: Tx) {
  if (row.coauthorKind === "user") {
    if (row.coauthorId !== v.user.id) throw notFound("Invitation introuvable");
    return;
  }
  let who: Awaited<ReturnType<typeof requireAuthorship>>;
  try {
    who = await requireAuthorship(
      v,
      {
        persona: personaOf(row.coauthorKind),
        structureId: row.coauthorKind === "structure" ? row.coauthorId : null,
        proId: row.coauthorKind === "pro" ? row.coauthorId : null,
      },
      tx,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "persona_forbidden") throw notFound("Invitation introuvable");
    throw error;
  }
  if (who.kind !== row.coauthorKind || who.id !== row.coauthorId) throw notFound("Invitation introuvable");
}

/** Le nom du co-auteur (celui qui a répondu parle sous le nom de la page, ou de sa personne). */
async function coAuthorName(tx: Tx, row: { coauthorKind: CoauthorKind | "provider"; coauthorId: string }) {
  const view = (await coAuthorViews(tx, [{ kind: row.coauthorKind, id: row.coauthorId }])).get(
    authorKeyOf(row.coauthorKind, row.coauthorId),
  );
  return view ?? null;
}

/**
 * Retire du Journal les notifications d'une invitation qui n'existe plus (les non lues d'abord ; les lues deviennent sans objet).
 * Par les notifications **réellement écrites** (type `coauthor_*` et `postId`), pas par des destinataires recalculés : un ancien
 * responsable de la page, retiré depuis, ne garde rien. Appuyée par l'index partiel d'expression de la migration
 * (`notifications_coauthor_post_idx`). Une seule requête pour toutes les publications données.
 */
/** Les notifications `coauthor_*` de ces publications (la condition de la suppression ; exportée pour le test du plan). */
export const coauthorNotificationsWhere = (ids: string[], types?: string[]): SQL | undefined =>
  and(
    // Le même prédicat, mot pour mot, que l'index partiel de la migration : sans lui PostgreSQL ne peut pas s'en servir.
    sql`${notifications.type} in ('coauthor_invited', 'coauthor_accepted', 'coauthor_withdrawn')`,
    inArray(notifications.type, types ?? ["coauthor_invited", "coauthor_accepted", "coauthor_withdrawn"]),
    sql`${notifications.data} ->> 'postId' in (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`,
  );

export async function dropCoauthorNotifications(
  tx: Executor,
  postIds: string | string[],
  types?: string[],
): Promise<void> {
  const ids = Array.isArray(postIds) ? postIds : [postIds];
  if (!ids.length) return;
  await tx.delete(notifications).where(coauthorNotificationsWhere(ids, types));
}

async function notifyAuthor(
  tx: Tx,
  post: LockedPost,
  type: "coauthor_accepted" | "coauthor_withdrawn",
  by: { name: string; avatarUrl: string | null },
  actorId: string,
) {
  if (post.authorId === actorId) return;
  const content = r8DefaultContent(type, by.name);
  await notificationsService.notify(tx, post.authorId, type, {
    title: content.title,
    body: content.body,
    data: { actor: { pseudo: by.name, avatarUrl: by.avatarUrl }, postId: post.id, link: "/app/fil" },
  });
}

export const coauthorsService = {
  /**
   * `POST /me/feed-coauthor-requests/:postId/accept|decline` : la personne invitée, ou une page que le compte gère. Répéter
   * la même réponse est sans effet ; répondre l'inverse d'une réponse donnée, ou à une invitation retirée : 409.
   */
  async respond(v: Viewer, postId: string, answer: "accept" | "decline"): Promise<{ status: CoauthorStatus }> {
    rateLimit("feedWrite", v.user.id);
    return withTx(async (tx) => {
      const { post, row } = await lockPost(tx, postId);
      await actAs(v, row, tx);
      // Il faut pouvoir voir la publication (l'auteur est peut-être passé en compte privé depuis l'invitation).
      await requireVisiblePost(v, postId, tx);
      const target: CoauthorStatus = answer === "accept" ? "accepted" : "declined";
      if (row.status === target) return { status: row.status };
      if (!canRespond(row.status)) throw err(409, "coauthor_closed");
      await tx
        .update(feedPostCoauthors)
        .set({ status: target, respondedBy: v.user.id, respondedAt: now() })
        .where(eq(feedPostCoauthors.postId, postId));
      if (target === "accepted") {
        const by = await coAuthorName(tx, row);
        if (by) await notifyAuthor(tx, post, "coauthor_accepted", by, v.user.id);
      }
      // L'invitation est close : la notification d'invitation n'a plus d'objet.
      await dropCoauthorNotifications(tx, postId, ["coauthor_invited"]);
      return { status: target };
    });
  },

  /**
   * `DELETE /feed-posts/:id/coauthor` : l'auteur d'origine annule l'invitation ou retire le co-auteur (la ligne part, sans
   * notification) ; le co-auteur se retire (« Me retirer », à tout moment, même accepté : `withdrawn`, l'auteur est prévenu ;
   * en attente, c'est un refus). Ni l'un ni l'autre : 404.
   */
  async withdraw(v: Viewer, postId: string): Promise<{ status: "removed" | CoauthorStatus }> {
    rateLimit("feedWrite", v.user.id);
    return withTx(async (tx) => {
      const { post, row } = await lockPost(tx, postId);
      if (await canManagePost(v, post, tx)) {
        await dropCoauthorNotifications(tx, postId);
        await tx.delete(feedPostCoauthors).where(eq(feedPostCoauthors.postId, postId));
        return { status: "removed" as const };
      }
      await actAs(v, row, tx);
      if (row.status === "withdrawn" || row.status === "declined") return { status: row.status };
      if (!canWithdraw("coauthor", row.status)) throw err(409, "coauthor_closed");
      const target: CoauthorStatus = row.status === "pending" ? "declined" : "withdrawn";
      await tx
        .update(feedPostCoauthors)
        .set({ status: target, respondedBy: v.user.id, respondedAt: now() })
        .where(eq(feedPostCoauthors.postId, postId));
      if (target === "withdrawn") {
        const by = await coAuthorName(tx, row);
        if (by) await notifyAuthor(tx, post, "coauthor_withdrawn", by, v.user.id);
      }
      await dropCoauthorNotifications(tx, postId, ["coauthor_invited"]);
      return { status: target };
    });
  },

  /** `GET /me/feed-posts/coauthor-search?q=&kind=` : 8 résultats au plus, deux caractères au moins. */
  async search(v: Viewer, q: { q: string; kind?: CoauthorKind }): Promise<{ items: CoAuthorSearchItem[] }> {
    rateLimit("search", v.user.id);
    const text = q.q.trim();
    if ([...text].length < COAUTHOR_SEARCH_MIN_CHARS) return { items: [] };
    const tokens = searchTokens(text);
    const at = now();
    const me = v.user.id;
    const want = (k: CoauthorKind) => !q.kind || q.kind === k;
    const nameMatch = (column: SQLWrapper): SQL[] =>
      tokens.flatMap((t) => {
        const c = anyColumnContains(t, [column]);
        return c ? [c] : [];
      });
    const prefixFirst = (column: SQLWrapper) =>
      sql`(case when orasso_fold(${column}) like ${`${fold(tokens[0] ?? "").replace(/[\\%_]/g, (m) => `\\${m}`)}%`} then 0 else 1 end)`;
    const [users, structs, pros, medias, partners] = await Promise.all([
      want("user")
        ? db
            .select({
              userId: profiles.userId,
              pseudo: profiles.pseudo,
              avatarKey: profiles.avatarKey,
              official: profiles.official,
            })
            .from(profiles)
            .where(
              and(
                sql`${profiles.userId} <> ${me}`,
                sql`(${profiles.deletedAt} is null and ${profiles.bannedAt} is null and (${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${at}))`,
                // Un compte privé ne se trouve que si je le suis (abonnement accepté).
                sql`(${profiles.visibility} = 'public' or exists (select 1 from user_follows uf where uf.follower_id = ${me} and uf.followed_id = ${profiles.userId} and uf.status = 'accepted'))`,
                ...nameMatch(profiles.pseudo),
              ),
            )
            .orderBy(prefixFirst(profiles.pseudo), profiles.pseudo)
            .limit(COAUTHOR_SEARCH_MAX)
        : [],
      want("structure")
        ? db
            .select({
              id: structures.id,
              name: structures.name,
              logoKey: structures.logoKey,
              verification: structures.verification,
            })
            .from(structures)
            .where(
              and(
                sql`${structures.deletedAt} is null`,
                sql`${structures.verification} <> 'suspended'`,
                ...nameMatch(structures.name),
              ),
            )
            .orderBy(prefixFirst(structures.name), structures.name)
            .limit(COAUTHOR_SEARCH_MAX)
        : [],
      want("pro")
        ? db
            .select({ id: proProfiles.id, name: proProfiles.name, logoKey: proProfiles.logoKey })
            .from(proProfiles)
            .where(and(proShown(at), ...nameMatch(proProfiles.name)))
            .orderBy(prefixFirst(proProfiles.name), proProfiles.name)
            .limit(COAUTHOR_SEARCH_MAX)
        : [],
      want("media")
        ? db
            .select({
              id: mediaProfiles.id,
              name: mediaProfiles.name,
              logoKey: mediaProfiles.logoKey,
              verifiedAt: mediaProfiles.pressCardVerifiedAt,
            })
            .from(mediaProfiles)
            .where(and(sql`${mediaProfiles.deletedAt} is null`, ...nameMatch(mediaProfiles.name)))
            .orderBy(prefixFirst(mediaProfiles.name), mediaProfiles.name)
            .limit(COAUTHOR_SEARCH_MAX)
        : [],
      want("pro") ? activePartnerCandidates(db, me) : [],
    ]);
    const partnerIds = new Set(partners.map((p) => p.proId));
    const lists: CoAuthorSearchItem[][] = [
      users.map((p) => ({
        key: authorKeyOf("user", p.userId),
        kind: "user" as const,
        name: p.pseudo,
        avatarUrl: storage.url(p.avatarKey),
        verified: false,
        partner: false,
      })),
      structs.map((s) => ({
        key: authorKeyOf("structure", s.id),
        kind: "structure" as const,
        name: s.name,
        avatarUrl: storage.url(s.logoKey),
        verified: s.verification === "verified",
        partner: false,
      })),
      pros.map((p) => ({
        key: authorKeyOf("pro", p.id),
        kind: "pro" as const,
        name: p.name,
        avatarUrl: storage.url(p.logoKey),
        verified: true,
        partner: partnerIds.has(p.id),
      })),
      medias.map((m) => ({
        key: authorKeyOf("media", m.id),
        kind: "media" as const,
        name: m.name,
        avatarUrl: storage.url(m.logoKey),
        verified: Boolean(m.verifiedAt),
        partner: false,
      })),
    ];
    // Les genres à tour de rôle : ni les personnes ni les pages ne prennent toute la place.
    const items: CoAuthorSearchItem[] = [];
    for (let i = 0; items.length < COAUTHOR_SEARCH_MAX && lists.some((l) => i < l.length); i++) {
      for (const l of lists) {
        const item = l[i];
        if (item && items.length < COAUTHOR_SEARCH_MAX) items.push(item);
      }
    }
    return { items };
  },
};

/** Nombre de mes invitations en attente que je peux lire (pour les nouveaux clients : `pendingCoauthors` du résumé). */
export async function pendingCoauthorCount(userId: string, ex: Executor): Promise<number> {
  // Un comptage, jamais les cartes (`GET /me` le lit à chaque fois) : les invitations en attente pour moi ou mes pages, puis les
  // mêmes contrôles de visibilité que la liste (publication servie, auteur en règle, compte privé suivi), en une requête.
  const pending = await pendingCoauthorPostIds(userId, ex);
  if (!pending.length) return 0;
  const at = now();
  const res = await ex.execute<{ n: number }>(sql`select count(*)::int as n
    from feed_posts p join profiles a on a.user_id = p.author_id
    where p.id in (${sql.join(
      pending.map((r) => sql`${r.postId}::uuid`),
      sql`, `,
    )})
      and ${postOkSql(at)}
      and (p.persona <> 'fan' or a.visibility = 'public' or p.author_id = ${userId}
        or exists (select 1 from user_follows uf where uf.follower_id = ${userId} and uf.followed_id = p.author_id and uf.status = 'accepted'))`);
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * Mes invitations en attente que je peux lire (moi, ou une page que je gère), les plus récentes d'abord : la liste des
 * Demandes et la pastille s'appuient sur cette même lecture. Une publication que je ne peux plus voir (auteur passé en compte
 * privé que je ne suis pas) n'y est pas.
 */
export async function pendingCoauthorRequests(userId: string, ex: Executor, at: Date) {
  const pending = await pendingCoauthorPostIds(userId, ex);
  if (!pending.length) return [];
  const views = new Map(
    (
      await loadPostViewsFor(
        ex,
        pending.map((p) => p.postId),
        userId,
        at,
      )
    ).map((x) => [x.id, x]),
  );
  const parsed = pending.map((p) => parseAuthorKey(p.forKey));
  const forViews = await coAuthorViews(
    ex,
    parsed.flatMap((k) => (k ? [{ kind: k.kind, id: k.id }] : [])),
    at,
  );
  return pending.flatMap((p) => {
    const view = views.get(p.postId);
    return view ? [{ ...p, view, forView: forViews.get(p.forKey) ?? null }] : [];
  });
}

/** Les publications dont l'invitation m'attend (moi, ou une page que je gère), les plus récentes d'abord. */
export async function pendingCoauthorPostIds(
  userId: string,
  ex: Executor,
): Promise<{ postId: string; forKey: string; invitedAt: Date }[]> {
  const keys = [authorKeyOf("user", userId), ...(await managedPageKeys(userId, ex))]
    .map((k) => parseAuthorKey(k))
    .filter((k): k is NonNullable<typeof k> => k !== null);
  const byKind = new Map<string, string[]>();
  for (const k of keys) byKind.set(k.kind, [...(byKind.get(k.kind) ?? []), k.id]);
  const rows = await ex
    .select({
      postId: feedPostCoauthors.postId,
      kind: feedPostCoauthors.coauthorKind,
      id: feedPostCoauthors.coauthorId,
      invitedAt: feedPostCoauthors.invitedAt,
    })
    .from(feedPostCoauthors)
    .innerJoin(feedPosts, eq(feedPosts.id, feedPostCoauthors.postId))
    .where(
      and(
        eq(feedPostCoauthors.status, "pending"),
        sql`${feedPosts.deletedAt} is null`,
        or(
          ...[...byKind].map(([kind, ids]) =>
            and(
              sql`${feedPostCoauthors.coauthorKind} = ${kind}::coauthor_kind`,
              inArray(feedPostCoauthors.coauthorId, ids),
            ),
          ),
        ),
      ),
    );
  return rows
    .map((r) => ({ postId: r.postId, forKey: authorKeyOf(r.kind, r.id), invitedAt: r.invitedAt }))
    .sort((a, b) => b.invitedAt.getTime() - a.invitedAt.getTime());
}

// --- Le Fil : une seule carte, suivie par l'un ou l'autre ----------------------------------------------------------------

/** Le propriétaire de la carte pour l'affinité du Fil (R8o) : celui des deux que la personne suit. */
export type CardOwner = { authorId: string | null; structureId: string | null; proId: string | null; name: string };

type OwnerPost = {
  id: string;
  persona: StoryPersona;
  authorId: string;
  structureId: string | null;
  proId: string | null;
};

/**
 * Pour les publications co-signées (acceptées) de cette liste : la carte du Fil est **unique** (une par publication) et compte
 * comme suivie si la personne suit l'auteur **ou** le co-auteur. Rend, pour chaque publication où c'est le co-auteur que la
 * personne suit (ou qu'elle est elle-même), le propriétaire à poser sur la carte à la place de l'auteur d'origine ; rien
 * quand l'auteur est déjà suivi (la meilleure affinité des deux) ou quand elle ne suit ni l'un ni l'autre.
 */
export async function coSignedOwners(
  ex: Executor,
  posts: OwnerPost[],
  coAuthors: Map<string, FeedAuthorView>,
  viewerId: string,
): Promise<Map<string, CardOwner & { mine: boolean }>> {
  const out = new Map<string, CardOwner & { mine: boolean }>();
  const co = posts.filter((p) => coAuthors.has(p.id));
  if (!co.length) return out;
  const userIds = new Set<string>();
  const structIds = new Set<string>();
  const proIds = new Set<string>();
  const add = (kind: string, id: string | null) => {
    if (!id) return;
    if (kind === "user") userIds.add(id);
    else if (kind === "structure") structIds.add(id);
    else if (kind === "pro") proIds.add(id);
  };
  const coKey = (p: OwnerPost) => parseAuthorKey(coAuthors.get(p.id)?.key);
  for (const p of co) {
    if (p.persona === "fan") add("user", p.authorId);
    add("structure", p.structureId);
    add("pro", p.proId);
    const k = coKey(p);
    if (k) add(k.kind, k.id);
  }
  const [fu, fs, fp] = await Promise.all([
    userIds.size
      ? ex
          .select({ id: userFollows.followedId })
          .from(userFollows)
          .where(
            and(
              eq(userFollows.followerId, viewerId),
              inArray(userFollows.followedId, [...userIds]),
              eq(userFollows.status, "accepted"),
            ),
          )
      : [],
    structIds.size
      ? ex
          .select({ id: structureFollows.structureId })
          .from(structureFollows)
          .where(and(eq(structureFollows.userId, viewerId), inArray(structureFollows.structureId, [...structIds])))
      : [],
    proIds.size
      ? ex
          .select({ id: proFollows.proId })
          .from(proFollows)
          .where(and(eq(proFollows.userId, viewerId), inArray(proFollows.proId, [...proIds])))
      : [],
  ]);
  const followed = {
    user: new Set(fu.map((r) => r.id)),
    structure: new Set(fs.map((r) => r.id)),
    pro: new Set(fp.map((r) => r.id)),
  };
  const follows = (kind: string, id: string | null) =>
    id !== null &&
    ((kind === "user" && (id === viewerId || followed.user.has(id))) ||
      (kind === "structure" && followed.structure.has(id)) ||
      (kind === "pro" && followed.pro.has(id)));
  for (const p of co) {
    const k = coKey(p);
    const view = coAuthors.get(p.id);
    if (!k || !view) continue;
    const authorFollowed =
      (p.persona === "fan" && follows("user", p.authorId)) ||
      follows("structure", p.structureId) ||
      follows("pro", p.proId);
    if (authorFollowed || !follows(k.kind, k.id)) continue;
    out.set(p.id, {
      authorId: k.kind === "user" ? k.id : null,
      structureId: k.kind === "structure" ? k.id : null,
      proId: k.kind === "pro" ? k.id : null,
      name: view.name,
      mine: k.kind === "user" && k.id === viewerId,
    });
  }
  return out;
}
