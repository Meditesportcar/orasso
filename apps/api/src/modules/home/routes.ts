import { isIP } from "node:net";
import {
  homeQuerySchema,
  homeWidgetsPutSchema,
  type SponsoredEventInput,
  sponsoredEventSchema,
  sponsoredPlacementCreateSchema,
  sponsoredPlacementUpdateSchema,
} from "@orasso/shared";
import { type Context, Hono } from "hono";

import { validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { homeService } from "./service";
import { sponsoredService } from "./sponsored";

/** Adresse du client pour le journal d'administration (première de `x-forwarded-for`, posée par nginx). */
function clientIp(header: string | undefined): string | null {
  const ip = header?.split(",")[0]?.trim() ?? "";
  return isIP(ip) ? ip : null;
}

/** Corps facultatif de `POST /sponsored/:id/impression|click` : absent ou vide = l'Accueil ; mal formé = 400. */
async function eventBody(c: Context): Promise<SponsoredEventInput> {
  const raw = await c.req.text();
  if (!raw.trim()) return sponsoredEventSchema.parse({});
  return body(c, sponsoredEventSchema);
}

// Accueil complet (lot 30). Réponses privées : elles dépendent de la personne (profil, candidatures, position).
export const homeRoutes = new Hono<AppEnv>()
  .get("/me/home", async (c) => {
    const v = await requireUser(c);
    const data = await homeService.get(v, query(c, homeQuerySchema));
    // Privé, jamais partagé ni servi sans revalidation : statuts, tirage de l'emplacement et réglages changent (les sources
    // externes sont mises en cache en base, pas ici).
    c.header("cache-control", "private, no-cache");
    c.header("vary", "authorization, cookie");
    return c.json(data);
  })
  .put("/me/home/widgets", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "no-store");
    return c.json(await homeService.setWidgets(v, await body(c, homeWidgetsPutSchema)));
  })
  // Lot R7a2, tour 3 : « Réinitialiser » = revenir aux défauts DU COMPTE (réglage effacé ; le défaut se recalcule).
  .delete("/me/home/widgets", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "no-store");
    return c.json(await homeService.resetWidgets(v));
  })
  .post("/pros/:id/favorite", async (c) => {
    await homeService.setFavorite(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .delete("/pros/:id/favorite", async (c) => {
    await homeService.unsetFavorite(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  // Lot M5, tour 2 : l'emplacement du Garage est compté à sa première apparition à l'écran.
  // Lot R7k1 : `{ surface }` dit où la carte est apparue (`home` par défaut, `feed`) ; un corps absent vaut l'Accueil.
  .post("/sponsored/:id/impression", async (c) => {
    const v = await requireUser(c);
    await sponsoredService.impression(v, uuidParam(c, "id"), (await eventBody(c)).surface);
    return c.body(null, 204);
  })
  .post("/sponsored/:id/click", async (c) => {
    const v = await requireUser(c);
    await sponsoredService.click(v, uuidParam(c, "id"), (await eventBody(c)).surface);
    return c.body(null, 204);
  })
  // Administration : routes posées ici, page au lot 33 (`/admin/sponsorises`).
  .get("/admin/sponsored-placements", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await sponsoredService.adminList(await requireUser(c)));
  })
  .post("/admin/sponsored-placements", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, sponsoredPlacementCreateSchema);
    return c.json(await sponsoredService.adminCreate(v, input, clientIp(c.req.header("x-forwarded-for"))), 201);
  })
  .patch("/admin/sponsored-placements/:id", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, sponsoredPlacementUpdateSchema);
    return c.json(
      await sponsoredService.adminUpdate(v, uuidParam(c, "id"), input, clientIp(c.req.header("x-forwarded-for"))),
    );
  })
  .delete("/admin/sponsored-placements/:id", async (c) => {
    const v = await requireUser(c);
    await sponsoredService.adminDelete(v, uuidParam(c, "id"), clientIp(c.req.header("x-forwarded-for")));
    return c.body(null, 204);
  })
  .post("/admin/sponsored-placements/:id/image", async (c) => {
    const v = await requireUser(c);
    rateLimit("fileUpload", v.user.id);
    const form = await c.req.parseBody();
    if (!(form.image instanceof File)) throw validation("Champ « image » attendu (fichier)");
    return c.json(
      await sponsoredService.adminSetImage(
        v,
        uuidParam(c, "id"),
        form.image,
        clientIp(c.req.header("x-forwarded-for")),
      ),
    );
  });
