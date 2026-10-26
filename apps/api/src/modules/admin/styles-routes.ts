// Catalogue des styles et file « Styles proposés » (lot R5a, maquette R5.3) : super admin seulement (le service le
// vérifie, double authentification comprise), limite de fréquence par compte, validation Zod de chaque entrée.
import {
  adminCategoryCreateSchema,
  adminCategoryOrderSchema,
  adminCategoryUpdateSchema,
  adminStyleAcceptSchema,
  adminStyleDeclineSchema,
  adminStyleMergeSchema,
} from "@orasso/shared";
import type { Context } from "hono";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, uuidParam } from "../../lib/validate";
import { styleGroupKey, stylesAdminService } from "./styles";

const cursorOf = (raw: string | undefined) => (raw && /^\d{1,6}$/.test(raw) ? Number(raw) : null);

/** Clé du groupe dans l'adresse (`styleKey` : lettres et chiffres) ; sinon 400. */
function groupKey(c: Context<AppEnv>): string {
  // Hono décode déjà les paramètres de l'adresse (« caf%C3%A9 » → « café »).
  const key = styleGroupKey(c.req.param("key") ?? "");
  if (!key) throw validation("Groupe inconnu");
  return key;
}

/** Un geste d'écriture : compte connecté, limite de fréquence. */
async function writer(c: Context<AppEnv>) {
  const v = await requireUser(c);
  rateLimit("categoryAdmin", v.user.id);
  return v;
}

export const stylesAdminRoutes = new Hono<AppEnv>()
  .get("/admin/categories", async (c) => c.json(await stylesAdminService.list(await requireUser(c))))
  .post("/admin/categories", async (c) => {
    const v = await writer(c);
    return c.json(await stylesAdminService.create(v, await body(c, adminCategoryCreateSchema)), 201);
  })
  // Avant `/:id` : « order » n'est pas un identifiant.
  .patch("/admin/categories/order", async (c) => {
    const v = await writer(c);
    return c.json(await stylesAdminService.order(v, await body(c, adminCategoryOrderSchema)));
  })
  .patch("/admin/categories/:id", async (c) => {
    const v = await writer(c);
    return c.json(await stylesAdminService.update(v, uuidParam(c, "id"), await body(c, adminCategoryUpdateSchema)));
  })
  .get("/admin/category-proposals", async (c) =>
    c.json(await stylesAdminService.proposals(await requireUser(c), cursorOf(c.req.query("cursor")))),
  )
  .post("/admin/category-proposals/:key/accept", async (c) => {
    const v = await writer(c);
    return c.json(await stylesAdminService.accept(v, groupKey(c), await body(c, adminStyleAcceptSchema)));
  })
  .post("/admin/category-proposals/:key/merge", async (c) => {
    const v = await writer(c);
    return c.json(await stylesAdminService.merge(v, groupKey(c), await body(c, adminStyleMergeSchema)));
  })
  .post("/admin/category-proposals/:key/decline", async (c) => {
    const v = await writer(c);
    return c.json(await stylesAdminService.decline(v, groupKey(c), await body(c, adminStyleDeclineSchema)));
  });
