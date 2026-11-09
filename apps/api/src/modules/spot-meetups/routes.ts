// Rendez-vous au spot (lot R7i, ARCHITECTURE-R7 § 2.8). Session requise partout ; l'autorisation (auteur ou invité) est
// décidée dans le service, jamais ici. Les chemins fixes (`/me/spot-meetups/...`) passent avant `/spot-meetups/:id`.
import { spotListQuery, spotReplySchema } from "@orasso/shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { spotMeetupsService } from "./service";

// Lot R7i, tour 3 : le lieu d'un rendez-vous ne reste ni dans un cache partagé ni dans celui de l'appareil (réponses privées,
// y compris les refus : l'en-tête est posé avant le traitement).
const noStore = createMiddleware<AppEnv>(async (c, next) => {
  c.header("cache-control", "private, no-store");
  await next();
});

export const spotMeetupsRoutes = new Hono<AppEnv>()
  .use("/me/spot-meetups", noStore)
  .use("/me/spot-meetups/*", noStore)
  .use("/spot-meetups/*", noStore)
  .use("/crews/:id/spot-meetups", noStore)
  .post("/me/spot-meetups", async (c) => {
    const v = await requireUser(c);
    let data: unknown;
    try {
      data = await c.req.json();
    } catch {
      data = null;
    }
    return c.json(await spotMeetupsService.create(v, data), 201);
  })
  .get("/me/spot-meetups/audiences", async (c) => c.json(await spotMeetupsService.audiences(await requireUser(c))))
  .get("/me/spot-meetups/active", async (c) => c.json({ meetup: await spotMeetupsService.mine(await requireUser(c)) }))
  .get("/me/spot-meetups/incoming", async (c) => {
    const v = await requireUser(c);
    return c.json(await spotMeetupsService.incoming(v, query(c, spotListQuery).cursor));
  })
  .delete("/me/spot-meetups/:id", async (c) =>
    c.json(await spotMeetupsService.cancel(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/spot-meetups/:id", async (c) => c.json(await spotMeetupsService.get(await requireUser(c), uuidParam(c, "id"))))
  .put("/spot-meetups/:id/reply", async (c) => {
    const v = await requireUser(c);
    const { answer } = await body(c, spotReplySchema);
    return c.json(await spotMeetupsService.reply(v, uuidParam(c, "id"), answer));
  })
  .delete("/spot-meetups/:id/reply", async (c) =>
    c.json(await spotMeetupsService.unreply(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/spot-meetups/:id/replies", async (c) => {
    const v = await requireUser(c);
    return c.json(await spotMeetupsService.replies(v, uuidParam(c, "id"), query(c, spotListQuery).cursor));
  })
  .get("/crews/:id/spot-meetups", async (c) => {
    const v = await requireUser(c);
    return c.json(await spotMeetupsService.crewList(v, uuidParam(c, "id"), query(c, spotListQuery).cursor));
  });
