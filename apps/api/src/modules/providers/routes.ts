// Prestataires (lot 21, ARCHITECTURE-SUITE § 6.3). Monté avant `eventsRoutes` : `/events/open-to-providers` ne doit
// pas être pris pour `/events/:id`.
import {
  accreditationSchema,
  openToProvidersQuerySchema,
  providerApplicationCreateSchema,
  providerApplicationsQuerySchema,
  providerPhotoOrderSchema,
  providerProfileSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { AppError, validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { settingsStore } from "../../lib/settings";
import { storage } from "../../lib/storage";
import { body, query, uuidParam } from "../../lib/validate";
import { registerPersonaSource } from "../profiles/personas";
import { loadProvider } from "./serializers";
import { providerOfUser, providersService } from "./service";

// Casquette Prestataire : une entrée dans `GET /me → personas` dès que le profil existe.
registerPersonaSource(async (v) => {
  const p = await providerOfUser(v.user.id);
  if (!p) return [];
  const full = await loadProvider(p.id);
  return [
    {
      kind: "provider" as const,
      id: p.id,
      label: p.name,
      logoUrl: storage.url(full?.photos[0]?.storageKey ?? null),
      badge: await providersService.unseenDecisions(v.user.id),
    },
  ];
});

/** Lot 33 : interrupteur « candidatures des prestataires » de l'administration (profil et candidatures). */
async function assertProvidersEnabled() {
  if (!(await settingsStore.get("providers.enabled"))) {
    throw new AppError(403, "providers_disabled", "Les candidatures des prestataires sont momentanément fermées.");
  }
}

export const providersRoutes = new Hono<AppEnv>()
  .get("/me/provider-profile", async (c) => {
    c.header("cache-control", "no-store");
    return c.json({ profile: await providersService.mine(await requireUser(c)) });
  })
  .put("/me/provider-profile", async (c) => {
    const v = await requireUser(c);
    await assertProvidersEnabled();
    return c.json(await providersService.upsert(v, await body(c, providerProfileSchema)));
  })
  .post("/me/provider-profile/from-pro", async (c) => c.json(await providersService.fromPro(await requireUser(c)), 201))
  .post("/me/provider-profile/photos", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    if (!(form.photo instanceof File)) throw validation("Champ « photo » attendu (fichier)");
    return c.json(await providersService.addPhoto(v, form.photo), 201);
  })
  .put("/me/provider-profile/photos/order", async (c) => {
    const v = await requireUser(c);
    const { photoIds } = await body(c, providerPhotoOrderSchema);
    return c.json(await providersService.reorderPhotos(v, photoIds));
  })
  .delete("/me/provider-profile/photos/:photoId", async (c) =>
    c.json(await providersService.removePhoto(await requireUser(c), uuidParam(c, "photoId"))),
  )
  .get("/providers/:id", async (c) => {
    await requireUser(c);
    return c.json(await providersService.getPublic(uuidParam(c, "id")));
  })
  .get("/me/provider-applications", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "no-store");
    return c.json(await providersService.mineApplications(v, query(c, providerApplicationsQuerySchema).scope));
  })
  .get("/events/open-to-providers", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "no-store");
    return c.json(await providersService.openEvents(v, query(c, openToProvidersQuerySchema).type));
  })
  .post("/events/:id/provider-applications", async (c) => {
    const v = await requireUser(c);
    await assertProvidersEnabled();
    return c.json(
      await providersService.apply(v, uuidParam(c, "id"), await body(c, providerApplicationCreateSchema)),
      201,
    );
  })
  .patch("/events/:id/applications/:appId/accreditation", async (c) => {
    const v = await requireUser(c);
    const { accredited } = await body(c, accreditationSchema);
    return c.json(await providersService.setAccreditation(v, uuidParam(c, "id"), uuidParam(c, "appId"), accredited));
  })
  .get("/events/by-slug/:slug/providers", async (c) =>
    c.json(await providersService.presentAtEvent(c.req.param("slug")), 200, { "cache-control": "no-cache" }),
  );
