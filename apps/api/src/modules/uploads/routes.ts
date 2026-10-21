import { type PlateRect, plateRectsSchema, uploadPurposeSchema } from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { parse, uuidParam } from "../../lib/validate";
import { uploadsService } from "./service";

export const uploadsRoutes = new Hono<AppEnv>()
  // `POST /me/uploads` (multipart : `purpose`, `file`, et `plateRects` facultatif) → `{id, key, width, height}`.
  .post("/me/uploads", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    const purpose = parse(uploadPurposeSchema, form.purpose);
    const file = form.file;
    if (!(file instanceof File)) throw validation("Champ « file » attendu (fichier)");
    // Lot 57 (D28, Damien le 21/10) : photo d'un contenu média, plaques floutées avant le stockage si le média le
    // demande (rectangles JSON posés à la main, outils du lot 51) ; facultatif, irréversible.
    let plateRects: PlateRect[] | undefined;
    if (typeof form.plateRects === "string" && form.plateRects.trim()) {
      if (purpose !== "media_content") throw validation("Floutage de plaque : photos de contenu média seulement");
      let raw: unknown;
      try {
        raw = JSON.parse(form.plateRects);
      } catch {
        throw validation("Champ « plateRects » : JSON attendu");
      }
      plateRects = parse(plateRectsSchema, raw);
    }
    return c.json(await uploadsService.upload(v, purpose, file, plateRects), 201);
  })
  .delete("/me/uploads/:id", async (c) => {
    await uploadsService.remove(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  });
