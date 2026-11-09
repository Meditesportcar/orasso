// Routes des stories (lot R7f1, ARCHITECTURE-R7 § 2.5). Session requise partout : aucune story n'est servie sans
// session (vie privée des identifiés). Les fichiers passent par une route qui contrôle l'audience à chaque lecture.

import {
  parseStoryAuthorKey,
  storyCreateSchema,
  storyReplySchema,
  storyReportSchema,
  storyTagRemoveSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { notFound, validation } from "../../lib/errors";
import { rangedFile } from "../../lib/ranged";
import { type AppEnv, requireUser } from "../../lib/session";
import { storage } from "../../lib/storage";
import { body, parse, uuidParam } from "../../lib/validate";
import { storiesAccess } from "./access";
import { storiesBar } from "./bar";
import { storiesService } from "./service";

const fileHeaders = (type: string) => ({
  "content-type": type,
  // Tour 2 : jamais gardé par le navigateur (changement de compte sur l'appareil, suppression, expiration, sortie du
  // crew : chaque lecture repasse par le contrôle d'audience).
  "cache-control": "private, no-store",
});

const FILE_NAME = /^[0-9a-f]{16}\.(webp|mp4)$/;

export const storiesRoutes = new Hono<AppEnv>()
  .post("/me/stories", async (c) => {
    const v = await requireUser(c);
    return c.json(await storiesService.create(v, await body(c, storyCreateSchema)), 201);
  })
  .get("/me/stories", async (c) => c.json(await storiesAccess.mine(await requireUser(c))))
  .delete("/me/stories/:id", async (c) => {
    await storiesService.remove(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .get("/me/stories/:id/viewers", async (c) =>
    c.json(await storiesService.viewers(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/stories/bar", async (c) => c.json(await storiesBar.get(await requireUser(c))))
  .get("/stories/by-author/:key", async (c) =>
    c.json(await storiesAccess.byAuthor(await requireUser(c), c.req.param("key"))),
  )
  .get("/stories/:id/media/:name", async (c) => {
    const v = await requireUser(c);
    const name = c.req.param("name");
    if (!FILE_NAME.test(name)) throw notFound("Fichier introuvable");
    const ref = await storiesAccess.fileRef(v, uuidParam(c, "id"), name, "media");
    if (ref.type !== "video/mp4") {
      const data = await storage.get(ref.key);
      if (!data) throw notFound("Fichier introuvable");
      return c.body(new Uint8Array(data), 200, fileHeaders(ref.type));
    }
    // Lot R7g : une vidéo se sert par morceaux (`Range`), avec les mêmes droits que la photo (déjà contrôlés ci-dessus).
    return rangedFile(c, ref.key, ref.size, fileHeaders(ref.type));
  })
  .get("/stories/:id/poster/:name", async (c) => {
    const v = await requireUser(c);
    const name = c.req.param("name");
    if (!FILE_NAME.test(name)) throw notFound("Fichier introuvable");
    const f = await storiesAccess.file(v, uuidParam(c, "id"), name, "poster");
    return c.body(new Uint8Array(f.data), 200, fileHeaders(f.type));
  })
  .get("/stories/:id/thumb", async (c) => {
    const data = await storiesAccess.thumb(await requireUser(c), uuidParam(c, "id"));
    return c.body(new Uint8Array(data), 200, fileHeaders("image/webp"));
  })
  .post("/stories/:id/view", async (c) => {
    await storiesService.view(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .put("/stories/:id/reaction", async (c) =>
    c.json(await storiesService.react(await requireUser(c), uuidParam(c, "id"), true)),
  )
  .delete("/stories/:id/reaction", async (c) =>
    c.json(await storiesService.react(await requireUser(c), uuidParam(c, "id"), false)),
  )
  .post("/stories/:id/reply", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, storyReplySchema);
    return c.json(await storiesService.reply(v, uuidParam(c, "id"), input), 201);
  })
  .post("/stories/:id/report", async (c) => {
    const v = await requireUser(c);
    return c.json(await storiesService.report(v, uuidParam(c, "id"), await body(c, storyReportSchema)), 201);
  })
  .put("/me/story-mutes/:authorKey", async (c) => {
    const key = parseStoryAuthorKey(c.req.param("authorKey"));
    if (!key) throw notFound("Auteur introuvable");
    await storiesService.mute(await requireUser(c), key, true);
    return c.body(null, 204);
  })
  .delete("/me/story-mutes/:authorKey", async (c) => {
    const key = parseStoryAuthorKey(c.req.param("authorKey"));
    if (!key) throw notFound("Auteur introuvable");
    await storiesService.mute(await requireUser(c), key, false);
    return c.body(null, 204);
  })
  .post("/me/story-tags/:storyId/remove", async (c) => {
    const v = await requireUser(c);
    const raw = await c.req.text();
    let json: unknown;
    try {
      json = raw.trim() ? JSON.parse(raw) : undefined;
    } catch {
      throw validation("JSON attendu");
    }
    const target = parse(storyTagRemoveSchema, json);
    await storiesService.removeTag(v, uuidParam(c, "storyId"), target);
    return c.body(null, 204);
  });
