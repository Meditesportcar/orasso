// La section « Photos » de la fiche d'un événement **sans session** (lot R9g, T34 : les albums se voient comme les galeries d'aujourd'hui).
// Mêmes albums que `GET /events/:id/albums` (publiés, visibles de tous), mêmes champs, mais les photos de la mosaïque ont l'adresse publique
// (`/api/public/albums/…`) : aucune lecture de session, aucun `Set-Cookie`, `public, no-cache` (chaque affichage revalide).
import { albumsListQuery } from "@orasso/shared";
import { Hono } from "hono";

import { rateLimit } from "../../lib/rateLimit";
import { visitorOf } from "../../lib/search-limit";
import type { AppEnv, Viewer } from "../../lib/session";
import { query } from "../../lib/validate";
import { albumsService } from "./service";

const nobody = { user: { id: "public" } } as unknown as Viewer;

export const albumsEventPublicRoutes = new Hono<AppEnv>().get("/public/events/by-slug/:slug/albums", async (c) => {
  // Sans session : la même limite par visiteur que les photos publiques (la liste est une lecture ouverte à tous).
  rateLimit("feedPublicPhoto", visitorOf(c));
  const list = await albumsService.forEvent(nobody, { slug: c.req.param("slug") }, query(c, albumsListQuery));
  c.header("cache-control", "public, no-cache");
  return c.json({
    ...list,
    items: list.items.map((a) => ({
      ...a,
      mine: false,
      cover: a.cover.map((p) => ({ ...p, url: p.url.replace("/api/albums/", "/api/public/albums/") })),
    })),
  });
});
