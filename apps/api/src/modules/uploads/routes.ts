import { uploadPurposeSchema } from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { parse } from "../../lib/validate";
import { uploadsService } from "./service";

export const uploadsRoutes = new Hono<AppEnv>()
  // `POST /me/uploads` (multipart : `purpose`, `file`) → `{key, width, height}`.
  .post("/me/uploads", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    const purpose = parse(uploadPurposeSchema, form.purpose);
    const file = form.file;
    if (!(file instanceof File)) throw validation("Champ « file » attendu (fichier)");
    return c.json(await uploadsService.upload(v, purpose, file), 201);
  });
