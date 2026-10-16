import {
  proCreateSchema,
  proDiscountsSchema,
  proListQuery,
  proPartnerRequestSchema,
  proPostCreateSchema,
  proPublishSchema,
  proTrackSchema,
  proUpdateSchema,
  registryCheckInputSchema,
} from "@orasso/shared";
import { Hono } from "hono";
import { z } from "zod";

import { validation } from "../../lib/errors";
import { type AppEnv, optionalUser, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { prosService } from "./service";

const statsQuery = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) });

/** Adresse du visiteur (posée par nginx / le rendu serveur du site), sinon un repère commun. */
const visitorOf = (c: { req: { header(name: string): string | undefined } }) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "direct";

export const prosRoutes = new Hono<AppEnv>()
  .get("/pros", async (c) =>
    c.json(await prosService.list(query(c, proListQuery)), 200, { "cache-control": "no-cache" }),
  )
  .get("/pros/by-slug/:slug", async (c) =>
    c.json(await prosService.getPublic(c.req.param("slug"), await optionalUser(c))),
  )
  .post("/pros/by-slug/:slug/track", async (c) => {
    const viewer = await optionalUser(c);
    const { kind } = await body(c, proTrackSchema);
    await prosService.track(c.req.param("slug"), kind, viewer, viewer?.user.id ?? visitorOf(c));
    return c.body(null, 204);
  })
  .post("/pros", async (c) => {
    const v = await requireUser(c);
    return c.json(await prosService.create(v, await body(c, proCreateSchema)), 201);
  })
  .get("/me/pro", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await prosService.mine(await requireUser(c)));
  })
  .patch("/pros/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await prosService.update(v, uuidParam(c, "id"), await body(c, proUpdateSchema)));
  })
  .put("/pros/:id/published", async (c) => {
    const v = await requireUser(c);
    const { published } = await body(c, proPublishSchema);
    return c.json(await prosService.setPublished(v, uuidParam(c, "id"), published));
  })
  .post("/pros/:id/logo", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    if (!(form.logo instanceof File)) throw validation("Champ « logo » attendu (fichier)");
    return c.json(await prosService.setLogo(v, uuidParam(c, "id"), form.logo));
  })
  .post("/pros/:id/photos", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    if (!(form.photo instanceof File)) throw validation("Champ « photo » attendu (fichier)");
    return c.json(await prosService.addPhoto(v, uuidParam(c, "id"), form.photo), 201);
  })
  .delete("/pros/:id/photos/:photoId", async (c) =>
    c.json(await prosService.removePhoto(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "photoId"))),
  )
  .put("/pros/:id/discounts", async (c) => {
    const v = await requireUser(c);
    return c.json(await prosService.setDiscounts(v, uuidParam(c, "id"), await body(c, proDiscountsSchema)));
  })
  .post("/pros/:id/siret/check", async (c) => {
    const v = await requireUser(c);
    const { number } = await body(c, registryCheckInputSchema);
    return c.json(await prosService.checkSiret(v, uuidParam(c, "id"), number));
  })
  .post("/pros/:id/follow", async (c) => {
    await prosService.follow(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .delete("/pros/:id/follow", async (c) => {
    await prosService.unfollow(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .post("/pros/:id/posts", async (c) => {
    const v = await requireUser(c);
    return c.json(await prosService.createPost(v, uuidParam(c, "id"), await body(c, proPostCreateSchema)), 201);
  })
  .delete("/pros/:id/posts/:postId", async (c) => {
    await prosService.deletePost(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "postId"));
    return c.body(null, 204);
  })
  .get("/pros/:id/stats", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "no-store");
    return c.json(await prosService.stats(v, uuidParam(c, "id"), query(c, statsQuery).days));
  })
  .post("/pros/:id/partners", async (c) => {
    const v = await requireUser(c);
    const { structureSlug } = await body(c, proPartnerRequestSchema);
    return c.json(await prosService.requestPartner(v, uuidParam(c, "id"), structureSlug), 201);
  })
  .delete("/pros/:id/partners/:structureSlug", async (c) =>
    c.json(await prosService.removePartner(await requireUser(c), uuidParam(c, "id"), c.req.param("structureSlug"))),
  )
  .get("/structures/by-slug/:slug/pros", async (c) =>
    c.json(await prosService.partnersPublicBySlug(c.req.param("slug")), 200, { "cache-control": "public, max-age=60" }),
  )
  // Côté organisateur : demandes de partenariat reçues, acceptation, retrait.
  .get("/structures/:id/partners", async (c) =>
    c.json(await prosService.partnersOfStructure(await requireUser(c), uuidParam(c, "id"))),
  )
  .put("/structures/:id/partners/:proSlug", async (c) =>
    c.json(await prosService.acceptPartner(await requireUser(c), uuidParam(c, "id"), c.req.param("proSlug"))),
  )
  .delete("/structures/:id/partners/:proSlug", async (c) =>
    c.json(await prosService.dropPartner(await requireUser(c), uuidParam(c, "id"), c.req.param("proSlug"))),
  );
