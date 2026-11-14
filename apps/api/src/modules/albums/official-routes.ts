// Les trois routes de R9g : l'album « officiel » (`PUT|DELETE`) et la reprise d'une photo dans le journal (`POST … /repost`). L'organisateur
// de l'événement seulement (la structure, second facteur) ; les droits sont vérifiés avant de lire l'album.
import { albumRepostSchema } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { parse, uuidParam } from "../../lib/validate";
import { setAlbumOfficialView } from "./official";
import { albumRepost } from "./repost";

export const albumOfficialRoutes = new Hono<AppEnv>()
  .put("/events/:id/albums/:albumId/official", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await setAlbumOfficialView(v, uuidParam(c, "id"), uuidParam(c, "albumId"), true));
  })
  .delete("/events/:id/albums/:albumId/official", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await setAlbumOfficialView(v, uuidParam(c, "id"), uuidParam(c, "albumId"), false));
  })
  .post("/events/:id/albums/:albumId/photos/:photoId/repost", async (c) => {
    const v = await requireUser(c);
    // La légende est facultative : un corps vide est permis.
    const raw: unknown = await c.req.json().catch(() => ({}));
    const input = parse(albumRepostSchema, raw && typeof raw === "object" ? raw : {});
    const post = await albumRepost.repost(
      v,
      { eventId: uuidParam(c, "id"), albumId: uuidParam(c, "albumId"), photoId: uuidParam(c, "photoId") },
      input,
    );
    c.header("cache-control", "private, no-store");
    return c.json(post, 201);
  });
