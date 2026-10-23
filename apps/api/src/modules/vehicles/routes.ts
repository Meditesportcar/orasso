import {
  categoryReferenceQuery,
  certificationRequestSchema,
  type PlateRect,
  photoBlurSchema,
  photoOrderSchema,
  plateRectsSchema,
  shareImageQuery,
  vehicleCreateSchema,
  vehicleUpdateSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, parse, query, uuidParam } from "../../lib/validate";
import { categoryOptions } from "./categories";
import { certificationService } from "./certification";
import { photoBlurService } from "./photos-blur";
import { vehiclesRepo } from "./repo";
import { vehiclesService } from "./service";

const CACHE_1H = { "cache-control": "private, max-age=3600" };

export const vehiclesRoutes = new Hono<AppEnv>()
  // Référentiel (enrichi par l'équipe Orasso seulement). Public depuis le lot 13 : le formulaire d'inscription express
  // le lit avant que la personne ait un compte ; ce sont des listes de marques et de modèles, sans donnée personnelle.
  .get("/vehicle-reference/makes", async (c) => c.json(await vehiclesRepo.makes(), 200, CACHE_1H))
  .get("/vehicle-reference/makes/:id/models", async (c) =>
    c.json(await vehiclesRepo.models(uuidParam(c, "id")), 200, CACHE_1H),
  )
  .get("/vehicle-reference/models/:id/generations", async (c) =>
    c.json(await vehiclesRepo.generations(uuidParam(c, "id")), 200, CACHE_1H),
  )
  // Public : la page d'un événement affiche les catégories recherchées aux visiteurs sans compte.
  // Filtré par marque, type et année quand ils sont donnés (formulaire du véhicule) : chaque catégorie dit si elle est
  // éligible et pourquoi sinon (lot 31).
  .get("/vehicle-reference/categories", async (c) =>
    c.json(await categoryOptions(query(c, categoryReferenceQuery)), 200, CACHE_1H),
  )
  // Garage.
  .get("/me/vehicles", async (c) => c.json(await vehiclesService.listMine(await requireUser(c))))
  .post("/me/vehicles", async (c) => {
    const v = await requireUser(c);
    rateLimit("vehicleWrite", v.user.id);
    return c.json(await vehiclesService.create(v, await body(c, vehicleCreateSchema)), 201);
  })
  .get("/me/vehicles/:id", async (c) => c.json(await vehiclesService.getMine(await requireUser(c), uuidParam(c, "id"))))
  .patch("/me/vehicles/:id", async (c) => {
    const v = await requireUser(c);
    rateLimit("vehicleWrite", v.user.id);
    return c.json(await vehiclesService.update(v, uuidParam(c, "id"), await body(c, vehicleUpdateSchema)));
  })
  .delete("/me/vehicles/:id", async (c) => {
    await vehiclesService.remove(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .post("/me/vehicles/:id/photos", async (c) => {
    const v = await requireUser(c);
    rateLimit("vehiclePhoto", v.user.id);
    const form = await c.req.parseBody();
    if (!(form.photo instanceof File)) throw validation("Champ « photo » attendu (fichier)");
    // Lot 51 : rectangles de plaque (JSON) confirmés dans l'appli ou sur le site, floutés avant le stockage.
    let plateRects: PlateRect[] | undefined;
    if (typeof form.plateRects === "string" && form.plateRects.trim()) {
      let raw: unknown;
      try {
        raw = JSON.parse(form.plateRects);
      } catch {
        throw validation("Champ « plateRects » : JSON attendu");
      }
      plateRects = parse(plateRectsSchema, raw);
    }
    return c.json(await vehiclesService.addPhoto(v, uuidParam(c, "id"), form.photo, plateRects), 201);
  })
  // Floutage de plaque sur une photo déjà envoyée (irréversible, V9).
  .post("/me/vehicles/:id/photos/:photoId/blur", async (c) => {
    const v = await requireUser(c);
    rateLimit("vehiclePhoto", v.user.id);
    const { rects } = await body(c, photoBlurSchema);
    return c.json(await photoBlurService.blur(v, uuidParam(c, "id"), uuidParam(c, "photoId"), rects));
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
  // Historique des événements, fiche Instagram, certification (lot 31).
  .get("/me/vehicles/:id/history", async (c) =>
    c.json(await vehiclesService.history(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/me/vehicles/:id/share-image", async (c) => {
    const v = await requireUser(c);
    rateLimit("shareImage", v.user.id);
    const { format, style, download, masks } = query(c, shareImageQuery);
    const png = await vehiclesService.shareImage(v, uuidParam(c, "id"), format, style, masks);
    return c.body(new Uint8Array(png), 200, {
      "content-type": "image/png",
      "cache-control": CACHE_1H["cache-control"],
      "content-disposition": `${download ? "attachment" : "inline"}; filename="orasso-${format}-${style}.png"`,
    });
  })
  .post("/me/vehicles/:id/certification-request", async (c) => {
    const v = await requireUser(c);
    rateLimit("vehicleWrite", v.user.id);
    const { message } = await body(c, certificationRequestSchema);
    return c.json(await certificationService.request(v, uuidParam(c, "id"), message), 201);
  });
// La fiche d'un véhicule d'un autre utilisateur (`GET /vehicles/:id`) est servie par le module social (lot 17).
