// Lecture des stories et de leur contexte (lot R7f1) : une ligne = la story, son auteur (compte, structure ou pro) et le
// nom du crew ; les liens du regard (abonnements, crews) sont chargés en ensembles puis donnés aux règles pures de
// `@orasso/shared` (`canSeeStory`). Aucune règle de visibilité ne vit ici : seulement de quoi les appliquer.
import {
  type AudienceRelation,
  type AudienceStory,
  type AudienceViewer,
  isStoryLive,
  type StoryTagKind,
  storyAuthorKeyOf,
} from "@orasso/shared";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  crewMembers,
  crews,
  profiles,
  proFollows,
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
};

/** Stories avec leur auteur, leur structure, leur pro et leur crew. `where` à l'appelant. */
export function selectStories(where: SQL | undefined, ex: Executor = db) {
  return ex
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
    })
    .from(stories)
    .innerJoin(profiles, eq(profiles.userId, stories.authorId))
    .leftJoin(structures, eq(structures.id, stories.structureId))
    .leftJoin(proProfiles, eq(proProfiles.id, stories.proId))
    .leftJoin(crews, eq(crews.id, stories.crewId))
    .where(where) as unknown as Promise<StoryRow[]>;
}

/** Condition SQL d'une story encore vivante : prête, non supprimée, non expirée. */
export const liveStory = (at: Date = now()) =>
  and(eq(stories.status, "ready"), sql`${stories.deletedAt} is null`, sql`${stories.expiresAt} > ${at}`) as SQL;

/** Compte ni supprimé, ni banni, ni suspendu. */
export const accountActive = (p: Pick<StoryRow["author"], "deletedAt" | "bannedAt" | "suspendedUntil">, at: Date) =>
  !p.deletedAt && !p.bannedAt && !(p.suspendedUntil && p.suspendedUntil > at);

/** Auteur affiché : une structure (casquette organisateur), un pro (casquette pro) ou la personne. */
export function authorKeyOf(row: StoryRow): { kind: StoryTagKind; id: string; key: string } | null {
  const { story } = row;
  if (story.persona === "organizer") {
    return story.structureId ? { kind: "structure", id: story.structureId, key: storyAuthorKeyOf("structure", story.structureId) } : null;
  }
  if (story.persona === "pro") {
    return story.proId ? { kind: "pro", id: story.proId, key: storyAuthorKeyOf("pro", story.proId) } : null;
  }
  return { kind: "user", id: story.authorId, key: storyAuthorKeyOf("user", story.authorId) };
}

/** L'auteur est-il disponible ? Compte actif, et pour une casquette, structure ou pro non supprimé ni suspendu. */
export function authorActive(row: StoryRow, at: Date): boolean {
  if (!accountActive(row.author, at)) return false;
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
};

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
  const users = [...new Set(rows.filter((r) => r.story.persona !== "organizer" && r.story.persona !== "pro").map((r) => r.story.authorId))];
  const structureIds = [...new Set(rows.flatMap((r) => (r.story.structureId ? [r.story.structureId] : [])))];
  const proIds = [...new Set(rows.flatMap((r) => (r.story.proId ? [r.story.proId] : [])))];
  const crewIds = [...new Set(rows.flatMap((r) => (r.story.crewId ? [r.story.crewId] : [])))];
  const [u, s, p, c] = await Promise.all([
    users.length
      ? ex
          .select({ id: userFollows.followedId })
          .from(userFollows)
          .where(
            and(eq(userFollows.followerId, userId), eq(userFollows.status, "accepted"), inArray(userFollows.followedId, users)),
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
  ]);
  return {
    users: new Set(u.map((r) => r.id)),
    structures: new Set(s.map((r) => r.id)),
    pros: new Set(p.map((r) => r.id)),
    crews: new Map(c.map((r) => [r.id, r.name])),
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
  return { followAccepted, crewMemberActive: (crewId) => sets.crews.has(crewId) };
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
