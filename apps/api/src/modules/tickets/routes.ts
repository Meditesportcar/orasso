import {
  adminSettingUpdateSchema,
  platformSettingKeySchema,
  platformSettingUpdateSchema,
  stripeCallbackQuery,
  ticketCheckSchema,
  ticketingUpdateSchema,
  ticketReserveSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { env } from "../../env";
import { type AppEnv, optionalUser, requireUser } from "../../lib/session";
import { body, parse, uuidParam } from "../../lib/validate";
import { adminSettingsService, isAdminSettingKey } from "../admin/settings";
import { ticketsService } from "./service";
import { settingsService } from "./settings";

const ip = (c: { req: { header(name: string): string | undefined } }) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

export const ticketsRoutes = new Hono<AppEnv>()
  // Public
  .get("/events/by-slug/:slug/tickets", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await ticketsService.offerBySlug(c.req.param("slug"), await optionalUser(c)));
  })
  .get("/me/tickets", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await ticketsService.mine(await requireUser(c)));
  })
  .post("/events/:id/tickets/reserve", async (c) => {
    const v = await requireUser(c);
    const { quantity } = await body(c, ticketReserveSchema);
    return c.json(await ticketsService.reserve(v, uuidParam(c, "id"), quantity), 201);
  })
  .post("/events/:id/tickets/checkout", async (c) => {
    const v = await requireUser(c);
    const { quantity } = await body(c, ticketReserveSchema);
    return c.json(await ticketsService.checkout(v, uuidParam(c, "id"), quantity), 201);
  })
  .delete("/tickets/:id", async (c) => {
    await ticketsService.cancel(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })

  // Organisateur
  .get("/events/:id/ticketing", async (c) =>
    c.json(await ticketsService.view(await requireUser(c), uuidParam(c, "id"))),
  )
  .put("/events/:id/ticketing", async (c) => {
    const v = await requireUser(c);
    return c.json(await ticketsService.configure(v, uuidParam(c, "id"), await body(c, ticketingUpdateSchema)));
  })
  .get("/structures/:id/stripe", async (c) =>
    c.json(await ticketsService.stripeOf(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/structures/:id/stripe/connect", async (c) =>
    c.json(await ticketsService.startConnect(await requireUser(c), uuidParam(c, "id"))),
  )
  .delete("/structures/:id/stripe", async (c) =>
    c.json(await ticketsService.disconnect(await requireUser(c), uuidParam(c, "id"))),
  )

  // Staff d'accueil
  .get("/events/:id/tickets", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await ticketsService.holders(await requireUser(c), uuidParam(c, "id")));
  })
  .post("/events/:id/tickets/check", async (c) => {
    const v = await requireUser(c);
    const { payload } = await body(c, ticketCheckSchema);
    return c.json(await ticketsService.check(v, uuidParam(c, "id"), payload));
  })

  // Stripe : retour du parcours de connexion (redirige vers le site) et webhooks signés.
  .get("/stripe/connect/callback", async (c) => {
    const q = parse(stripeCallbackQuery, c.req.query());
    const result = await ticketsService.finishConnect(await optionalUser(c), q);
    const target = result.slug
      ? `${env.PUBLIC_URL}/orga/${result.slug}/structure?stripe=${result.ok ? "connecte" : "erreur"}`
      : `${env.PUBLIC_URL}/`;
    return c.redirect(target, 302);
  })
  .post("/stripe/webhook", async (c) => {
    const raw = await c.req.text();
    return c.json(await ticketsService.webhook(raw, c.req.header("stripe-signature")));
  })

  // Administration : interrupteurs
  // Lot 33 : la même route porte aussi les réglages administrables (`entries`) ; une clé du lot 33 est validée par son
  // schéma partagé (`adminSettingsService`).
  .get("/admin/settings", async (c) => {
    const v = await requireUser(c);
    return c.json({ ...(await settingsService.view(v)), entries: await adminSettingsService.entries(v) });
  })
  .put("/admin/settings/:key", async (c) => {
    const v = await requireUser(c);
    const raw = c.req.param("key");
    if (isAdminSettingKey(raw)) {
      const input = await body(c, adminSettingUpdateSchema);
      await adminSettingsService.set(v, raw, input.value);
      return c.json({ ...(await settingsService.view(v)), entries: await adminSettingsService.entries(v) });
    }
    const key = parse(platformSettingKeySchema, raw);
    const { value } = await body(c, platformSettingUpdateSchema);
    return c.json(await settingsService.set(v, key, value, ip(c)));
  });
