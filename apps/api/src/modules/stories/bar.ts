// Barre des stories et résumé d'un auteur (lot R7f1, ARCHITECTURE-R7 § 2.5). Une entrée par auteur (personne,
// structure ou pro), seulement ceux que je suis (abonnement accepté) et mes crews ; les mutes sont exclus ; les non vues
// d'abord. Un compte privé que je ne suis pas (ou dont la demande est en attente) n'apparaît pas, et rien ne dit qu'il a
// une story. Lot R7h : `live` (organisateur « En cours ») = la structure a un événement publié qui tourne (du début à la fin)
// et une story vivante ; une structure dont j'ai une place à un événement en cours est dans ma barre sans que je la suive.
// Lot R8s : l'ordre est décidé ici (non vues d'abord, puis rang 2 / 3 / 4, puis la plus récente) ; le rang n'est pas servi.
// Lot R9a : les prestataires et les médias suivis (`v:`, `m:`) entrent dans la barre ; lue « en tant que » une page
// (`X-Orasso-Actor`), la barre est celle de la page : `mine` = ses stories, `authors` = les pages et les comptes publics
// qu'elle suit (jamais un crew, jamais une place à un événement, jamais un compte privé), mutes de la personne appliqués.
// Invariant : tout ce qu'une barre lue en casquette contient est visible de n'importe quel membre connecté.
import {
  type AudienceRelation,
  type BarRank,
  STORY_LIVE_MAX,
  type StoriesSummary,
  type StoryAuthorKind,
  type StoryBar,
  type StoryBarEntry,
  storyAuthorKeyOf,
  storyBarOrder,
  storyDenial,
  storyRing,
} from "@orasso/shared";
import { type AnyColumn, and, eq, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { stories, storyMutes, storyViews } from "../../db/schema";
import { type Actor, isPageActor } from "../../lib/actor";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import {
  audienceStoryOf,
  authorDisplay,
  authorKeyOf,
  liveStory,
  loadActorSets,
  loadViewerSets,
  notMaskedCopy,
  relationOf,
  type StoryRow,
  selectStories,
  setsFor,
  viewerOf,
} from "./common";

/** Le regard d'un membre connecté quelconque : aucun lien avec l'auteur (barre lue en casquette, lot R9a). */
const NO_RELATION: AudienceRelation = { followAccepted: false, crewMemberActive: () => false, tagged: false };

/** Stories gardées par auteur (après le filtre de visibilité) ; le plafond de publication est le même. */
const PER_AUTHOR_MAX = STORY_LIVE_MAX;

const ringStories = (rows: readonly StoryRow[]) =>
  rows.map((r) => ({ audience: r.story.audience, expiresAt: r.story.expiresAt, deletedAt: r.story.deletedAt }));

const newest = (rows: readonly StoryRow[]) => rows.reduce((a, b) => (a.story.createdAt >= b.story.createdAt ? a : b));

/**
 * Les stories vivantes que j'ai vues, lues par jointure avec `story_views` : aucun identifiant de story n'est envoyé
 * en paramètre (une longue liste de suivis ne fait pas dépasser la limite de paramètres de PostgreSQL).
 */
async function seenSet(userId: string, at: Date): Promise<Set<string>> {
  const seen = await db
    .select({ id: storyViews.storyId })
    .from(storyViews)
    .innerJoin(stories, eq(stories.id, storyViews.storyId))
    .where(and(eq(storyViews.viewerId, userId), liveStory(at)));
  return new Set(seen.map((r) => r.id));
}

/** Une liste d'identifiants en UN seul paramètre (tableau PostgreSQL), jamais un paramètre par identifiant. */
const anyOf = (column: SQL | AnyColumn, ids: Iterable<string>, type: "text" | "uuid") =>
  sql`${column} = any(${sql.param([...ids])}::${sql.raw(type)}[])`;

/** Stories signées d'une personne (casquette passionné) : celles d'une page ont leur propre clé (lot R9a). */
const personal = sql`${stories.persona} = 'fan'`;

/** Les structures qui ont un événement publié en cours (du début à la fin) : l'anneau « EN COURS ». */
export async function liveStructureIds(at: Date): Promise<Set<string>> {
  const res = await db.execute<{ id: string }>(
    sql`select distinct e.structure_id::text as id from events e
      where e.status = 'published' and e.starts_at <= ${at} and e.ends_at > ${at}`,
  );
  return new Set(res.rows.map((r) => r.id));
}

/** Les structures dont j'ai une place (candidature retenue, billet, présence) à un événement en cours. */
async function structuresWithPlace(userId: string, at: Date): Promise<Set<string>> {
  const res = await db.execute<{ id: string }>(
    sql`select distinct e.structure_id::text as id from events e
      where e.status = 'published' and e.starts_at <= ${at} and e.ends_at > ${at}
        and (exists (select 1 from applications a where a.event_id = e.id and a.user_id = ${userId}
              and a.kind = 'vehicle' and a.status = 'accepted')
          or exists (select 1 from tickets k where k.event_id = e.id and k.user_id = ${userId} and k.status in ('valid', 'used'))
          or exists (select 1 from event_presences g where g.event_id = e.id and g.user_id = ${userId}))`,
  );
  return new Set(res.rows.map((r) => r.id));
}

/**
 * Les structures dont j'ai une place à un événement À VENIR (lot R8s, rang 3 de la barre) : événement publié qui n'a pas
 * commencé, et ma candidature véhicule retenue ou un billet valable. Une candidature en attente, refusée ou retirée, un
 * billet annulé ou déjà contrôlé, un événement fini, annulé ou non publié ne comptent pas.
 */
export async function structuresWithUpcomingPlace(userId: string, at: Date): Promise<Set<string>> {
  const res = await db.execute<{ id: string }>(
    sql`select distinct e.structure_id::text as id from events e
      where e.status = 'published' and e.starts_at > ${at}
        and (exists (select 1 from applications a where a.event_id = e.id and a.user_id = ${userId}
              and a.kind = 'vehicle' and a.status = 'accepted')
          or exists (select 1 from tickets k where k.event_id = e.id and k.user_id = ${userId} and k.status = 'valid'))`,
  );
  return new Set(res.rows.map((r) => r.id));
}

/** Pour une page publique (structure, pro) : zéro sans session (aucune story n'est servie sans session). */
export async function storiesSummaryFor(v: Viewer | null, kind: StoryAuthorKind, id: string): Promise<StoriesSummary> {
  if (!v) return { count: 0, hasUnseen: false, ring: null };
  return storiesBar.summary(v, kind, id);
}

export const storiesBar = {
  /**
   * `GET /stories/bar`. `actor` : la page au nom de laquelle on lit (absent ou moi : la barre de la personne). Une page n'a
   * ni crew ni place à un événement : seulement ce qu'elle suit, et seulement du contenu public.
   */
  async get(v: Viewer, actor?: Actor): Promise<StoryBar> {
    const at = now();
    const me = v.user.id;
    const asPage = actor && isPageActor(actor) ? actor : null;
    const sets = asPage ? await loadActorSets(asPage, at) : await loadViewerSets(me);
    // Lot R7h : l'organisateur d'un événement où j'ai ma place apparaît « EN COURS » même si je ne le suis pas.
    // Lot R8s : de même la structure d'un événement à venir où je suis retenu ou porteur d'un billet valable (rang 3).
    // Lot R9a : une page n'a pas de place : ces deux ensembles sont vides en casquette.
    const [liveStructures, placeStructures, upcomingStructures] = await Promise.all([
      liveStructureIds(at),
      asPage ? new Set<string>() : structuresWithPlace(me, at),
      asPage ? new Set<string>() : structuresWithUpcomingPlace(me, at),
    ]);
    const poolStructures = new Set([...sets.structures, ...placeStructures, ...upcomingStructures]);
    // Rang dans la barre : 2 événement en cours où j'ai ma place, 3 événement à venir où j'ai ma place, 4 le reste.
    const rankOf = (key: string): BarRank => {
      if (!key.startsWith("s:")) return 4;
      const id = key.slice(2);
      return placeStructures.has(id) ? 2 : upcomingStructures.has(id) ? 3 : 4;
    };
    const mutedRows = await db.select().from(storyMutes).where(eq(storyMutes.userId, me));
    const muted = new Set(mutedRows.map((m) => storyAuthorKeyOf(m.authorKind, m.authorId)));
    // Une page de prestataire ou de média est aussi masquée si le compte de son titulaire l'est (lot R9a : qui avait masqué
    // une personne avant la migration ne voit pas revenir ses stories de food truck).
    const mutedRow = (r: StoryRow, key: string) =>
      muted.has(key) ||
      ((r.story.persona === "provider" || r.story.persona === "media") &&
        muted.has(storyAuthorKeyOf("user", r.story.authorId)));

    const ors: (SQL | undefined)[] = [];
    if (sets.users.size) ors.push(and(personal, anyOf(stories.authorId, sets.users, "text")));
    if (sets.crews.size) ors.push(anyOf(stories.crewId, sets.crews.keys(), "uuid"));
    if (poolStructures.size)
      ors.push(and(eq(stories.persona, "organizer"), anyOf(stories.structureId, poolStructures, "uuid")));
    if (sets.pros.size) ors.push(and(eq(stories.persona, "pro"), anyOf(stories.proId, sets.pros, "uuid")));
    if (sets.providers.size)
      ors.push(and(eq(stories.persona, "provider"), anyOf(stories.providerId, sets.providers, "uuid")));
    if (sets.medias.size) ors.push(and(eq(stories.persona, "media"), anyOf(stories.mediaId, sets.medias, "uuid")));
    // Tour 5 : les copies masquées (originale indisponible) sont exclues dans le SQL, avant toute sélection ; aucune limite
    // de lignes par auteur n'est supposée ici : le plafond de publication ne compte que les copies non masquées, et à la
    // levée d'une suspension un auteur peut avoir plus de 50 stories vivantes. `hasUnseen` se lit donc sur toutes les
    // stories visibles ; seuls l'anneau et l'affichage se limitent aux `PER_AUTHOR_MAX` plus récentes (plus bas).
    const pool = ors.length
      ? (and(
          liveStory(at),
          // Moi : jamais mes propres stories. Une page : seulement les siennes sont écartées (plus bas, par la clé).
          asPage ? undefined : sql`${stories.authorId} <> ${me}`,
          notMaskedCopy(at),
          or(...ors),
        ) as SQL)
      : null;
    const candidates = pool
      ? (await selectStories(pool)).sort((a, b) => b.story.createdAt.getTime() - a.story.createdAt.getTime())
      : [];

    const viewer = viewerOf(v);
    const visible = candidates.filter((r) => {
      const key = authorKeyOf(r);
      if (!key || mutedRow(r, key.key)) return false;
      if (asPage) {
        // Lue en casquette, la barre ne contient que du contenu visible de n'importe quel membre connecté : on juge chaque
        // story avec un regard sans aucun lien (ni abonnement accepté, ni crew, ni identification). Un abonnement de page
        // n'est pas un abonnement accepté : jamais un crew, jamais les abonnés d'un compte privé, jamais un compte privé.
        if (key.key === asPage.key) return false;
        return storyDenial(viewer, audienceStoryOf(r, at), NO_RELATION) === null;
      }
      return storyDenial(viewer, audienceStoryOf(r, at), relationOf(sets, r)) === null;
    });
    const seen = await seenSet(me, at);

    const byAuthor = new Map<string, StoryRow[]>();
    for (const r of visible) {
      const key = authorKeyOf(r);
      if (key) byAuthor.set(key.key, [...(byAuthor.get(key.key) ?? []), r]);
    }
    const entries: { entry: Omit<StoryBarEntry, "latestAt">; hasUnseen: boolean; latestAt: Date; rank: BarRank }[] = [];
    for (const [key, all] of byAuthor) {
      // `hasUnseen` se lit sur toutes les stories visibles de l'auteur ; l'anneau et l'affichage sur les plus récentes.
      const hasUnseen = all.some((r) => !seen.has(r.story.id));
      const rows = all.slice(0, PER_AUTHOR_MAX);
      const ring = storyRing({ live: key.startsWith("s:") && liveStructures.has(key.slice(2)) }, ringStories(rows), at);
      if (!ring) continue;
      const latest = newest(rows);
      const display = authorDisplay(latest, storage.url);
      const crewRows = rows.filter((r) => r.story.audience === "crew");
      entries.push({
        entry: {
          key,
          pseudoOrName: display.name,
          avatarUrl: display.avatarUrl,
          ring,
          hasUnseen,
          crewName: ring === "crew" && crewRows.length ? newest(crewRows).crewName : null,
        },
        hasUnseen,
        latestAt: latest.story.createdAt,
        rank: rankOf(key),
      });
    }
    const authors: StoryBarEntry[] = storyBarOrder(entries).map((e) => ({
      ...e.entry,
      latestAt: e.latestAt.toISOString(),
    }));

    // « Ta story » ne compte que mes stories personnelles : celles que `by-author u:<moi>` sert. Celles au nom d'une
    // structure ou d'un pro ont leur propre clé (`s:`, `p:`) ; les compter ici ouvrirait une visionneuse vide.
    // Lot R9a : lue en casquette, `mine` = les stories vivantes de la page (sa propre clé).
    const mineWhere = !asPage
      ? and(eq(stories.authorId, me), personal)
      : asPage.kind === "structure"
        ? and(eq(stories.persona, "organizer"), eq(stories.structureId, asPage.id))
        : asPage.kind === "pro"
          ? and(eq(stories.persona, "pro"), eq(stories.proId, asPage.id))
          : asPage.kind === "provider"
            ? and(eq(stories.persona, "provider"), eq(stories.providerId, asPage.id))
            : and(eq(stories.persona, "media"), eq(stories.mediaId, asPage.id));
    const mineRows = await selectStories(and(liveStory(at), mineWhere, asPage ? notMaskedCopy(at) : undefined));
    const mine = mineRows.length
      ? {
          count: mineRows.length,
          hasUnseen: false as const,
          latestAt: newest(mineRows).story.createdAt.toISOString(),
          ring: storyRing({ live: false }, ringStories(mineRows), at) ?? ("followers" as const),
        }
      : null;
    return { mine, authors };
  },

  /** Résumé pour un profil, une structure ou un pro, selon le regard : zéro si rien n'est visible (sans rien révéler). */
  async summary(v: Viewer, kind: StoryAuthorKind, id: string): Promise<StoriesSummary> {
    const at = now();
    const where =
      kind === "user"
        ? and(personal, eq(stories.authorId, id))
        : kind === "structure"
          ? and(eq(stories.persona, "organizer"), eq(stories.structureId, id))
          : kind === "pro"
            ? and(eq(stories.persona, "pro"), eq(stories.proId, id))
            : kind === "provider"
              ? and(eq(stories.persona, "provider"), eq(stories.providerId, id))
              : and(eq(stories.persona, "media"), eq(stories.mediaId, id));
    // Invariant : une story de crew ne se montre « ni sur le profil » ; l'anneau de crew vit dans la barre du Fil.
    const rows = await selectStories(and(liveStory(at), where, sql`${stories.audience} <> 'crew'`));
    if (!rows.length) return { count: 0, hasUnseen: false, ring: null };
    const sets = await setsFor(v.user.id, rows);
    const viewer = viewerOf(v);
    const visible = rows.filter((r) => storyDenial(viewer, audienceStoryOf(r, at), relationOf(sets, r)) === null);
    if (!visible.length) return { count: 0, hasUnseen: false, ring: null };
    const seen = await seenSet(v.user.id, at);
    const self = kind === "user" && id === v.user.id;
    return {
      count: visible.length,
      hasUnseen: self ? false : visible.some((r) => !seen.has(r.story.id)),
      ring: storyRing({ live: kind === "structure" && (await liveStructureIds(at)).has(id) }, ringStories(visible), at),
    };
  },
};
