// Mentions d'une publication (vague R8, lot R8a2, ARCHITECTURE-R8 § 1.1, § 2.4) : matérialisation à la création (cibles de
// `mentionsOf`), listes sur les fiches, « Masquer de la fiche ». Une mention est une ligne `(publication, cible)` ; la
// publication reste chez son auteur, la fiche choisit de la montrer ou non. Un prestataire ou un média n'a ni slug ni
// pseudo de page : il ne peut pas être cité par `@` dans R8 (ses mentions restent vides).
import {
  type AuthorKey,
  authorKeyOf,
  type CaptionWord,
  canSeeFeedPost,
  type EventMentionsSection,
  type FeedPostView,
  feedListErrors,
  feedMentionLabels,
  type MentionItem,
  type MentionsPage,
  mentionedCandidates,
  mentionsOf,
  type PostManage,
  parseMentionTargetKey,
} from "@orasso/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { events, feedPostMentions, profiles, proProfiles, structures } from "../../db/schema";
import { managedPageKeys, requireAuthorship } from "../../lib/authorship";
import { now } from "../../lib/deps";
import { forbidden, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { proShown } from "../partnerships/shown";
import { factsOf, postWithAuthor, profileOkSql, relationOf } from "./access";
import { loadPageInfo, pageKeyOf } from "./authors";
import {
  beforeSql,
  decodeCursor,
  msSql,
  pageInGoodStanding,
  pageOf,
  proPostsHidden,
  requireJournalEvent,
  visibleMentionsFrom,
} from "./lists";
import { loadPostViews } from "./posts";

/** Les mots de la légende résolus en base : fiche pro publiée (slug), structure (slug), personne (pseudo), en 3 requêtes. */
async function resolveWords(ex: Executor, groups: string[][], at: Date): Promise<CaptionWord[]> {
  if (!groups.length) return [];
  const words = [...new Set(groups.flat())];
  // L'une après l'autre : une transaction n'a qu'une connexion (les requêtes parallèles y sont dépréciées par pg).
  const pros = await ex
    .select({ id: proProfiles.id, slug: proProfiles.slug })
    .from(proProfiles)
    .where(and(inArray(sql`lower(${proProfiles.slug})`, words), proShown(at)));
  const structs = await ex
    .select({ id: structures.id, slug: structures.slug })
    .from(structures)
    .where(
      and(
        inArray(sql`lower(${structures.slug})`, words),
        isNull(structures.deletedAt),
        sql`${structures.verification} <> 'suspended'`,
      ),
    );
  const people = await ex
    .select({ userId: profiles.userId, pseudo: profiles.pseudo })
    .from(profiles)
    .where(and(inArray(sql`lower(${profiles.pseudo})`, words), profileOkSql("profiles", at)));
  // Par mention : le premier candidat (le mot complet d'abord) qui est une fiche, une structure ou une personne.
  return groups.map((candidates) => {
    for (const word of candidates) {
      const proId = pros.find((p) => p.slug.toLowerCase() === word)?.id ?? null;
      const structureId = structs.find((s) => s.slug.toLowerCase() === word)?.id ?? null;
      const userId = people.find((p) => p.pseudo.toLowerCase() === word)?.userId ?? null;
      if (proId || structureId || userId) return { word, proId, structureId, userId };
    }
    return { word: candidates[0] ?? "" };
  });
}

/** La personne citée peut-elle voir cette publication ? (même règle que le Fil : jamais un compte privé qu'elle ne suit pas.) */
async function citedCanSee(ex: Executor, citedUserId: string, postId: string, at: Date): Promise<boolean> {
  const row = await postWithAuthor(postId, ex);
  if (!row || row.post.deletedAt) return false;
  const key = pageKeyOf(row.post);
  const standing = key ? ((await loadPageInfo(ex, [row.post])).get(key)?.inGoodStanding ?? false) : false;
  const rel = await relationOf(citedUserId, row.post.authorId, ex);
  return canSeeFeedPost({ userId: citedUserId }, factsOf(row, at, standing), rel);
}

/**
 * Matérialise les mentions d'une publication (dans la transaction de sa création, ou à la reprise). Idempotente :
 * `on conflict do nothing`, la ligne garde la date de la publication. `notify` (création seulement, jamais à la reprise) :
 * une notification `feed_post_mention` à chaque **personne** citée par `@pseudo`, si elle peut voir la publication, jamais
 * à soi-même ; les pages ne sont pas prévenues ici (livraison 3, R9d). Rend le nombre de lignes créées.
 */
export async function materializeMentions(
  tx: Executor,
  postId: string,
  opts: { notify?: boolean } = {},
): Promise<number> {
  const row = await postWithAuthor(postId, tx);
  if (!row || row.post.deletedAt) return 0;
  const at = now();
  const post = row.post;
  let eventStructureId: string | null = null;
  if (post.eventId) {
    const [e] = await tx.select({ s: events.structureId }).from(events).where(eq(events.id, post.eventId));
    eventStructureId = e?.s ?? null;
  }
  const authorKey = pageKeyOf(post) ?? authorKeyOf("user", post.authorId);
  const targets = mentionsOf({
    authorKey,
    eventId: post.eventId,
    eventRole: post.eventRole,
    eventStructureId,
    commercialPartnerId: post.commercialPartnerId,
    words: await resolveWords(tx, mentionedCandidates(post.caption), at),
  });
  if (!targets.length) return 0;
  const inserted = await tx
    .insert(feedPostMentions)
    .values(
      targets.map((t) => ({ postId, targetKind: t.kind, targetId: t.id, source: t.source, createdAt: post.createdAt })),
    )
    .onConflictDoNothing()
    .returning({ kind: feedPostMentions.targetKind, id: feedPostMentions.targetId, source: feedPostMentions.source });
  if (opts.notify) {
    // Une publication de page est annoncée sous le nom et le logo de la page, jamais sous le compte de qui l'a publiée
    // (ni son pseudo, ni son avatar, dont la clé porte l'identifiant du compte).
    const page = pageKeyOf(post) ? (await loadPageInfo(tx, [post])).get(authorKey)?.view : undefined;
    const name = page ? page.name : row.author.pseudo;
    const avatarUrl = page ? page.avatarUrl : storage.url(row.author.avatarKey);
    for (const m of inserted) {
      if (m.kind !== "user" || m.source !== "caption" || m.id === post.authorId) continue;
      if (!(await citedCanSee(tx, m.id, postId, at))) continue;
      const who = name;
      await notificationsService.notify(tx, m.id, "feed_post_mention", {
        title: feedMentionLabels.notificationTitle(who),
        body: feedMentionLabels.notificationBody(who),
        data: {
          actor: { pseudo: who, avatarUrl },
          postId,
          link: "/app/fil",
        },
      });
    }
  }
  return inserted.length;
}

// --- Listes --------------------------------------------------------------------------------------------------------------

/** Les clés de page que `v` gère (affichage, sans second facteur) : les responsables voient les mentions masquées. */
async function manages(v: Viewer, key: string, ex: Executor = db): Promise<boolean> {
  return (await managedPageKeys(v.user.id, ex)).has(key);
}

async function mentionIds(
  q: { kind: string; id: string; section: EventMentionsSection | "all"; includeHidden: boolean; cursor?: string },
  at: Date,
) {
  const cursor = decodeCursor(q.cursor);
  const created = msSql("m.created_at");
  const res = await db.execute<{ id: string; source: MentionItem["source"]; hidden: boolean; at: Date }>(sql`select
      m.post_id as id, m.source as source, (m.hidden_at is not null) as hidden, ${created} as at
    ${visibleMentionsFrom(q.kind, q.id, at, { section: q.section, includeHidden: q.includeHidden })}
      and ${beforeSql(created, "m.post_id", cursor)}
    order by ${created} desc, m.post_id desc limit 21`);
  const { page, nextCursor } = pageOf(res.rows.map((r) => ({ ...r, at: new Date(r.at) })));
  return { page, nextCursor };
}

/** Chaque carte repasse par `loadPostViews` (visibilité, photos, rattachement) ; l'ordre est celui des mentions. */
async function hydrate(
  v: Viewer,
  page: { id: string; source: MentionItem["source"]; hidden: boolean }[],
  nextCursor: string | null,
  at: Date,
): Promise<MentionsPage> {
  const views = new Map(
    (
      await loadPostViews(
        db,
        page.map((r) => r.id),
        v.user.id,
        at,
      )
    ).map((p) => [p.id, p]),
  );
  return {
    items: page.flatMap((r): MentionItem[] => {
      const post = views.get(r.id);
      return post ? [{ post, source: r.source, hidden: r.hidden }] : [];
    }),
    nextCursor,
  };
}

/**
 * `GET /events/:id/mentions?section=on_site|fans&cursor=&hidden=` : session requise. Les responsables de la structure de
 * l'événement voient aussi les mentions masquées (`hidden=1`, avec `hidden: true`) ; un autre → 403.
 */
export async function listEventMentions(
  v: Viewer,
  eventId: string,
  q: { section: EventMentionsSection; cursor?: string; hidden?: "0" | "1" },
  at: Date,
): Promise<MentionsPage> {
  const event = await requireJournalEvent(db, eventId);
  const includeHidden = q.hidden === "1";
  if (includeHidden && !(await manages(v, authorKeyOf("structure", event.structureId)))) {
    throw forbidden(feedListErrors.hiddenForbidden);
  }
  const { page, nextCursor } = await mentionIds(
    { kind: "event", id: event.id, section: q.section, includeHidden, cursor: q.cursor },
    at,
  );
  return hydrate(v, page, nextCursor, at);
}

/**
 * `GET /authors/:key/mentions?cursor=&hidden=` : structure (ses événements et citations), fiche pro (collaborations
 * commerciales et citations), prestataire et média (liste vide : ni slug ni pseudo à citer), personne → 404.
 */
export async function listAuthorMentions(
  v: Viewer,
  key: AuthorKey,
  q: { cursor?: string; hidden?: "0" | "1" },
  at: Date,
): Promise<MentionsPage> {
  if (key.kind === "user") throw notFound(feedListErrors.authorNotFound);
  if (!(await pageInGoodStanding(db, key))) throw notFound(feedListErrors.authorNotFound);
  const includeHidden = q.hidden === "1";
  if (includeHidden && !(await manages(v, key.key))) throw forbidden(feedListErrors.hiddenForbidden);
  if (key.kind === "provider" || key.kind === "media") return { items: [], nextCursor: null };
  if (await proPostsHidden(db, key, v.user.id, at)) return { items: [], nextCursor: null };
  const { page, nextCursor } = await mentionIds(
    { kind: key.kind, id: key.id, section: "all", includeHidden, cursor: q.cursor },
    at,
  );
  return hydrate(v, page, nextCursor, at);
}

// --- « Masquer de la fiche » ---------------------------------------------------------------------------------------------

/**
 * `PUT|DELETE /mentions/:targetKey/:postId/hidden` : les responsables de la cible (`e:` et `s:` → `requireAuthorship` de la
 * structure, second facteur compris ; `p:` → propriétaire de la fiche) masquent la mention **sur cette fiche seulement**.
 * L'auteur n'est pas prévenu et sa publication ne change pas. Idempotent. 404 : cible, mention ou clé inconnues.
 */
export async function setMentionHidden(v: Viewer, rawTarget: string, postId: string, hidden: boolean) {
  const target = parseMentionTargetKey(rawTarget);
  if (!target || (target.kind !== "event" && target.kind !== "structure" && target.kind !== "pro")) {
    throw notFound(feedListErrors.mentionNotFound);
  }
  if (target.kind === "pro") {
    await requireAuthorship(v, { persona: "pro", proId: target.id });
  } else {
    let structureId = target.id;
    if (target.kind === "event") {
      const [e] = await db.select({ s: events.structureId }).from(events).where(eq(events.id, target.id));
      if (!e) throw notFound(feedListErrors.mentionNotFound);
      structureId = e.s;
    }
    await requireAuthorship(v, { persona: "organizer", structureId });
  }
  const where = and(
    eq(feedPostMentions.postId, postId),
    eq(feedPostMentions.targetKind, target.kind),
    eq(feedPostMentions.targetId, target.id),
  );
  const [found] = await db.select({ hiddenAt: feedPostMentions.hiddenAt }).from(feedPostMentions).where(where);
  if (!found) throw notFound(feedListErrors.mentionNotFound);
  if (hidden !== (found.hiddenAt !== null)) {
    await db
      .update(feedPostMentions)
      .set(hidden ? { hiddenAt: now(), hiddenBy: v.user.id } : { hiddenAt: null, hiddenBy: null })
      .where(where);
  }
  return { hidden };
}

/**
 * Ce que `v` peut faire d'une publication, pour l'affichage (`GET /feed-posts/:id`, champ `manage`). Calculé par
 * `managedPageKeys` (sans second facteur) : chaque écriture revérifie ses droits. `hideFrom` : les fiches cibles
 * (`e:` `s:` `p:`) que `v` gère et qui portent la publication en mention (masquées comprises : on peut les ré-afficher).
 */
export async function postManage(v: Viewer, post: FeedPostView): Promise<PostManage> {
  const managed = await managedPageKeys(v.user.id);
  const own =
    post.author.kind === "user" ? post.author.key === authorKeyOf("user", v.user.id) : managed.has(post.author.key);
  const rows = await db
    .select({ kind: feedPostMentions.targetKind, id: feedPostMentions.targetId })
    .from(feedPostMentions)
    .where(eq(feedPostMentions.postId, post.id));
  const eventIds = rows.filter((r) => r.kind === "event").map((r) => r.id);
  const structureOf = new Map(
    eventIds.length
      ? (
          await db.select({ id: events.id, s: events.structureId }).from(events).where(inArray(events.id, eventIds))
        ).map((e) => [e.id, e.s])
      : [],
  );
  const hideFrom = rows.flatMap((r): string[] => {
    if (r.kind === "event") {
      const s = structureOf.get(r.id);
      return s && managed.has(authorKeyOf("structure", s)) ? [authorKeyOf("event", r.id)] : [];
    }
    if (r.kind === "structure" || r.kind === "pro") {
      return managed.has(authorKeyOf(r.kind, r.id)) ? [authorKeyOf(r.kind, r.id)] : [];
    }
    return [];
  });
  return {
    canDelete: own,
    canPin: own && post.author.kind === "structure" && post.attach?.role === "organizer",
    canCommentsOff: own,
    hideFrom,
  };
}

/**
 * Reprise (au déploiement, `pnpm --filter @orasso/api tsx scripts/backfill-mentions.ts`) : matérialise les mentions des
 * publications déjà en base (rattachées par un passionné ou un prestataire, `@mot`, collaboration commerciale), **sans
 * notification**. Rejouable : `on conflict do nothing`, les lignes gardent la date de leur publication. Par lots, une
 * transaction par publication.
 */
export async function backfillMentions(batch = 200): Promise<{ posts: number; created: number }> {
  let after = "00000000-0000-0000-0000-000000000000";
  let posts = 0;
  let created = 0;
  for (;;) {
    const res = await db.execute<{ id: string }>(sql`select p.id from feed_posts p
      where p.deleted_at is null and p.id > ${after}
        and ((p.event_id is not null and p.event_role in ('on_site', 'attendee'))
          or p.commercial_partner_id is not null or p.caption like '%@%')
      order by p.id limit ${batch}`);
    if (!res.rows.length) break;
    for (const r of res.rows) {
      created += await withTx((tx) => materializeMentions(tx, r.id));
      posts += 1;
    }
    after = res.rows[res.rows.length - 1]?.id ?? after;
  }
  return { posts, created };
}
