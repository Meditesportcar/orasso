// Routes des identifications sur les photos d'album et de « Tes photos » (lot R9f). Toutes exigent une session : **sans session,
// aucune identification n'est servie** (ni pseudo, ni nombre). Les droits sont ceux de la personne (média auteur, organisateur avec
// second facteur, intéressé), jamais l'en-tête acteur. Aucune de ces routes n'est une publication du Fil.
import {
  albumTagCreateSchema,
  albumTagRemoveSchema,
  myAlbumTagsQuerySchema,
  shareToStorySchema,
  taggableQuerySchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, parse, query, uuidParam } from "../../lib/validate";
import { albumDownload } from "./download";
import { myPhotosService } from "./my-photos";
import { shareToStory } from "./share-to-story";
import { taggableService } from "./taggable";
import { albumTagsService } from "./tags";

export const albumTagsRoutes = new Hono<AppEnv>()
  // Le plateau à choisir et la recherche par pseudo (≥ 2 caractères) : le média, l'organisateur, ou l'intéressé pour lui-même.
  .get("/albums/:id/taggable", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await taggableService.list(v, uuidParam(c, "id"), query(c, taggableQuerySchema)));
  })
  .post("/album-photos/:id/tags", async (c) => {
    const v = await requireUser(c);
    const { tag, created } = await albumTagsService.pose(v, uuidParam(c, "id"), await body(c, albumTagCreateSchema));
    return c.json(tag, created ? 201 : 200);
  })
  .delete("/album-photos/:id/tags/:tagId", async (c) => {
    const v = await requireUser(c);
    await albumTagsService.removeByTagger(v, uuidParam(c, "id"), uuidParam(c, "tagId"));
    return c.body(null, 204);
  })
  // « Ce n'est pas ma voiture » / « Retirer mon identification » : le même geste, le motif vient de qui avait posé l'identification.
  .delete("/me/album-tags/:id", async (c) => {
    const v = await requireUser(c);
    const raw: unknown = await c.req.json().catch(() => ({}));
    await albumTagsService.removeByInterested(v, uuidParam(c, "id"), parse(albumTagRemoveSchema, raw ?? {}));
    return c.body(null, 204);
  })
  .get("/me/albums/:id/my-photos", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await myPhotosService.album(v, uuidParam(c, "id")));
  })
  .get("/me/album-tags", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await myPhotosService.mine(v, query(c, myAlbumTagsQuerySchema)));
  })
  .post("/album-photos/:id/share-to-story", async (c) => {
    const v = await requireUser(c);
    const raw: unknown = await c.req.json().catch(() => ({}));
    const done = await shareToStory(v, uuidParam(c, "id"), parse(shareToStorySchema, raw ?? {}));
    // `replayed` + `audience` : une story déjà en ligne est rendue telle quelle (ni public ni légende ne la modifient), l'écran le dit.
    return c.json(
      { id: done.id, expiresAt: done.expiresAt, replayed: done.replayed, audience: done.audience },
      done.replayed ? 200 : 201,
    );
  })
  .get("/album-photos/:id/download", async (c) => {
    const v = await requireUser(c);
    const file = await albumDownload.photo(v, uuidParam(c, "id"));
    return c.body(new Uint8Array(file.data), 200, {
      "content-type": file.type,
      "content-disposition": `attachment; filename="${file.name}"`,
      "cache-control": "private, no-store",
    });
  });
