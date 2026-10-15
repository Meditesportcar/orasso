import {
  applicationCreateSchema,
  decideManySchema,
  decideSchema,
  filteringOpinionSchema,
  myApplicationsQuerySchema,
  triageQuerySchema,
  waitlistOrderSchema,
  zoneAssignSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { applicationsQueries } from "./queries";
import { applicationsService } from "./service";

const done = async (v: Parameters<typeof applicationsQueries.one>[0], id: string) => applicationsQueries.one(v, id);

export const applicationsRoutes = new Hono<AppEnv>()
  // Passionné.
  .get("/me/applications", async (c) => {
    const v = await requireUser(c);
    return c.json(await applicationsQueries.mine(v, query(c, myApplicationsQuerySchema).scope));
  })
  .post("/events/:id/applications", async (c) => {
    const v = await requireUser(c);
    const created = await applicationsService.apply(v, uuidParam(c, "id"), await body(c, applicationCreateSchema));
    return c.json(await Promise.all(created.map((a) => done(v, a.id))), 201);
  })
  .get("/applications/:id", async (c) =>
    c.json(await applicationsQueries.one(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/applications/:id/withdraw", async (c) => {
    const v = await requireUser(c);
    const row = await applicationsService.withdraw(v, uuidParam(c, "id"));
    return c.json(await done(v, row.id));
  })
  .post("/applications/:id/offer/accept", async (c) => {
    const v = await requireUser(c);
    const row = await applicationsService.acceptOffer(v, uuidParam(c, "id"));
    return c.json(await done(v, row.id));
  })
  .post("/applications/:id/offer/decline", async (c) => {
    const v = await requireUser(c);
    const row = await applicationsService.declineOffer(v, uuidParam(c, "id"));
    return c.json(await done(v, row.id));
  })
  // Tri (organisateur ; staff de filtration pour l'avis, et pour décider s'il en a le droit).
  .get("/events/:id/applications", async (c) => {
    const v = await requireUser(c);
    return c.json(await applicationsQueries.triageList(v, uuidParam(c, "id"), query(c, triageQuerySchema)));
  })
  .get("/events/:id/applications/next", async (c) =>
    c.json({ item: await applicationsQueries.next(await requireUser(c), uuidParam(c, "id")) }),
  )
  .get("/events/:id/counters", async (c) =>
    c.json(await applicationsQueries.counters(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/events/:id/applications/decide-many", async (c) => {
    const v = await requireUser(c);
    const { ids, ...input } = await body(c, decideManySchema);
    return c.json({ results: await applicationsService.decideMany(v, uuidParam(c, "id"), ids, input) });
  })
  .post("/events/:id/applications/:appId/decide", async (c) => {
    const v = await requireUser(c);
    const row = await applicationsService.decide(
      v,
      uuidParam(c, "id"),
      uuidParam(c, "appId"),
      await body(c, decideSchema),
    );
    return c.json(await done(v, row.id));
  })
  .put("/events/:id/waitlist/order", async (c) => {
    const v = await requireUser(c);
    const { applicationIds } = await body(c, waitlistOrderSchema);
    await applicationsService.reorderWaitlist(v, uuidParam(c, "id"), applicationIds);
    return c.body(null, 204);
  })
  .patch("/events/:id/applications/:appId/zone", async (c) => {
    const v = await requireUser(c);
    const { zoneId } = await body(c, zoneAssignSchema);
    await applicationsService.assignZone(v, uuidParam(c, "id"), uuidParam(c, "appId"), zoneId);
    return c.body(null, 204);
  })
  .post("/events/:id/applications/:appId/filtering-opinion", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, filteringOpinionSchema);
    return c.json(await applicationsService.filteringOpinion(v, uuidParam(c, "id"), uuidParam(c, "appId"), input));
  });
