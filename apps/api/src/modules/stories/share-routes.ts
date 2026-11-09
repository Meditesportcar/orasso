// Routes du partage d'un contenu d'Orasso (lot R7f4) : la feuille « Partager » (`/me/share/info`), l'aperçu de la carte,
// et les fichiers qui sortent d'Orasso. Session requise partout ; jamais gardés par le navigateur ou un relais.
import { shareCardQuery, shareExportQuery, shareRefQuery } from "@orasso/shared";
import { Hono } from "hono";
import { z } from "zod";

import { rateLimit } from "../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../lib/session";
import { query, uuidParam } from "../../lib/validate";
import { exportService } from "./export";
import { shareInfo } from "./linked";

const headers = (type: string, name?: string, attachment = false) => ({
  "content-type": type,
  "cache-control": "private, no-store",
  ...(name ? { "content-disposition": `${attachment ? "attachment" : "inline"}; filename="${name}"` } : {}),
});

const download = z.object({ download: z.enum(["0", "1"]).optional() });

export const shareRoutes = new Hono<AppEnv>()
  .get("/me/share/info", async (c) => {
    const v = await requireUser(c);
    rateLimit("shareInfo", v.user.id);
    const { type, id } = query(c, shareRefQuery);
    c.header("cache-control", "private, no-store");
    return c.json(await shareInfo(v, type, id));
  })
  .get("/me/share/card", async (c) => {
    const v = await requireUser(c);
    const { type, id, part } = query(c, shareCardQuery);
    const f = await exportService.card(v, type, id, part);
    return c.body(new Uint8Array(f.data), 200, headers(f.type));
  })
  .get("/me/share/export", async (c) => {
    const v = await requireUser(c);
    const { type, id, format } = query(c, shareExportQuery.extend(download.shape));
    const f = await exportService.linked(v, type, id, format);
    return c.body(new Uint8Array(f.data), 200, headers(f.type, f.name, c.req.query("download") === "1"));
  })
  .get("/stories/:id/export", async (c) => {
    const v = await requireUser(c);
    const f = await exportService.story(v, uuidParam(c, "id"));
    return c.body(new Uint8Array(f.data), 200, headers(f.type, f.name, c.req.query("download") === "1"));
  })
  .get("/feed-posts/:id/export", async (c) => {
    const v = await requireUser(c);
    const f = await exportService.feedPost(v, uuidParam(c, "id"));
    return c.body(new Uint8Array(f.data), 200, headers(f.type, f.name, c.req.query("download") === "1"));
  });
