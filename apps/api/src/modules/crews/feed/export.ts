// Fil d'un crew (lot R5c1) : la part de l'export des données personnelles (RGPD). Tes publications (texte, adresses
// protégées de tes photos), tes commentaires, tes voix. Jamais ce qu'ont écrit les autres ni qui a voté quoi.
import { asc, eq, inArray } from "drizzle-orm";

import { db } from "../../../db/client";
import {
  crewPollOptions,
  crewPolls,
  crewPollVotes,
  crewPostComments,
  crewPostPhotos,
  crewPosts,
  crews,
} from "../../../db/schema";
import { crewPhotoUrl } from "./posts";

export type CrewFeedExport = {
  posts: {
    crew: string;
    kind: string;
    text: string | null;
    photos: string[];
    poll: { question: string; options: string[] } | null;
    createdAt: string;
    removedAt: string | null;
  }[];
  comments: { crew: string; text: string; createdAt: string; removedAt: string | null }[];
  votes: { crew: string; question: string; answer: string; at: string }[];
};

export async function crewFeedExport(userId: string): Promise<CrewFeedExport> {
  const posts = await db
    .select({ p: crewPosts, crew: crews.name })
    .from(crewPosts)
    .innerJoin(crews, eq(crews.id, crewPosts.crewId))
    .where(eq(crewPosts.authorId, userId))
    .orderBy(asc(crewPosts.createdAt));
  const ids = posts.map((r) => r.p.id);
  const photos = ids.length
    ? await db
        .select()
        .from(crewPostPhotos)
        .where(inArray(crewPostPhotos.postId, ids))
        .orderBy(asc(crewPostPhotos.position))
    : [];
  const polls = ids.length ? await db.select().from(crewPolls).where(inArray(crewPolls.postId, ids)) : [];
  const options = ids.length
    ? await db
        .select()
        .from(crewPollOptions)
        .where(inArray(crewPollOptions.postId, ids))
        .orderBy(asc(crewPollOptions.position))
    : [];
  const comments = await db
    .select({ c: crewPostComments, crew: crews.name })
    .from(crewPostComments)
    .innerJoin(crewPosts, eq(crewPosts.id, crewPostComments.postId))
    .innerJoin(crews, eq(crews.id, crewPosts.crewId))
    .where(eq(crewPostComments.authorId, userId))
    .orderBy(asc(crewPostComments.createdAt));
  const votes = await db
    .select({ v: crewPollVotes, question: crewPolls.question, answer: crewPollOptions.label, crew: crews.name })
    .from(crewPollVotes)
    .innerJoin(crewPolls, eq(crewPolls.postId, crewPollVotes.postId))
    .innerJoin(crewPollOptions, eq(crewPollOptions.id, crewPollVotes.optionId))
    .innerJoin(crewPosts, eq(crewPosts.id, crewPollVotes.postId))
    .innerJoin(crews, eq(crews.id, crewPosts.crewId))
    .where(eq(crewPollVotes.userId, userId))
    .orderBy(asc(crewPollVotes.updatedAt));
  return {
    posts: posts.map(({ p, crew }) => {
      const poll = polls.find((x) => x.postId === p.id);
      return {
        crew,
        kind: p.kind,
        text: p.text,
        photos: photos.filter((x) => x.postId === p.id).map((x) => crewPhotoUrl(p.crewId, x.storageKey)),
        poll: poll
          ? { question: poll.question, options: options.filter((o) => o.postId === p.id).map((o) => o.label) }
          : null,
        createdAt: p.createdAt.toISOString(),
        removedAt: p.deletedAt?.toISOString() ?? null,
      };
    }),
    comments: comments.map(({ c, crew }) => ({
      crew,
      text: c.text,
      createdAt: c.createdAt.toISOString(),
      removedAt: c.deletedAt?.toISOString() ?? null,
    })),
    votes: votes.map(({ v, question, answer, crew }) => ({ crew, question, answer, at: v.updatedAt.toISOString() })),
  };
}
