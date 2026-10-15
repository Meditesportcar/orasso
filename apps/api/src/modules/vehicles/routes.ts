import { photoOrderSchema, vehicleCreateSchema, vehicleUpdateSchema } from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, uuidParam } from "../../lib/validate";
import { vehiclesRepo } from "./repo";
import { vehiclesService } from "./service";

const CACHE_1H = { "cache-control": "private, max-age=3600" };

export const vehiclesRoutes = new Hono<AppEnv>()
  // Référentiel (enrichi par l'équipe Orasso seulement).
  .get("/vehicle-reference/makes", async (c) => {
    await requireUser(c);
    return c.json(await vehiclesRepo.makes(), 200, CACHE_1H);
  })
  .get("/vehicle-reference/makes/:id/models", async (c) => {
    await requireUser(c);
    return c.json(await vehiclesRepo.models(uuidParam(c, "id")), 200, CACHE_1H);
  })
  .get("/vehicle-reference/models/:id/generations", async (c) => {
    await requireUser(c);
    return c.json(await vehiclesRepo.generations(uuidParam(c, "id")), 200, CACHE_1H);
  })
  .get("/vehicle-reference/categories", async (c) => {
    await requireUser(c);
    const rows = await vehiclesRepo.categories();
    return c.json(
      rows.map((r) => ({ id: r.id, slug: r.slug, label: r.label, minVehicleAge: r.minVehicleAge })),
      200,
      CACHE_1H,
    );
  })
  // Garage.
  .get("/me/vehicles", async (c) => c.json(await vehiclesService.listMine(await requireUser(c))))
  .post("/me/vehicles", async (c) => {
    const v = await requireUser(c);
    return c.json(await vehiclesService.create(v, await body(c, vehicleCreateSchema)), 201);
  })
  .get("/me/vehicles/:id", async (c) => c.json(await vehiclesService.getMine(await requireUser(c), uuidParam(c, "id"))))
  .patch("/me/vehicles/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await vehiclesService.update(v, uuidParam(c, "id"), await body(c, vehicleUpdateSchema)));
  })
  .delete("/me/vehicles/:id", async (c) => {
    await vehiclesService.remove(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .post("/me/vehicles/:id/photos", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    if (!(form.photo instanceof File)) throw validation("Champ « photo » attendu (fichier)");
    return c.json(await vehiclesService.addPhoto(v, uuidParam(c, "id"), form.photo), 201);
  })
  .put("/me/vehicles/:id/photos/order", async (c) => {
    const v = await requireUser(c);
    const { photoIds } = await body(c, photoOrderSchema);
    return c.json(await vehiclesService.reorderPhotos(v, uuidParam(c, "id"), photoIds));
  })
  .delete("/me/vehicles/:id/photos/:photoId", async (c) => {
    const v = await requireUser(c);
    return c.json(await vehiclesService.removePhoto(v, uuidParam(c, "id"), uuidParam(c, "photoId")));
  })
  // Fiche d'un autre utilisateur (connecté) : jamais de plaque.
  .get("/vehicles/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await vehiclesService.getOther(v, uuidParam(c, "id")));
  });
