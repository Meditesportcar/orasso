// Outils des tests du Fil de la vague R8 (lot R8c1) : personnes, publications de passionnés et de pages insérées en base,
// flammes datées, lecture du Fil et envoi des cartes vues. Pas de test ici.
import { randomBytes, randomUUID } from "node:crypto";
import type { FeedCard } from "@orasso/shared";
import { eq } from "drizzle-orm";

import { call, signUp, type TestUser } from "../../../test/helpers";
import { db } from "../../db/client";
import { feedPostPhotos, feedPostReactions, feedPosts, profiles, userFollows } from "../../db/schema";
import { feedPhotoKey } from "./posts";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const POSTER = "events/poster-r8c1.webp";

export async function person(pseudo: string, opts: { visibility?: "public" | "private"; departments?: string[] } = {}) {
  const u = await signUp(pseudo);
  await db
    .update(profiles)
    .set({ visibility: opts.visibility ?? "public", departments: opts.departments ?? ["66"] })
    .where(eq(profiles.userId, u.id));
  return u;
}

export const follow = (a: TestUser, b: TestUser, status: "accepted" | "pending" = "accepted") =>
  db
    .insert(userFollows)
    .values({ followerId: a.id, followedId: b.id, status, acceptedAt: status === "accepted" ? new Date() : null });

/**
 * Une publication insérée directement. Par défaut : passionné, une photo, département 66. `photos: []` : sans photo (il lui
 * faut alors un événement avec affiche pour avoir un visuel).
 */
export async function dbPost(
  author: TestUser,
  createdAt: Date,
  over: Partial<typeof feedPosts.$inferInsert> & { photos?: number } = {},
) {
  const { photos = 1, ...rest } = over;
  const id = randomUUID();
  await db.insert(feedPosts).values({ id, authorId: author.id, department: "66", createdAt, ...rest });
  for (let position = 0; position < photos; position++) {
    await db.insert(feedPostPhotos).values({
      postId: id,
      storageKey: feedPhotoKey(id, randomBytes(16).toString("hex")),
      width: 1080,
      height: 1350,
      position,
      plateBlurred: false,
      noPlateConfirmed: true,
    });
  }
  return id;
}

/** Des flammes de ces comptes, datées de `at`. */
export async function flames(postId: string, users: readonly TestUser[], at: Date) {
  await db.insert(feedPostReactions).values(users.map((u) => ({ postId, userId: u.id, createdAt: at })));
}

export async function fil(u: TestUser | null, query = "") {
  const res = await call(u, "GET", `/fil${query}`);
  return {
    ...res,
    items: (res.json?.items ?? []) as FeedCard[],
    hot: (res.json?.hot ?? null) as FeedCard<"feed_post">[] | null,
    next: (res.json?.nextCursor ?? null) as string | null,
  };
}

export const ids = (items: readonly FeedCard[]) => items.map((c) => c.id);
export const postId = (c: FeedCard) => (c.kind === "feed_post" ? (c.payload as { post: { id: string } }).post.id : "");
export const postIds = (items: readonly FeedCard[]) => items.filter((c) => c.kind === "feed_post").map(postId);

/** `POST /me/fil/seen`. */
export const seen = (u: TestUser, cards: { id: string; action: "view" | "open" | "share"; at?: string }[]) =>
  call(u, "POST", "/me/fil/seen", { cards });

/** Marque ces publications comme vues (sans interaction), par envois de 50 ; rend la dernière réponse. */
export async function view(u: TestUser, postIds_: readonly string[], at?: Date) {
  let last: Awaited<ReturnType<typeof seen>> | undefined;
  for (let i = 0; i < postIds_.length; i += 50) {
    last = await seen(
      u,
      postIds_.slice(i, i + 50).map((p) => ({
        id: `feed_post:${p}`,
        action: "view" as const,
        ...(at ? { at: at.toISOString() } : {}),
      })),
    );
  }
  return last as Awaited<ReturnType<typeof seen>>;
}

/** Parcourt tout un onglet : les pages dans l'ordre (jamais de page vide avec une suite). */
export async function walk(viewer: TestUser, filter: string, between?: (page: number) => Promise<void>) {
  const pages: FeedCard[][] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 60; guard++) {
    const q: string = [`filter=${filter}`, cursor && `cursor=${encodeURIComponent(cursor)}`].filter(Boolean).join("&");
    const res: Awaited<ReturnType<typeof fil>> = await fil(viewer, `?${q}`);
    if (res.status !== 200) throw new Error(`GET /fil ${res.status} ${res.text}`);
    if (res.next && res.items.length === 0) throw new Error("page vide avec une suite");
    pages.push(res.items);
    cursor = res.next;
    if (!cursor) break;
    await between?.(pages.length);
  }
  return pages;
}
