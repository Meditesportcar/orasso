// Outils des tests des commentaires du Fil (lot R8k1) : comptes, abonnements, publications insérées, appels.
import { randomBytes, randomUUID } from "node:crypto";
import type { FeedCommentPage, FeedCommentView } from "@orasso/shared";
import { eq } from "drizzle-orm";

import { call, signUp, type TestUser } from "../../../../test/helpers";
import { db } from "../../../db/client";
import { feedPostPhotos, feedPosts, profiles, userFollows } from "../../../db/schema";
import { feedPhotoKey } from "../posts";

export type { TestUser };

export async function person(pseudo: string, opts: { visibility?: "public" | "private"; twoFactor?: boolean } = {}) {
  const u = await signUp(pseudo, opts.twoFactor ? { twoFactor: true } : {});
  await db
    .update(profiles)
    .set({ visibility: opts.visibility ?? "public", departments: ["66"] })
    .where(eq(profiles.userId, u.id));
  return u;
}

export const follow = (a: TestUser, b: TestUser, status: "accepted" | "pending" = "accepted") =>
  db
    .insert(userFollows)
    .values({ followerId: a.id, followedId: b.id, status, acceptedAt: status === "accepted" ? new Date() : null });

/** Une publication insérée directement (une photo sans plaque, comme le Fil des tests). */
export async function dbPost(author: TestUser, over: Partial<typeof feedPosts.$inferInsert> = {}) {
  const id = randomUUID();
  await db.insert(feedPosts).values({ id, authorId: author.id, department: "66", ...over });
  await db.insert(feedPostPhotos).values({
    postId: id,
    storageKey: feedPhotoKey(id, randomBytes(16).toString("hex")),
    width: 1080,
    height: 1350,
    position: 0,
    plateBlurred: false,
    noPlateConfirmed: true,
  });
  return id;
}

export const comment = (
  u: TestUser | null,
  postId: string,
  text: string,
  extra: { parentId?: string; clientId?: string } = {},
) => call(u, "POST", `/feed-posts/${postId}/comments`, { text, clientId: extra.clientId ?? randomUUID(), ...extra });

export const listComments = async (u: TestUser | null, postId: string, cursor?: string) => {
  const res = await call(u, "GET", `/feed-posts/${postId}/comments${cursor ? `?cursor=${cursor}` : ""}`);
  return { ...res, page: res.json as FeedCommentPage, items: (res.json?.items ?? []) as FeedCommentView[] };
};

export const listReplies = async (u: TestUser | null, commentId: string, cursor?: string) => {
  const res = await call(u, "GET", `/feed-comments/${commentId}/replies${cursor ? `?cursor=${cursor}` : ""}`);
  return {
    ...res,
    items: (res.json?.items ?? []) as FeedCommentView[],
    next: (res.json?.nextCursor ?? null) as string | null,
  };
};

/** Les textes des commentaires d'une liste, dans l'ordre. */
export const texts = (items: FeedCommentView[]) => items.map((i) => i.text);

/** Les champs exacts d'un `FeedCommentView` (liste blanche) : jamais un identifiant de compte. */
export const COMMENT_VIEW_KEYS = [
  "author",
  "canDelete",
  "createdAt",
  "id",
  "mentions",
  "mine",
  "reactedByMe",
  "reactionsCount",
  "repliesCount",
  "text",
];
export const AUTHOR_VIEW_KEYS = ["avatarUrl", "grade", "key", "kind", "name", "official", "pseudo", "verified"];
