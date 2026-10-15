import { contestDecideSchema, contestStatuses, malusContestSchema, pointsAdjustSchema } from "@orasso/shared";
import { Hono } from "hono";
import { z } from "zod";

import { validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { pointsService } from "./service";

const adminContestsQuery = z.object({ status: z.enum(contestStatuses).default("escalated") });

export const pointsRoutes = new Hono<AppEnv>()
  .get("/me/points", async (c) => c.json(await pointsService.mine(await requireUser(c))))
  .post("/applications/:id/malus-contest", async (c) => {
    const v = await requireUser(c);
    const { message } = await body(c, malusContestSchema);
    return c.json(await pointsService.contest(v, uuidParam(c, "id"), message), 201);
  })
  .get("/events/:id/malus-contests", async (c) =>
    c.json(await pointsService.listForEvent(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/malus-contests/:id/decide", async (c) => {
    const v = await requireUser(c);
    return c.json(await pointsService.decide(v, uuidParam(c, "id"), await body(c, contestDecideSchema)));
  })
  .get("/admin/malus-contests", async (c) =>
    c.json(await pointsService.adminList(await requireUser(c), query(c, adminContestsQuery).status)),
  )
  .post("/admin/malus-contests/:id/decide", async (c) => {
    const v = await requireUser(c);
    return c.json(await pointsService.adminDecide(v, uuidParam(c, "id"), await body(c, contestDecideSchema)));
  })
  .post("/admin/users/:id/points-adjust", async (c) => {
    const v = await requireUser(c);
    const id = c.req.param("id");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw validation("Identifiant invalide");
    const { points, note } = await body(c, pointsAdjustSchema);
    return c.json(await pointsService.adjust(v, id, points, note));
  });
