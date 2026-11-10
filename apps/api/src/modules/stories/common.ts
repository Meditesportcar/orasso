// Lecture des stories et de leur contexte (lot R7f1) : une ligne = la story, son auteur (compte, structure ou pro) et le
// nom du crew ; les liens du regard (abonnements, crews) sont chargés en ensembles puis donnés aux règles pures de
// `@orasso/shared` (`canSeeStory`). Aucune règle de visibilité ne vit ici : seulement de quoi les appliquer.
import {
  type AudienceRelation,
  type AudienceStory,
  type AudienceViewer,
  isStoryLive,
  type StoryTagKind,
  type StoryTagView,
  storyAuthorKeyOf,
} from "@orasso/shared";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../../db/client";
import {
  crewMembers,
  crews,
  proFollows,
  profiles,
  proProfiles,
  stories,
  structureFollows,
  structures,
  userFollows,
} from "../../db/schema";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";

export type StoryRecord = typeof stories.$inferSelect;

// L'originale d'une copie (lot R7h, tour 2) : de quoi dire si elle existe encore, si son auteur est disponible, et qui
// créditer (l'identité PUBLIQUE de l'originale selon sa casquette, jamais le compte personnel derrière une structure).
const originStory = alias(stories, "origin_story");
const originAuthor = alias(profiles, "origin_author");
const originStructure = alias(structures, "origin_structure");
const originPro = alias(proProfiles, "origin_pro");

export type StoryOrigin = {
  id: string | null;
  deletedAt: Date | null;
  status: string | null;
  persona: string | null;
  authorId: string | null;
  authorPseudo: string | null;
  authorAvatarKey: string | null;
  authorVisibility: "public" | "private" | null;
  authorDeletedAt: Date | null;
  authorBannedAt: Date | null;
  authorSuspendedUntil: Date | null;
  structureId: string | null;
  structureName: string | null;
  structureSlug: string | null;
  structureLogoKey: string | null;
  structureDeletedAt: Date | null;
  structureVerification: string | null;
  proId: string | null;
  proName: string | null;
  proSlug: string | null;
  proLogoKey: string | null;
  proDeletedAt: Date | null;
};

export type StoryRow = {
  story: StoryRecord;
  author: {
    pseudo: string;
    avatarKey: string | null;
    visibility: "public" | "private";
    deletedAt: Date | null;
    bannedAt: Date | null;
    suspendedUntil: Date | null;
  };
  structure: {
    id: string | null;
    name: string | null;
    slug: string | null;
    logoKey: string | null;
    deletedAt: Date | null;
    verification: string | null;
  };
  pro: { id: string | null; name: string | null; slug: string | null; logoKey: string | null; deletedAt: Date | null };
  crewName: string | null;
  /** Les champs de l'originale quand la story est une copie (tous `null` sinon). */
  origin: StoryOrigin;
};

/**
 * Stories avec leur auteur, leur structure, leur pro et leur crew. `where` à l'appelant. Une copie dont l'originale a disparu
 * ou dont l'auteur n'est plus disponible n'est jamais rendue, quel que soit le chemin de lecture (lot R7h, tour 2).
 */
export function selectStories(where: SQL | undefined, ex: Executor = db): Promise<StoryRow[]> {
  const query = ex
    .select({
      story: stories,
      author: {
        pseudo: profiles.pseudo,
        avatarKey: profiles.avatarKey,
        visibility: profiles.visibility,
        deletedAt: profiles.deletedAt,
        bannedAt: profiles.bannedAt,
        suspendedUntil: profiles.suspendedUntil,
      },
      structure: {
        id: structures.id,
        name: structures.name,
        slug: structures.slug,
        logoKey: structures.logoKey,
        deletedAt: structures.deletedAt,
        verification: structures.verification,
      },
      pro: {
        id: proProfiles.id,
        name: proProfiles.name,
        slug: proProfiles.slug,
        logoKey: proProfiles.logoKey,
        deletedAt: proProfiles.deletedAt,
      },
      crewName: crews.name,
      origin: {
        id: originStory.id,
        deletedAt: originStory.deletedAt,
        status: originStory.status,
        persona: originStory.persona,
        authorId: originStory.authorId,
        authorPseudo: originAuthor.pseudo,
        authorAvatarKey: originAuthor.avatarKey,
        authorVisibility: originAuthor.visibility,
        authorDeletedAt: originAuthor.deletedAt,
        authorBannedAt: originAuthor.bannedAt,
        authorSuspendedUntil: originAuthor.suspendedUntil,
        structureId: originStructure.id,
        structureName: originStructure.name,
        structureSlug: originStructure.slug,
        structureLogoKey: originStructure.logoKey,
        structureDeletedAt: originStructure.deletedAt,
        structureVerification: originStructure.verification,
        proId: originPro.id,
        proName: originPro.name,
        proSlug: originPro.slug,
        proLogoKey: originPro.logoKey,
        proDeletedAt: originPro.deletedAt,
      },
    })
    .from(stories)
    .innerJoin(profiles, eq(profiles.userId, stories.authorId))
    .leftJoin(structures, eq(structures.id, stories.structureId))
    .leftJoin(proProfiles, eq(proProfiles.id, stories.proId))
    .leftJoin(crews, eq(crews.id, stories.crewId))
    .leftJoin(originStory, eq(originStory.id, stories.sharedFromStoryId))
    .leftJoin(originAuthor, eq(originAuthor.userId, originStory.authorId))
    .leftJoin(originStructure, eq(originStructure.id, originStory.structureId))
    .leftJoin(originPro, eq(originPro.id, originStory.proId))
    .where(where) as unknown as Promise<StoryRow[]>;
  return query.then((rows) => {
    const at = now();
    return rows.filter((r) => originAvailable(r, at));
  });
}

/** Condition SQL d'une story encore vivante : prête, non supprimée, non expirée. */
export const liveStory = (at: Date = now()) =>
  and(eq(stories.status, "ready"), sql`${stories.deletedAt} is null`, sql`${stories.expiresAt} > ${at}`) as SQL;

/**
 * Lot R7h, tour 4 : condition SQL « ce n'est pas une copie masquée » (l'inverse de `originAvailable`). Une copie dont l'originale
 * n'est plus servable (supprimée, auteur suspendu, banni ou supprimé, structure ou pro indisponible, compte passé en privé)
 * ne compte pas dans le plafond de `STORY_LIVE_MAX` : elle est invisible, et à la levée d'une suspension le plafond peut être
 * dépassé pour la journée (elle revient quand même).
 */
export const notMaskedCopy = (at: Date): SQL =>
  sql`(${stories.sharedFromStoryId} is null or exists (
    select 1 from stories o join profiles op on op.user_id = o.author_id
    where o.id = ${stories.sharedFromStoryId} and o.deleted_at is null and o.status = 'ready'
      and op.deleted_at is null and op.banned_at is null and (op.suspended_until is null or op.suspended_until <= ${at})
      and case o.persona
        when 'organizer' then exists (select 1 from structures st where st.id = o.structure_id
          and st.deleted_at is null and st.verification <> 'suspended')
        when 'pro' then exists (select 1 from pro_profiles pp where pp.id = o.pro_id and pp.deleted_at is null)
        else op.visibility = 'public' end))`;

/** Compte ni supprimé, ni banni, ni suspendu. */
export const accountActive = (p: Pick<StoryRow["author"], "deletedAt" | "bannedAt" | "suspendedUntil">, at: Date) =>
  !p.deletedAt && !p.bannedAt && !(p.suspendedUntil && p.suspendedUntil > at);

/** Auteur affiché : une structure (casquette organisateur), un pro (casquette pro) ou la personne. */
export function authorKeyOf(row: StoryRow): { kind: StoryTagKind; id: string; key: string } | null {
  const { story } = row;
  if (story.persona === "organizer") {
    return story.structureId
      ? { kind: "structure", id: story.structureId, key: storyAuthorKeyOf("structure", story.structureId) }
      : null;
  }
  if (story.persona === "pro") {
    return story.proId ? { kind: "pro", id: story.proId, key: storyAuthorKeyOf("pro", story.proId) } : null;
  }
  return { kind: "user", id: story.authorId, key: storyAuthorKeyOf("user", story.authorId) };
}

/**
 * L'originale d'une copie est-elle encore servable ? Elle existe (non supprimée), son auteur est actif (ni supprimé, ni
 * banni, ni suspendu), sa structure ou sa fiche pro aussi, et un compte personnel n'est pas passé en privé (une copie ne
 * doit jamais survivre à la disparition de ce qu'elle reprend). Vrai pour une story qui n'est pas une copie.
 */
export function originAvailable(row: StoryRow, at: Date): boolean {
  if (!row.story.sharedFromStoryId) return true;
  const o = row.origin;
  if (!o || !o.id || o.deletedAt || o.status !== "ready") return false;
  if (o.authorDeletedAt || o.authorBannedAt || (o.authorSuspendedUntil && o.authorSuspendedUntil > at)) return false;
  if (o.persona === "organizer") {
    return Boolean(o.structureId && !o.structureDeletedAt && o.structureVerification !== "suspended");
  }
  if (o.persona === "pro") return Boolean(o.proId && !o.proDeletedAt);
  return o.authorVisibility === "public";
}

/** L'auteur est-il disponible ? Compte actif, et pour une casquette, structure ou pro non supprimé ni suspendu ; pour une copie, l'originale aussi. */
export function authorActive(row: StoryRow, at: Date): boolean {
  if (!accountActive(row.author, at)) return false;
  if (!originAvailable(row, at)) return false;
  const { story } = row;
  if (story.persona === "organizer") {
    return Boolean(row.structure.id && !row.structure.deletedAt && row.structure.verification !== "suspended");
  }
  if (story.persona === "pro") return Boolean(row.pro.id && !row.pro.deletedAt);
  return true;
}

export function audienceStoryOf(row: StoryRow, at: Date): AudienceStory {
  const { story } = row;
  return {
    authorId: story.authorId,
    audience: story.audience,
    crewId: story.crewId,
    // Une structure et un pro sont publics par nature ; seul un compte a un réglage public / privé.
    authorVisibility: story.persona === "organizer" || story.persona === "pro" ? "public" : row.author.visibility,
    authorActive: authorActive(row, at),
  };
}

export function viewerOf(v: Viewer): AudienceViewer {
  return { id: v.user.id, active: !v.profile.deletedAt && !v.profile.bannedAt };
}

/** Les liens du regard avec un ensemble de stories. */
export type ViewerSets = {
  users: Set<string>;
  structures: Set<string>;
  pros: Set<string>;
  crews: Map<string, string>;
  /** Les stories (parmi celles lues) où je suis identifié : moi, une structure ou un pro que je gère (lot R7h). */
  tagged?: Set<string>;
};

/**
 * Parmi ces stories, celles où le regard est identifié et où l'identification n'est pas retirée : lui-même, une structure
 * dont il est propriétaire ou co-organisateur actif, une fiche pro qui est à lui (lot R7h). Une seule requête.
 */
export async function taggedStoryIds(
  userId: string,
  storyIds: readonly string[],
  ex: Executor = db,
): Promise<Set<string>> {
  if (!storyIds.length) return new Set();
  const res = await ex.execute<{ story_id: string }>(sql`
    select distinct t.story_id from story_tags t
    where t.story_id = any(${sql.param([...storyIds])}::uuid[]) and t.removed_at is null and (
      (t.target_kind = 'user' and t.target_id = ${userId})
      or (t.target_kind = 'structure' and t.target_id in (
        select m.structure_id::text from structure_members m join structures s on s.id = m.structure_id
        where m.user_id = ${userId} and m.status = 'active' and m.role in ('owner', 'co_organizer') and s.deleted_at is null))
      or (t.target_kind = 'pro' and t.target_id in (
        select p.id::text from pro_profiles p where p.owner_user_id = ${userId} and p.deleted_at is null)))`);
  return new Set((res as unknown as { rows: { story_id: string }[] }).rows.map((r) => r.story_id));
}

/** Tous les liens du regard (barre : il faut découvrir les auteurs). */
export async function loadViewerSets(userId: string, ex: Executor = db): Promise<ViewerSets> {
  const [u, s, p, c] = await Promise.all([
    ex
      .select({ id: userFollows.followedId })
      .from(userFollows)
      .where(and(eq(userFollows.followerId, userId), eq(userFollows.status, "accepted"))),
    ex.select({ id: structureFollows.structureId }).from(structureFollows).where(eq(structureFollows.userId, userId)),
    ex.select({ id: proFollows.proId }).from(proFollows).where(eq(proFollows.userId, userId)),
    ex
      .select({ id: crewMembers.crewId, name: crews.name })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .where(and(eq(crewMembers.userId, userId), eq(crewMembers.status, "active"), sql`${crews.deletedAt} is null`)),
  ]);
  return {
    users: new Set(u.map((r) => r.id)),
    structures: new Set(s.map((r) => r.id)),
    pros: new Set(p.map((r) => r.id)),
    crews: new Map(c.map((r) => [r.id, r.name])),
  };
}

/** Les liens du regard limités aux auteurs et crews de ces stories (lecture d'une ou de quelques stories). */
export async function setsFor(userId: string, rows: readonly StoryRow[], ex: Executor = db): Promise<ViewerSets> {
  const users = [
    ...new Set(
      rows.filter((r) => r.story.persona !== "organizer" && r.story.persona !== "pro").map((r) => r.story.authorId),
    ),
  ];
  const structureIds = [...new Set(rows.flatMap((r) => (r.story.structureId ? [r.story.structureId] : [])))];
  const proIds = [...new Set(rows.flatMap((r) => (r.story.proId ? [r.story.proId] : [])))];
  const crewIds = [...new Set(rows.flatMap((r) => (r.story.crewId ? [r.story.crewId] : [])))];
  const [u, s, p, c, tagged] = await Promise.all([
    users.length
      ? ex
          .select({ id: userFollows.followedId })
          .from(userFollows)
          .where(
            and(
              eq(userFollows.followerId, userId),
              eq(userFollows.status, "accepted"),
              inArray(userFollows.followedId, users),
            ),
          )
      : [],
    structureIds.length
      ? ex
          .select({ id: structureFollows.structureId })
          .from(structureFollows)
          .where(and(eq(structureFollows.userId, userId), inArray(structureFollows.structureId, structureIds)))
      : [],
    proIds.length
      ? ex
          .select({ id: proFollows.proId })
          .from(proFollows)
          .where(and(eq(proFollows.userId, userId), inArray(proFollows.proId, proIds)))
      : [],
    crewIds.length
      ? ex
          .select({ id: crewMembers.crewId, name: crews.name })
          .from(crewMembers)
          .innerJoin(crews, eq(crews.id, crewMembers.crewId))
          .where(
            and(
              eq(crewMembers.userId, userId),
              eq(crewMembers.status, "active"),
              inArray(crewMembers.crewId, crewIds),
              sql`${crews.deletedAt} is null`,
            ),
          )
      : [],
    taggedStoryIds(
      userId,
      rows.map((r) => r.story.id),
      ex,
    ),
  ]);
  return {
    users: new Set(u.map((r) => r.id)),
    structures: new Set(s.map((r) => r.id)),
    pros: new Set(p.map((r) => r.id)),
    crews: new Map(c.map((r) => [r.id, r.name])),
    tagged,
  };
}

/** Le lien du regard avec l'auteur de cette story. */
export function relationOf(sets: ViewerSets, row: StoryRow): AudienceRelation {
  const { story } = row;
  const followAccepted =
    story.persona === "organizer" && story.structureId
      ? sets.structures.has(story.structureId)
      : story.persona === "pro" && story.proId
        ? sets.pros.has(story.proId)
        : sets.users.has(story.authorId);
  return {
    followAccepted,
    crewMemberActive: (crewId) => sets.crews.has(crewId),
    tagged: sets.tagged?.has(story.id) ?? false,
  };
}

/** Vivante à `at` (prête, non supprimée, non expirée) : même règle que la requête, pour une ligne déjà lue. */
export const rowLive = (row: StoryRow, at: Date) =>
  isStoryLive({ status: row.story.status, expiresAt: row.story.expiresAt, deletedAt: row.story.deletedAt }, at);

/** Nom et image de l'auteur affiché. */
export function authorDisplay(row: StoryRow, urlOf: (key: string | null) => string | null) {
  const { story } = row;
  if (story.persona === "organizer") return { name: row.structure.name ?? "", avatarUrl: urlOf(row.structure.logoKey) };
  if (story.persona === "pro") return { name: row.pro.name ?? "", avatarUrl: urlOf(row.pro.logoKey) };
  return { name: row.author.pseudo, avatarUrl: urlOf(row.author.avatarKey) };
}

/** Le crédit d'une copie : l'identité publique de l'originale selon sa casquette (la personne, la structure ou le pro). */
export function creditOf(row: StoryRow, urlOf: (key: string | null) => string | null): StoryTagView | null {
  if (!row.story.sharedFromStoryId) return null;
  const o = row.origin;
  if (!o?.id) return null;
  if (o.persona === "organizer") {
    return o.structureId
      ? {
          kind: "structure",
          id: o.structureId,
          name: o.structureName ?? "",
          slug: o.structureSlug,
          avatarUrl: urlOf(o.structureLogoKey),
        }
      : null;
  }
  if (o.persona === "pro") {
    return o.proId
      ? { kind: "pro", id: o.proId, name: o.proName ?? "", slug: o.proSlug, avatarUrl: urlOf(o.proLogoKey) }
      : null;
  }
  return o.authorId
    ? {
        kind: "user",
        id: o.authorId,
        name: o.authorPseudo ?? "",
        slug: o.authorPseudo,
        avatarUrl: urlOf(o.authorAvatarKey),
      }
    : null;
}
