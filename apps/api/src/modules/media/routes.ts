// Média et accréditation presse (lot 45, ARCHITECTURE-DA-V2 § 5.1). La décision sur une accréditation passe par les
// routes du tri (`GET /events/:id/applications?kind=media`, décision existante) et le désistement par
// `POST /applications/:id/withdraw` ; le badge presse est le pass (`GET /applications/:id/pass`).
import {
  accreditationRequestSchema,
  accreditationsQuerySchema,
  mediaContentCreateSchema,
  mediaContentFeatureSchema,
  mediaContentUpdateSchema,
  mediaLogoSchema,
  mediaProfileSchema,
  pressSettingsSchema,
} from "@orasso/shared";
import { Hono } from "hono";
import { z } from "zod";

import { type AppEnv, optionalUser, requireUser } from "../../lib/session";
import { storage } from "../../lib/storage";
import { body, query, uuidParam } from "../../lib/validate";
import { clientIp } from "../after-event/helpers";
import { registerPersonaSource } from "../profiles/personas";
import { mediaOfUser, mediaService } from "./service";

// Casquette Média : une entrée dans `GET /me → personas` dès que le profil existe ; badge = décisions non vues.
registerPersonaSource(async (v) => {
  const p = await mediaOfUser(v.user.id);
  if (!p) return [];
  return [
    {
      kind: "media" as const,
      id: p.id,
      label: p.name,
      logoUrl: storage.url(p.logoKey),
      badge: await mediaService.unseenDecisions(v.user.id),
    },
  ];
});

/**
 * Visiteur sans compte : son adresse (la **dernière** de `x-forwarded-for`, posée par nginx ; le début de la liste vient
 * du client et se falsifie) et son navigateur.
 */
const sessionOf = (c: { req: { header(name: string): string | undefined } }) =>
  `${clientIp((name) => c.req.header(name)) ?? "direct"}|${c.req.header("user-agent") ?? ""}`;

const adminMediaQuery = z.object({ pending: z.enum(["0", "1"]).default("0") });
const verifySchema = z.object({ verified: z.boolean().default(true) });

export const mediaRoutes = new Hono<AppEnv>()
  // Profil.
  .get("/me/media-profile", async (c) => {
    c.header("cache-control", "no-store");
    return c.json({ profile: await mediaService.mine(await requireUser(c)) });
  })
  .put("/me/media-profile", async (c) => {
    const v = await requireUser(c);
    return c.json(await mediaService.upsert(v, await body(c, mediaProfileSchema)));
  })
  .post("/me/media-profile/logo", async (c) => {
    const v = await requireUser(c);
    const { key } = await body(c, mediaLogoSchema);
    return c.json(await mediaService.setLogo(v, key));
  })
  .delete("/me/media-profile/logo", async (c) => c.json(await mediaService.setLogo(await requireUser(c), null)))
  .get("/media/:id", async (c) => {
    await requireUser(c);
    return c.json(await mediaService.getPublic(uuidParam(c, "id")));
  })
  // Agenda et événements gardés.
  .get("/me/media/agenda", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await mediaService.agenda(await requireUser(c)));
  })
  .post("/me/media/saved/:eventId", async (c) => {
    await mediaService.save(await requireUser(c), uuidParam(c, "eventId"));
    return c.body(null, 204);
  })
  .delete("/me/media/saved/:eventId", async (c) => {
    await mediaService.unsave(await requireUser(c), uuidParam(c, "eventId"));
    return c.body(null, 204);
  })
  // Accréditations.
  .post("/events/:id/accreditations", async (c) => {
    const v = await requireUser(c);
    return c.json(
      await mediaService.requestAccreditation(v, uuidParam(c, "id"), await body(c, accreditationRequestSchema)),
      201,
    );
  })
  .get("/events/:id/accreditations", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await mediaService.listForOrganizer(await requireUser(c), uuidParam(c, "id")));
  })
  .get("/me/accreditations", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "no-store");
    return c.json(await mediaService.mineAccreditations(v, query(c, accreditationsQuerySchema).scope));
  })
  // Réglages presse (organisateur).
  .get("/events/:id/press-settings", async (c) =>
    c.json(await mediaService.pressSettings(await requireUser(c), uuidParam(c, "id"))),
  )
  .put("/events/:id/press-settings", async (c) => {
    const v = await requireUser(c);
    return c.json(await mediaService.putPressSettings(v, uuidParam(c, "id"), await body(c, pressSettingsSchema)));
  })
  .patch("/events/:id/media-contents/:cid/feature", async (c) => {
    const v = await requireUser(c);
    const { featured } = await body(c, mediaContentFeatureSchema);
    return c.json(await mediaService.feature(v, uuidParam(c, "id"), uuidParam(c, "cid"), featured));
  })
  // Contenus.
  .get("/me/media-contents", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await mediaService.mineContents(await requireUser(c)));
  })
  .post("/me/media-contents", async (c) => {
    const v = await requireUser(c);
    return c.json(await mediaService.createContent(v, await body(c, mediaContentCreateSchema)), 201);
  })
  .patch("/me/media-contents/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await mediaService.updateContent(v, uuidParam(c, "id"), await body(c, mediaContentUpdateSchema)));
  })
  .delete("/me/media-contents/:id", async (c) => {
    await mediaService.deleteContent(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .get("/events/by-slug/:slug/media-contents", async (c) =>
    c.json(await mediaService.publicForEvent(c.req.param("slug")), 200, { "cache-control": "no-cache" }),
  )
  .post("/media-contents/:id/view", async (c) => {
    const viewer = await optionalUser(c);
    return c.json(await mediaService.view(uuidParam(c, "id"), viewer?.user.id ?? sessionOf(c), viewer));
  })
  // Administration : profils média à vérifier (page du lot 57).
  .get("/admin/media", async (c) => {
    const v = await requireUser(c);
    return c.json(await mediaService.adminList(v, query(c, adminMediaQuery).pending === "1"));
  })
  .post("/admin/media/:id/verify", async (c) => {
    const v = await requireUser(c);
    const { verified } = await body(c, verifySchema);
    return c.json(await mediaService.verifyProfile(v, uuidParam(c, "id"), verified));
  });
