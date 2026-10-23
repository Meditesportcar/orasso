import { deviceRegisterSchema, deviceUnregisterSchema, profileUpdateSchema, pseudoSchema } from "@orasso/shared";
import { Hono } from "hono";
import sharp from "sharp";

import { AppError, validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, uuidParam } from "../../lib/validate";
import { MAX_PHOTO_BYTES } from "../vehicles/service";
import { profilesRepo } from "./repo";
import { profilesService } from "./service";

export const profilesRoutes = new Hono<AppEnv>()
  // Public (formulaire d'inscription du site) : le pseudo est-il valide et libre ? Rien d'autre n'est révélé.
  .get("/pseudo-available", async (c) => {
    const pseudo = pseudoSchema.safeParse(c.req.query("pseudo") ?? "");
    if (!pseudo.success) return c.json({ valid: false, available: false });
    return c.json({ valid: true, available: !(await profilesRepo.pseudoTaken(pseudo.data)) });
  })
  .get("/me", async (c) => c.json(await profilesService.me(await requireUser(c))))
  .patch("/me/profile", async (c) => {
    const v = await requireUser(c);
    const profile = await profilesService.update(v, await body(c, profileUpdateSchema));
    return c.json(await profilesService.me({ ...v, profile }));
  })
  .post("/me/avatar", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    const file = form.avatar;
    if (!(file instanceof File)) throw validation("Champ « avatar » attendu (fichier)");
    if (file.size > MAX_PHOTO_BYTES) throw new AppError(413, "payload_too_large", "Image trop lourde");
    let image: Buffer;
    try {
      image = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize(512, 512, { fit: "cover" })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw new AppError(415, "unsupported_media_type", "Image illisible");
    }
    return c.json({ avatarUrl: await profilesService.setAvatar(v, image) });
  })
  .get("/me/devices", async (c) => c.json(await profilesService.listDevices(await requireUser(c))))
  .post("/me/devices", async (c) => {
    const v = await requireUser(c);
    return c.json(await profilesService.registerDevice(v, await body(c, deviceRegisterSchema)), 201);
  })
  .post("/me/devices/unregister", async (c) => {
    await profilesService.unregisterDevice(await requireUser(c), await body(c, deviceUnregisterSchema));
    return c.body(null, 204);
  })
  .delete("/me/devices/:id", async (c) => {
    await profilesService.revokeDevice(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  });
