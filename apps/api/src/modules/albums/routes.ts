// Routes des albums (lot R9e). Écriture : le titulaire du profil média (`/me/albums...`), accrédité à l'événement. Lecture : tout
// membre connecté ; sans session, seules les photos d'un album publié visible de tous (T34) et la façade `media-contents` (la fiche
// de l'événement, la page du média). Aucune identification n'est servie sans session (R9f).
import {
  albumCreateSchema,
  albumLabels,
  albumPatchSchema,
  albumPhotoAddSchema,
  albumsListQuery,
  albumsMineQuery,
} from "@orasso/shared";
import { type Context, Hono } from "hono";

import { now } from "../../lib/deps";
import { AppError, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { visitorOf } from "../../lib/search-limit";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, parse, query, uuidParam } from "../../lib/validate";
import { addPhoto, type PhotoFile, photoFile } from "./photos";
import { publishAlbum } from "./publish";
import { albumsService } from "./service";

const fileResponse = (c: Context<AppEnv>, photo: PhotoFile, cache: string, extra: Record<string, string> = {}) => {
  // Jamais gardée sans revalidation (une photo retirée, un média dont l'accréditation tombe) ; `ETag` : un 304 léger tant que l'accès tient.
  const headers = { "cache-control": cache, etag: photo.etag, ...extra };
  if (photo.status === 304) return c.body(null, 304, headers);
  return c.body(new Uint8Array(photo.data), 200, { ...headers, "content-type": "image/webp" });
};

export const albumsRoutes = new Hono<AppEnv>()
  // `GET /media/:id` en plus de sa fiche : `albumsCount` et `photosCount` (albums publiés). La route est celle du module média
  // (R9b y ajoute ses propres champs) : on la décore au passage, sans toucher à son fichier ni à sa forme d'avant.
  .use("/media/:id", async (c, next) => {
    await next();
    if (c.req.method !== "GET" || c.res.status !== 200) return;
    const raw = (await c.res
      .clone()
      .json()
      .catch(() => null)) as Record<string, unknown> | null;
    if (!raw || typeof raw.id !== "string") return;
    const counts = await albumsService.countsForMedia(raw.id);
    const headers = new Headers(c.res.headers);
    headers.delete("content-length");
    c.res = new Response(JSON.stringify({ ...raw, ...counts }), { status: 200, headers });
  })
  // --- Écriture (le média) ---
  .post("/me/albums", async (c) => {
    const v = await requireUser(c);
    const { album, created } = await albumsService.create(v, await body(c, albumCreateSchema));
    return c.json(album, created ? 201 : 200);
  })
  .get("/me/albums", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await albumsService.mine(v, query(c, albumsMineQuery)));
  })
  .patch("/me/albums/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await albumsService.patch(v, uuidParam(c, "id"), await body(c, albumPatchSchema)));
  })
  .delete("/me/albums/:id", async (c) => {
    await albumsService.remove(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .post("/me/albums/:id/photos", async (c) => {
    const v = await requireUser(c);
    // Une photo sans décision de plaque est refusée avant tout le reste, comme une publication du Fil.
    const raw: unknown = await c.req.json().catch(() => {
      throw validation("Corps JSON attendu");
    });
    if (raw && typeof raw === "object" && (raw as { plateDecision?: unknown }).plateDecision == null) {
      throw new AppError(400, "plate_decision_required", albumLabels.plateDecision);
    }
    const { photo, created } = await addPhoto(v, uuidParam(c, "id"), parse(albumPhotoAddSchema, raw));
    return c.json(photo, created ? 201 : 200);
  })
  .delete("/me/albums/:id/photos/:photoId", async (c) => {
    await albumsService.removePhoto(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "photoId"));
    return c.body(null, 204);
  })
  .post("/me/albums/:id/publish", async (c) => {
    const v = await requireUser(c);
    return c.json(await publishAlbum(v, uuidParam(c, "id")));
  })
  // --- Lecture (membres connectés) ---
  .get("/albums/:id", async (c) => {
    const v = await requireUser(c);
    // Selon qui regarde (le média voit ses brouillons) : jamais gardée par un cache partagé.
    c.header("cache-control", "private, no-store");
    return c.json(await albumsService.get(v, uuidParam(c, "id")));
  })
  .get("/albums/:id/photos/:name", async (c) => {
    const v = await requireUser(c);
    const photo = await photoFile(
      c.req.param("id"),
      c.req.param("name"),
      v.user.id,
      now(),
      c.req.header("if-none-match"),
      false,
    );
    return fileResponse(c, photo, "private, no-cache", { vary: "Cookie, Authorization" });
  })
  .get("/events/:id/albums", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await albumsService.forEvent(v, { id: uuidParam(c, "id") }));
  })
  .get("/events/by-slug/:slug/albums", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await albumsService.forEvent(v, { slug: c.req.param("slug") }));
  })
  .get("/media/:id/albums", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await albumsService.forMedia(v, uuidParam(c, "id"), query(c, albumsListQuery)));
  });

/**
 * Photos d'un album publié visible de tous, **sans session** (T34) : la fiche de l'événement et la page du média les montrent aux
 * visiteurs comme les galeries d'aujourd'hui. Montée **avant** le middleware de session (`app.ts`) : aucune lecture de session, donc
 * aucun `Set-Cookie` dans une réponse que les caches partagés ont le droit de garder. `public, no-cache` + `ETag` : chaque affichage
 * revalide (une photo retirée, une accréditation retirée font disparaître l'album), les 304 restent légers. Un brouillon : 404.
 */
export const albumsPublicRoutes = new Hono<AppEnv>().get("/public/albums/:id/photos/:name", async (c) => {
  rateLimit("feedPublicPhoto", visitorOf(c));
  const photo = await photoFile(
    c.req.param("id"),
    c.req.param("name"),
    null,
    now(),
    c.req.header("if-none-match"),
    true,
  );
  return fileResponse(c, photo, "public, no-cache");
});
