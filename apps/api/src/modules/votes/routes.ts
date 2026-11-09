// Votes à thème (lot R7l1, ARCHITECTURE-R7 § 2.7). Routes fixes (`manage`, `templates`, `order`) avant `:voteId`.
import {
  voteCandidateAddSchema,
  voteCandidatesQuery,
  voteCastSchema,
  voteCreateSchema,
  voteOrderSchema,
  voteUpdateSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { votesService } from "./service";

export const votesRoutes = new Hono<AppEnv>()
  // Organisateur (propriétaire, co-organisateurs ; le staff lit).
  .get("/events/:id/votes/manage", async (c) =>
    c.json(await votesService.manage(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/events/:id/votes/templates", async (c) => {
    await requireUser(c);
    return c.json(votesService.templates());
  })
  .put("/events/:id/votes/order", async (c) => {
    const v = await requireUser(c);
    const { ids } = await body(c, voteOrderSchema);
    return c.json(await votesService.order(v, uuidParam(c, "id"), ids));
  })
  .post("/events/:id/votes", async (c) => {
    const v = await requireUser(c);
    return c.json(await votesService.create(v, uuidParam(c, "id"), await body(c, voteCreateSchema)), 201);
  })
  .post("/events/:id/votes/all-categories", async (c) =>
    c.json(await votesService.restoreAllCategories(await requireUser(c), uuidParam(c, "id")), 201),
  )
  .patch("/events/:id/votes/:voteId", async (c) => {
    const v = await requireUser(c);
    return c.json(
      await votesService.update(v, uuidParam(c, "id"), uuidParam(c, "voteId"), await body(c, voteUpdateSchema)),
    );
  })
  .delete("/events/:id/votes/:voteId", async (c) =>
    c.json(await votesService.remove(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "voteId"))),
  )
  .post("/events/:id/votes/:voteId/open", async (c) =>
    c.json(await votesService.open(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "voteId"))),
  )
  .post("/events/:id/votes/:voteId/close", async (c) =>
    c.json(await votesService.close(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "voteId"))),
  )
  .post("/events/:id/votes/:voteId/candidates", async (c) => {
    const v = await requireUser(c);
    return c.json(
      await votesService.addCandidate(
        v,
        uuidParam(c, "id"),
        uuidParam(c, "voteId"),
        await body(c, voteCandidateAddSchema),
      ),
    );
  })
  .delete("/events/:id/votes/:voteId/candidates/:applicationId", async (c) =>
    c.json(
      await votesService.removeCandidate(
        await requireUser(c),
        uuidParam(c, "id"),
        uuidParam(c, "voteId"),
        uuidParam(c, "applicationId"),
      ),
    ),
  )
  // Passionné.
  .get("/events/:id/votes", async (c) => c.json(await votesService.list(await requireUser(c), uuidParam(c, "id"))))
  .get("/events/:id/votes/:voteId", async (c) =>
    c.json(await votesService.get(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "voteId"))),
  )
  .get("/events/:id/votes/:voteId/candidates", async (c) => {
    const v = await requireUser(c);
    const { cursor } = query(c, voteCandidatesQuery);
    return c.json(await votesService.candidates(v, uuidParam(c, "id"), uuidParam(c, "voteId"), cursor));
  })
  .put("/events/:id/votes/:voteId/vote", async (c) => {
    const v = await requireUser(c);
    const { applicationId } = await body(c, voteCastSchema);
    return c.json(await votesService.cast(v, uuidParam(c, "id"), uuidParam(c, "voteId"), applicationId));
  });
