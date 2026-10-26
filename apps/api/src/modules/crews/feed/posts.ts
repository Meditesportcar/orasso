// Fil d'un crew (lot R5c1) : lecture des publications pour un membre (liste blanche des champs de `CrewPostView`).
// Les photos ont une adresse protégée par l'appartenance au crew (`/api/crews/:id/photos/:nom`), jamais `/api/files`.
import {
  type CrewFeedPerson,
  type CrewPollView,
  type CrewPostView,
  canRemoveCrewContent,
  crewPollOpen,
} from "@orasso/shared";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  crewPollOptions,
  crewPolls,
  crewPollVotes,
  crewPostComments,
  crewPostPhotos,
  crewPostReactions,
  crewPosts,
  events,
  profiles,
  vehicles,
} from "../../../db/schema";
import { storage } from "../../../lib/storage";
import type { Executor } from "../../../lib/tx";
import { canSeeEvent } from "../../invitations/access";
import type { Profile } from "../../profiles/repo";
import { vehicleLabel } from "../../vehicles/serializers";
import { type FeedAccess, visibleProfile } from "./access";

export type CrewPostRow = typeof crewPosts.$inferSelect;

/** Dossier des photos du fil (clés privées, servies seulement par la route du crew). */
export const CREW_POST_FOLDER = "private/crew-posts/";

/** Adresse protégée d'une photo : `/api/crews/<crew>/photos/<uuid>.webp`. */
export const crewPhotoUrl = (crewId: string, storageKey: string) =>
  `/api/crews/${crewId}/photos/${storageKey.slice(CREW_POST_FOLDER.length)}`;

export const personOf = (p: Pick<Profile, "userId" | "pseudo" | "avatarKey" | "grade">): CrewFeedPerson => ({
  userId: p.userId,
  pseudo: p.pseudo,
  avatarUrl: storage.url(p.avatarKey),
  grade: p.grade,
});

const countMap = (rows: { id: string; n: number }[]) => new Map(rows.map((r) => [r.id, Number(r.n)]));

/**
 * Publications visibles (non retirées, auteur ni supprimé ni suspendu) parmi `ids`, dans l'ordre de `ids`, pour le
 * lecteur `access` (membre actif). Les publications absentes ou invisibles sont omises.
 */
export async function loadPostViews(
  ex: Executor,
  ids: string[],
  access: FeedAccess,
  at: Date,
): Promise<CrewPostView[]> {
  if (!ids.length) return [];
  const rows = await ex
    .select({ post: crewPosts, author: profiles })
    .from(crewPosts)
    .innerJoin(profiles, eq(profiles.userId, crewPosts.authorId))
    .where(
      and(
        inArray(crewPosts.id, ids),
        eq(crewPosts.crewId, access.crew.id),
        isNull(crewPosts.deletedAt),
        sql`${visibleProfile("profiles", at)}`,
      ),
    );
  if (!rows.length) return [];
  const postIds = rows.map((r) => r.post.id);

  const photos = await ex
    .select()
    .from(crewPostPhotos)
    .where(inArray(crewPostPhotos.postId, postIds))
    .orderBy(asc(crewPostPhotos.position));

  const fires = countMap(
    await ex
      .select({ id: crewPostReactions.postId, n: sql<number>`count(*)::int` })
      .from(crewPostReactions)
      .innerJoin(profiles, eq(profiles.userId, crewPostReactions.userId))
      .where(and(inArray(crewPostReactions.postId, postIds), sql`${visibleProfile("profiles", at)}`))
      .groupBy(crewPostReactions.postId),
  );
  const mine = new Set(
    (
      await ex
        .select({ id: crewPostReactions.postId })
        .from(crewPostReactions)
        .where(and(inArray(crewPostReactions.postId, postIds), eq(crewPostReactions.userId, access.viewerId)))
    ).map((r) => r.id),
  );
  const comments = countMap(
    await ex
      .select({ id: crewPostComments.postId, n: sql<number>`count(*)::int` })
      .from(crewPostComments)
      .innerJoin(profiles, eq(profiles.userId, crewPostComments.authorId))
      .where(
        and(
          inArray(crewPostComments.postId, postIds),
          isNull(crewPostComments.deletedAt),
          sql`${visibleProfile("profiles", at)}`,
        ),
      )
      .groupBy(crewPostComments.postId),
  );

  const vehicleIds = [...new Set(rows.map((r) => r.post.vehicleId).filter((x): x is string => Boolean(x)))];
  const vehicleRows = vehicleIds.length
    ? await ex.query.vehicles.findMany({
        where: inArray(vehicles.id, vehicleIds),
        with: { make: true, model: true, generation: true },
      })
    : [];
  const vehicleById = new Map(vehicleRows.map((v) => [v.id, v]));

  const eventIds = [...new Set(rows.map((r) => r.post.eventId).filter((x): x is string => Boolean(x)))];
  const eventRows = eventIds.length
    ? await ex
        .select({
          id: events.id,
          slug: events.slug,
          title: events.title,
          startsAt: events.startsAt,
          admission: events.admission,
          structureId: events.structureId,
        })
        .from(events)
        .where(and(inArray(events.id, eventIds), eq(events.status, "published")))
    : [];
  // Tour 2 : un événement privé (sur invitation) n'apparaît qu'à qui peut le voir (ni titre, ni date, ni adresse).
  const eventById = new Map<string, (typeof eventRows)[number]>();
  for (const e of eventRows) if (await canSeeEvent(e, access.viewer, ex)) eventById.set(e.id, e);

  const pollIds = rows.filter((r) => r.post.kind === "poll").map((r) => r.post.id);
  const polls = new Map<string, CrewPollView>();
  if (pollIds.length) {
    const pollRows = await ex.select().from(crewPolls).where(inArray(crewPolls.postId, pollIds));
    const options = await ex
      .select()
      .from(crewPollOptions)
      .where(inArray(crewPollOptions.postId, pollIds))
      .orderBy(asc(crewPollOptions.position));
    const votes = countMap(
      await ex
        .select({ id: crewPollVotes.optionId, n: sql<number>`count(*)::int` })
        .from(crewPollVotes)
        .innerJoin(profiles, eq(profiles.userId, crewPollVotes.userId))
        .where(and(inArray(crewPollVotes.postId, pollIds), sql`${visibleProfile("profiles", at)}`))
        .groupBy(crewPollVotes.optionId),
    );
    const myVotes = new Map(
      (
        await ex
          .select({ postId: crewPollVotes.postId, optionId: crewPollVotes.optionId })
          .from(crewPollVotes)
          .where(and(inArray(crewPollVotes.postId, pollIds), eq(crewPollVotes.userId, access.viewerId)))
      ).map((r) => [r.postId, r.optionId]),
    );
    for (const poll of pollRows) {
      const post = rows.find((r) => r.post.id === poll.postId)?.post;
      const opts = options
        .filter((o) => o.postId === poll.postId)
        .map((o) => ({ id: o.id, label: o.label, votes: votes.get(o.id) ?? 0 }));
      const open = crewPollOpen(poll, at);
      polls.set(poll.postId, {
        question: poll.question,
        options: opts,
        totalVotes: opts.reduce((s, o) => s + o.votes, 0),
        myOptionId: myVotes.get(poll.postId) ?? null,
        endsAt: poll.endsAt?.toISOString() ?? null,
        closedAt: poll.closedAt?.toISOString() ?? null,
        open,
        canClose:
          open && canRemoveCrewContent(post?.authorId ?? null, { userId: access.viewerId, leader: access.leader }),
      });
    }
  }

  const byId = new Map(rows.map((r) => [r.post.id, r]));
  return ids.flatMap((id): CrewPostView[] => {
    const r = byId.get(id);
    if (!r) return [];
    const { post, author } = r;
    const vehicle = post.vehicleId ? vehicleById.get(post.vehicleId) : undefined;
    const event = post.eventId ? eventById.get(post.eventId) : undefined;
    return [
      {
        id: post.id,
        crewId: post.crewId,
        kind: post.kind,
        author: personOf(author),
        createdAt: post.createdAt.toISOString(),
        text: post.text,
        photos: photos
          .filter((p) => p.postId === post.id)
          .map((p) => ({
            id: p.id,
            url: crewPhotoUrl(post.crewId, p.storageKey),
            width: p.width,
            height: p.height,
          })),
        vehicle: vehicle ? { id: vehicle.id, label: vehicleLabel(vehicle), vehicleType: vehicle.vehicleType } : null,
        event: event
          ? { id: event.id, slug: event.slug, title: event.title, startsAt: event.startsAt.toISOString() }
          : null,
        firesCount: fires.get(post.id) ?? 0,
        firedByMe: mine.has(post.id),
        commentsCount: comments.get(post.id) ?? 0,
        poll: polls.get(post.id) ?? null,
        mine: post.authorId === access.viewerId,
        canRemove: canRemoveCrewContent(post.authorId, { userId: access.viewerId, leader: access.leader }),
      },
    ];
  });
}
