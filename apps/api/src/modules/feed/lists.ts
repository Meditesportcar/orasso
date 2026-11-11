// Listes de publications (vague R8, lot R8a2, ARCHITECTURE-R8 § 2.4, § 4.2) : celles d'un auteur (personne ou page), le
// journal d'un événement (publications de l'organisateur rattachées à lui, l'épinglée en tête), et les compteurs des
// fiches. Les conditions de lecture sont écrites **une fois** en SQL (`postOkSql`, `visibleMentionsFrom`) et servent à la
// liste et au compteur : un compteur ne dit jamais plus que la liste. Chaque carte repasse ensuite par `loadPostViews`
// (visibilité, photos, rattachement) ; aucune requête par publication.
import {
  type AuthorKey,
  type AuthorPostsFilter,
  type AuthorPostsPage,
  authorKeyOf,
  type FeedPostView,
  feedListErrors,
  type PageCounts,
  type ProfileCounts,
  parseAuthorKey,
} from "@orasso/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { mediaProfiles, profiles, proProfiles, providerProfiles, structures } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound, validation } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";
import { profileOkSql, unavailable } from "./access";
import { attachEventsByIds } from "./attach";
import { loadPostViews } from "./posts";

export const PAGE = 20;

// --- Curseur : (date à la milliseconde, identifiant). Le curseur porte des millisecondes (JavaScript) : on compare et on
// trie à la milliseconde, pas à la microseconde de PostgreSQL, sinon des publications de la même milliseconde seraient
// sautées entre deux pages (même règle que `GET /me/feed-posts`).
export type ListCursor = {
  at: Date;
  id: string /** Journal : l'épinglée de la première page, exclue des suivantes. */;
  pin?: string;
};

export const encodeCursor = (c: { at: Date; id: string; pin?: string | null }): string =>
  Buffer.from(JSON.stringify({ at: c.at.toISOString(), id: c.id, ...(c.pin ? { pin: c.pin } : {}) })).toString(
    "base64url",
  );

export function decodeCursor(raw: string | undefined): ListCursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString()) as { at?: unknown; id?: unknown; pin?: unknown };
    if (typeof c.at !== "string" || Number.isNaN(Date.parse(c.at)) || typeof c.id !== "string") throw new Error();
    if (!/^[0-9a-f-]{36}$/.test(c.id)) throw new Error();
    if (c.pin !== undefined && (typeof c.pin !== "string" || !/^[0-9a-f-]{36}$/.test(c.pin))) throw new Error();
    return { at: new Date(c.at), id: c.id, ...(typeof c.pin === "string" ? { pin: c.pin } : {}) };
  } catch {
    throw validation("Curseur invalide : recharge la liste.");
  }
}

/** Date à la milliseconde d'une colonne `timestamptz`. */
export const msSql = (col: string): SQL => sql`date_trunc('milliseconds', ${sql.raw(col)})`;

/** « avant ce curseur », dans l'ordre (date décroissante, identifiant décroissant). */
export const beforeSql = (at: SQL, idCol: string, c: ListCursor | null): SQL =>
  c ? sql`(${at} < ${c.at} or (${at} = ${c.at} and ${sql.raw(idCol)} < ${c.id}))` : sql`true`;

// --- Conditions communes (alias fixes : `p` = feed_posts, `a` = profiles de p.author_id) -------------------------------

/** La page de la publication est en règle (jamais supprimée, structure pas suspendue) ; sans objet pour une personne. */
const pageStandingSql = sql`(case p.persona
  when 'organizer' then exists (select 1 from structures s where s.id = p.structure_id and s.deleted_at is null and s.verification <> 'suspended')
  when 'pro' then exists (select 1 from pro_profiles x where x.id = p.pro_id and x.deleted_at is null)
  when 'provider' then exists (select 1 from provider_profiles x where x.id = p.provider_id and x.deleted_at is null)
  when 'media' then exists (select 1 from media_profiles x where x.id = p.media_id and x.deleted_at is null)
  else true end)`;

/** Un visuel existe : une photo, ou l'affiche d'un événement encore visible (sinon `loadPostViews` ne sert pas la ligne). */
const servedSql = sql`(exists (select 1 from feed_post_photos ph where ph.post_id = p.id)
  or exists (select 1 from events ev join structures es on es.id = ev.structure_id
    where ev.id = p.event_id and ev.status in ('published', 'cancelled') and ev.admission <> 'invite_only'
      and es.deleted_at is null and coalesce(ev.poster_post_key, ev.poster_key, ev.poster_photo_key) is not null))`;

/**
 * Une publication qui peut figurer dans une liste, quel que soit le lecteur : non retirée, avec un visuel, d'un auteur en
 * règle. Page : la personne qui a publié n'est pas bannie et la page est en règle ; personne : compte en règle.
 */
export const postOkSql = (at: Date): SQL => sql`(p.deleted_at is null and ${servedSql} and
  (case when p.persona = 'fan' then ${profileOkSql("a", at)} else (a.banned_at is null and ${pageStandingSql}) end))`;

/** La présence de l'auteur de `p` à l'événement de `p` est validée (pointage, billet contrôlé, présence GPS). */
const presenceSql = sql`(exists (select 1 from checkins c join applications ap on ap.id = c.application_id
      where c.event_id = p.event_id and ap.user_id = p.author_id and ap.kind = 'vehicle')
    or exists (select 1 from tickets t where t.event_id = p.event_id and t.user_id = p.author_id and t.used_at is not null)
    or exists (select 1 from event_presences g where g.event_id = p.event_id and g.user_id = p.author_id))`;

/**
 * Les mentions de cette cible qu'un lecteur voit, en SQL (miroir de `mentionVisible`, `rules/feedMentions.ts`) : jamais
 * une publication d'un compte privé ; une mention de rattachement suit son rôle (« Sur place » : `on_site`, « Passionnés » :
 * `attendee`, et après la fin de l'événement présence validée seulement) ; une citation ne vaut que dans la rubrique
 * « toutes ». `includeHidden` : les responsables de la cible voient aussi les mentions masquées.
 * Rend `from … where …` (alias `m`, `p`, `a`), à compléter par un `select`.
 */
export function visibleMentionsFrom(
  kind: string,
  id: string,
  at: Date,
  o: { section: "on_site" | "fans" | "all"; includeHidden?: boolean },
): SQL {
  const attach: SQL[] = [];
  if (o.section !== "fans") attach.push(sql`p.event_role = 'on_site'`);
  if (o.section !== "on_site") {
    attach.push(sql`(p.event_role = 'attendee' and (
      coalesce((select e2.ends_at from events e2 where e2.id = p.event_id), 'infinity'::timestamptz) > ${at}
      or ${presenceSql}))`);
  }
  const roleOk = sql`(m.source = 'attach' and p.event_id is not null and (${sql.join(attach, sql` or `)}))`;
  const citation = o.section === "all" ? sql`m.source <> 'attach'` : sql`false`;
  return sql`from feed_post_mentions m
    join feed_posts p on p.id = m.post_id
    join profiles a on a.user_id = p.author_id
    where m.target_kind = ${kind}::feed_mention_target and m.target_id = ${id}
      and ${o.includeHidden ? sql`true` : sql`m.hidden_at is null`}
      and ${postOkSql(at)}
      and not (p.persona = 'fan' and a.visibility = 'private')
      and (${roleOk} or ${citation})`;
}

// --- Pages : existence et état --------------------------------------------------------------------------------------

/** La page existe et est en règle (ni supprimée, ni — pour une structure — suspendue). */
export async function pageInGoodStanding(ex: Executor, key: AuthorKey): Promise<boolean> {
  switch (key.kind) {
    case "structure": {
      const [r] = await ex
        .select({ id: structures.id })
        .from(structures)
        .where(
          and(
            eq(structures.id, key.id),
            sql`${structures.deletedAt} is null`,
            sql`${structures.verification} <> 'suspended'`,
          ),
        );
      return Boolean(r);
    }
    case "pro": {
      const [r] = await ex
        .select({ id: proProfiles.id })
        .from(proProfiles)
        .where(and(eq(proProfiles.id, key.id), sql`${proProfiles.deletedAt} is null`));
      return Boolean(r);
    }
    case "provider": {
      const [r] = await ex
        .select({ id: providerProfiles.id })
        .from(providerProfiles)
        .where(and(eq(providerProfiles.id, key.id), sql`${providerProfiles.deletedAt} is null`));
      return Boolean(r);
    }
    case "media": {
      const [r] = await ex
        .select({ id: mediaProfiles.id })
        .from(mediaProfiles)
        .where(and(eq(mediaProfiles.id, key.id), sql`${mediaProfiles.deletedAt} is null`));
      return Boolean(r);
    }
    default:
      return false;
  }
}

/** Lit la clé d'une adresse (déjà décodée par le routeur : `s:<uuid>`, `u:<compte>`…) ; 404 si elle est mal formée (on ne dit pas pourquoi). */
export function requireAuthorKey(raw: string | undefined): AuthorKey {
  const key = parseAuthorKey(raw ?? "");
  if (!key) throw notFound(feedListErrors.authorNotFound);
  return key;
}

/** La colonne de page de `feed_posts` d'une clé, en SQL (`p.structure_id = …`) ; `fan` : `p.persona = 'fan' and p.author_id`. */
export function authorPostsWhere(key: AuthorKey): SQL {
  switch (key.kind) {
    case "user":
      return sql`(p.persona = 'fan' and p.author_id = ${key.id})`;
    case "structure":
      return sql`(p.persona = 'organizer' and p.structure_id = ${key.id})`;
    case "pro":
      return sql`(p.persona = 'pro' and p.pro_id = ${key.id})`;
    case "provider":
      return sql`(p.persona = 'provider' and p.provider_id = ${key.id})`;
    case "media":
      return sql`(p.persona = 'media' and p.media_id = ${key.id})`;
  }
}

const filterSql = (f: AuthorPostsFilter): SQL =>
  f === "event" ? sql`p.event_id is not null` : f === "no_event" ? sql`p.event_id is null` : sql`true`;

/** Identifiants des publications d'un auteur, du plus récent au plus ancien (20 + 1 pour savoir s'il y en a d'autres). */
export async function authorPostIds(
  ex: Executor,
  key: AuthorKey,
  filter: AuthorPostsFilter,
  cursor: ListCursor | null,
  at: Date,
  limit = PAGE + 1,
): Promise<{ id: string; at: Date }[]> {
  const created = msSql("p.created_at");
  const res = await ex.execute<{ id: string; at: Date }>(sql`select p.id as id, ${created} as at
    from feed_posts p join profiles a on a.user_id = p.author_id
    where ${authorPostsWhere(key)} and ${filterSql(filter)} and ${postOkSql(at)} and ${beforeSql(created, "p.id", cursor)}
    order by ${created} desc, p.id desc limit ${limit}`);
  return res.rows.map((r) => ({ id: r.id, at: new Date(r.at) }));
}

/** Découpe une page : ses éléments, et le curseur de la suivante s'il en reste. */
export function pageOf<T extends { id: string; at: Date }>(
  rows: T[],
  size = PAGE,
): { page: T[]; nextCursor: string | null } {
  const page = rows.slice(0, size);
  const last = page.at(-1);
  return { page, nextCursor: rows.length > size && last ? encodeCursor({ at: last.at, id: last.id }) : null };
}

const RESTRICTED: AuthorPostsPage = { items: [], nextCursor: null, restricted: true };

/**
 * `GET /authors/:key/feed-posts` : **strictement** les publications de cet auteur. Personne : compte en règle (404
 * sinon) ; compte privé non suivi → `restricted`, **même réponse qu'il ait publié ou non**. Page : tout membre
 * connecté ; page supprimée ou suspendue → 404.
 */
export async function listAuthorPosts(
  v: Viewer,
  key: AuthorKey,
  q: { cursor?: string; filter: AuthorPostsFilter },
  at: Date,
): Promise<AuthorPostsPage> {
  const cursor = decodeCursor(q.cursor);
  if (key.kind === "user") {
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, key.id));
    if (!p || unavailable(p, at)) throw notFound(feedListErrors.authorNotFound);
    if (p.visibility === "private" && p.userId !== v.user.id) {
      const rel = await db.execute<{ ok: boolean }>(
        sql`select exists (select 1 from user_follows uf where uf.follower_id = ${v.user.id} and uf.followed_id = ${key.id} and uf.status = 'accepted') as ok`,
      );
      if (!rel.rows[0]?.ok) return RESTRICTED;
    }
  } else if (!(await pageInGoodStanding(db, key))) {
    throw notFound(feedListErrors.authorNotFound);
  }
  const rows = await authorPostIds(db, key, q.filter, cursor, at);
  const { page, nextCursor } = pageOf(rows);
  const items: FeedPostView[] = await loadPostViews(
    db,
    page.map((r) => r.id),
    v.user.id,
    at,
  );
  return { items, nextCursor, restricted: false };
}

// --- Le journal d'un événement ---------------------------------------------------------------------------------------

/** Les publications du journal : de la structure de l'événement, rattachées à lui, par l'organisateur. */
const journalWhere = (eventId: string, structureId: string): SQL =>
  sql`(p.persona = 'organizer' and p.structure_id = ${structureId} and p.event_id = ${eventId} and p.event_role = 'organizer')`;

/** L'événement d'un journal : publié ou annulé, ni sur invitation, d'une structure non supprimée ; 404 sinon. */
export async function requireJournalEvent(ex: Executor, eventId: string) {
  const e = (await attachEventsByIds(ex, [eventId])).get(eventId);
  if (!e) throw notFound(feedListErrors.eventNotFound);
  return e;
}

/**
 * Les identifiants du journal : l'épinglée en tête de la **première** page (elle compte dans les 20), puis le reste par
 * date décroissante (l'épinglée n'y revient pas).
 */
export async function journalPostIds(
  ex: Executor,
  event: { id: string; structureId: string },
  cursor: ListCursor | null,
  at: Date,
): Promise<{ ids: string[]; nextCursor: string | null }> {
  let pinned: string | null = null;
  if (!cursor) {
    const res = await ex.execute<{
      id: string;
    }>(sql`select p.id from feed_posts p join profiles a on a.user_id = p.author_id
      where ${journalWhere(event.id, event.structureId)} and p.pinned_at is not null and ${postOkSql(at)} limit 1`);
    pinned = res.rows[0]?.id ?? null;
  }
  const size = pinned ? PAGE - 1 : PAGE;
  const created = msSql("p.created_at");
  const res = await ex.execute<{ id: string; at: Date }>(sql`select p.id as id, ${created} as at
    from feed_posts p join profiles a on a.user_id = p.author_id
    where ${journalWhere(event.id, event.structureId)} and ${pinned ? sql`p.id <> ${pinned}` : cursor?.pin ? sql`p.id <> ${cursor.pin}` : sql`true`} and ${postOkSql(at)}
      and ${beforeSql(created, "p.id", cursor)}
    order by ${created} desc, p.id desc limit ${size + 1}`);
  const { page } = pageOf(
    res.rows.map((r) => ({ id: r.id, at: new Date(r.at) })),
    size,
  );
  // L'épinglée de la première page reste dans le curseur : les pages suivantes l'excluent par son identifiant (et non par
  // `pinned_at`, qui peut changer entre deux lectures : doublon ou publication omise).
  const last = page.at(-1);
  const nextCursor =
    res.rows.length > size && last ? encodeCursor({ at: last.at, id: last.id, pin: pinned ?? cursor?.pin }) : null;
  return { ids: [...(pinned ? [pinned] : []), ...page.map((r) => r.id)], nextCursor };
}

// --- Compteurs -------------------------------------------------------------------------------------------------------

/**
 * Compteurs de la fiche publique d'un événement : `publications` (le journal) et, avec une session, `mentions` (ce que
 * **ce lecteur** verrait : « Sur place » et « Passionnés »). Une requête.
 */
export async function countsForEvent(
  ex: Executor,
  event: { id: string; structureId: string },
  viewerId: string | null,
  at: Date,
): Promise<PageCounts> {
  const res = await ex.execute<{ publications: number; mentions: number }>(sql`select
    (select count(*)::int from feed_posts p join profiles a on a.user_id = p.author_id
      where ${journalWhere(event.id, event.structureId)} and ${postOkSql(at)}) as publications,
    ${viewerId ? sql`(select count(*)::int ${visibleMentionsFrom("event", event.id, at, { section: "all" })})` : sql`0`} as mentions`);
  const r = res.rows[0];
  return viewerId
    ? { publications: { count: Number(r?.publications ?? 0) }, mentions: { count: Number(r?.mentions ?? 0) } }
    : { publications: { count: Number(r?.publications ?? 0) } };
}

/**
 * Compteurs de la page d'une structure, d'une fiche pro, d'un prestataire ou d'un média (une requête) : `publications`
 * et `mentions` (ce que ce lecteur verrait). Sans session : seule une structure compte ses publications (T4 : un visiteur
 * ne voit que celles de l'organisateur) et `mentions` est absent. Prestataire et média n'ont pas de mentions (`0`).
 */
export async function countsForAuthor(
  ex: Executor,
  key: AuthorKey,
  viewerId: string | null,
  at: Date,
): Promise<PageCounts> {
  if (key.kind === "user") return {};
  if (!viewerId && key.kind !== "structure") return {};
  const cited = key.kind === "structure" || key.kind === "pro";
  const res = await ex.execute<{ publications: number; mentions: number }>(sql`select
    (select count(*)::int from feed_posts p join profiles a on a.user_id = p.author_id
      where ${authorPostsWhere(key)} and ${postOkSql(at)}) as publications,
    ${viewerId && cited ? sql`(select count(*)::int ${visibleMentionsFrom(key.kind, key.id, at, { section: "all" })})` : sql`0`} as mentions`);
  const r = res.rows[0];
  return viewerId
    ? { publications: { count: Number(r?.publications ?? 0) }, mentions: { count: Number(r?.mentions ?? 0) } }
    : { publications: { count: Number(r?.publications ?? 0) } };
}

/**
 * Compteur du profil d'une personne (une requête) : **nul quand la liste est restreinte** (compte privé non suivi, qui ne
 * dit rien de plus que son profil). Le compte est celui du pseudo, en règle.
 */
export async function countsForPerson(
  ex: Executor,
  pseudo: string,
  viewerId: string,
  at: Date,
): Promise<ProfileCounts> {
  const res = await ex.execute<{ n: number | null }>(sql`select case
      when ${profileOkSql("a", at)} and (a.visibility = 'public' or a.user_id = ${viewerId}
        or exists (select 1 from user_follows uf where uf.follower_id = ${viewerId} and uf.followed_id = a.user_id and uf.status = 'accepted'))
      then (select count(*)::int from feed_posts p where p.persona = 'fan' and p.author_id = a.user_id and p.deleted_at is null and ${servedSql})
      else null end as n
    from profiles a where lower(a.pseudo) = lower(${pseudo})`);
  const n = res.rows[0]?.n;
  return { publications: n === null || n === undefined ? null : { count: Number(n) } };
}

/** `GET /events/:id/feed-posts` avec session : le journal, l'épinglée en tête de la première page. */
export async function listJournal(
  v: Viewer,
  eventId: string,
  rawCursor: string | undefined,
  at: Date,
): Promise<{ items: FeedPostView[]; nextCursor: string | null }> {
  const event = await requireJournalEvent(db, eventId);
  const { ids, nextCursor } = await journalPostIds(db, event, decodeCursor(rawCursor), at);
  return { items: await loadPostViews(db, ids, v.user.id, at), nextCursor };
}

// --- Décoration des fiches publiques (une ligne dans chaque fichier de routes) ---------------------------------------------

/** Compteurs de la fiche d'un événement (rien pour un brouillon, un événement sur invitation ou d'une structure supprimée). */
export async function eventCountsFor(eventId: string, viewer: Viewer | null): Promise<PageCounts> {
  const e = (await attachEventsByIds(db, [eventId])).get(eventId);
  if (!e || (!viewer && !(await structureVerified(e.structureId)))) return {};
  return countsForEvent(db, e, viewer?.user.id ?? null, now());
}

/** Compteurs de la page d'une structure, d'un pro, d'un prestataire ou d'un média. */
export async function authorCountsFor(kind: AuthorKey["kind"], id: string, viewer: Viewer | null): Promise<PageCounts> {
  if (!viewer && kind === "structure" && !(await structureVerified(id))) return {};
  return countsForAuthor(db, { kind, id, key: authorKeyOf(kind, id) }, viewer?.user.id ?? null, now());
}

/** Sans session, une structure non vérifiée ne montre rien (comme son journal, qui répond 404) : ni liste, ni compteur. */
async function structureVerified(structureId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: structures.id })
    .from(structures)
    .where(
      and(
        eq(structures.id, structureId),
        eq(structures.verification, "verified"),
        sql`${structures.deletedAt} is null`,
      ),
    );
  return Boolean(r);
}

/** Compteur du profil d'une personne : `publications` nul quand la liste est restreinte. */
export const personCountsFor = (pseudo: string, viewer: Viewer): Promise<ProfileCounts> =>
  countsForPerson(db, pseudo, viewer.user.id, now());
