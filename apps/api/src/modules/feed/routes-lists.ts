// Routes des listes de publications (vague R8, lot R8a2) : par auteur, journal d'un événement, mentions, épingle, « Masquer
// de la fiche », photos publiques. Montées **avant** `feedRoutes` : `GET /feed-posts/:id` est complétée du champ `manage`.
// Sans session (T4) : seulement le journal d'un événement et la liste d'une structure ; toute autre clé → 401.
import {
  authorMentionsQuery,
  authorPostsQuery,
  eventJournalQuery,
  eventMentionsQuery,
  type FeedPostWithManage,
} from "@orasso/shared";
import { Hono } from "hono";

import { now } from "../../lib/deps";
import { unauthenticated } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { visitorOf } from "../../lib/search-limit";
import { type AppEnv, optionalUser, requireUser } from "../../lib/session";
import { query, uuidParam } from "../../lib/validate";
import { listAuthorPosts, listJournal, requireAuthorKey } from "./lists";
import { listAuthorMentions, listEventMentions, postManage, setMentionHidden } from "./mentions";
import { setPinned } from "./pin";
import { publicJournal, publicPhoto, publicStructurePosts } from "./public";
import { feedPostsService } from "./publish";

/** Limite de débit : par personne connectée, par adresse pour un visiteur (les listes publiques ne sont pas gratuites). */
const limit = (c: Parameters<typeof visitorOf>[0], userId: string | null) =>
  userId ? rateLimit("feedRead", userId) : rateLimit("lineupPublic", visitorOf(c));

export const feedListRoutes = new Hono<AppEnv>()
  // La publication seule, avec ce que le lecteur peut en faire (`manage`, pour l'affichage). Forme existante inchangée.
  .get("/feed-posts/:id", async (c) => {
    const v = await requireUser(c);
    const post = await feedPostsService.get(v, uuidParam(c, "id"));
    const out: FeedPostWithManage = { ...post, manage: await postManage(v, post) };
    return c.json(out);
  })
  .get("/authors/:key/feed-posts", async (c) => {
    const viewer = await optionalUser(c);
    limit(c, viewer?.user.id ?? null);
    const key = requireAuthorKey(c.req.param("key"));
    const q = query(c, authorPostsQuery);
    c.header("cache-control", "private, no-cache");
    if (!viewer) {
      // Sans session : seulement les publications de l'organisateur d'une structure ; tout le reste exige une session.
      if (key.kind !== "structure") throw unauthenticated();
      return c.json(await publicStructurePosts(key, q, now()));
    }
    return c.json(await listAuthorPosts(viewer, key, q, now()));
  })
  .get("/authors/:key/mentions", async (c) => {
    const v = await requireUser(c);
    rateLimit("feedRead", v.user.id);
    c.header("cache-control", "private, no-store");
    return c.json(
      await listAuthorMentions(v, requireAuthorKey(c.req.param("key")), query(c, authorMentionsQuery), now()),
    );
  })
  .get("/events/:id/feed-posts", async (c) => {
    const viewer = await optionalUser(c);
    limit(c, viewer?.user.id ?? null);
    const id = uuidParam(c, "id");
    const { cursor } = query(c, eventJournalQuery);
    c.header("cache-control", "private, no-cache");
    return c.json(viewer ? await listJournal(viewer, id, cursor, now()) : await publicJournal(id, cursor, now()));
  })
  .get("/events/:id/mentions", async (c) => {
    const v = await requireUser(c);
    rateLimit("feedRead", v.user.id);
    c.header("cache-control", "private, no-store");
    return c.json(await listEventMentions(v, uuidParam(c, "id"), query(c, eventMentionsQuery), now()));
  })
  .put("/events/:id/feed-posts/:postId/pin", async (c) =>
    c.json(await setPinned(await requireUser(c), uuidParam(c, "id"), c.req.param("postId"), true)),
  )
  .delete("/events/:id/feed-posts/:postId/pin", async (c) =>
    c.json(await setPinned(await requireUser(c), uuidParam(c, "id"), c.req.param("postId"), false)),
  )
  .put("/mentions/:targetKey/:postId/hidden", async (c) => {
    const v = await requireUser(c);
    rateLimit("feedWrite", v.user.id);
    return c.json(await setMentionHidden(v, c.req.param("targetKey"), uuidParam(c, "postId"), true));
  })
  .delete("/mentions/:targetKey/:postId/hidden", async (c) => {
    const v = await requireUser(c);
    rateLimit("feedWrite", v.user.id);
    return c.json(await setMentionHidden(v, c.req.param("targetKey"), uuidParam(c, "postId"), false));
  });

/**
 * Photos d'une publication d'organisateur, sans session (T4) : jamais celles d'une personne, d'un pro, d'un prestataire.
 * Montée **avant** le middleware de session (`app.ts`) : aucune lecture de session, donc aucun `Set-Cookie` (cookie renouvelé)
 * dans une réponse que les caches partagés ont le droit de garder. `no-cache` + `ETag` : chaque affichage revalide (une photo
 * retirée, une page suspendue disparaissent tout de suite), les 304 restent légers.
 */
export const feedPublicPhotoRoutes = new Hono<AppEnv>().get("/public/feed-posts/:id/photos/:name", async (c) => {
  rateLimit("feedPublicPhoto", visitorOf(c));
  const photo = await publicPhoto(c.req.param("id"), c.req.param("name"), c.req.header("if-none-match"));
  const headers = { "cache-control": "public, no-cache", etag: photo.etag };
  if (photo.status === 304) return c.body(null, 304, headers);
  return c.body(new Uint8Array(photo.data), 200, { ...headers, "content-type": "image/webp" });
});
