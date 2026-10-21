import { audienceCandidatesQuery, audienceVoteSchema } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { audiencePrizeService } from "./service";

// Prix du public (lot 49) : classement en direct (connectés), ma voix, voter.
export const audiencePrizeRoutes = new Hono<AppEnv>()
  .get("/events/:id/audience-prize", async (c) =>
    c.json(await audiencePrizeService.board(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/events/:id/audience-prize/candidates", async (c) => {
    const v = await requireUser(c);
    const { cursor } = query(c, audienceCandidatesQuery);
    return c.json(await audiencePrizeService.candidates(v, uuidParam(c, "id"), cursor));
  })
  .get("/events/:id/audience-prize/mine", async (c) =>
    c.json(await audiencePrizeService.mine(await requireUser(c), uuidParam(c, "id"))),
  )
  .put("/events/:id/audience-prize/vote", async (c) => {
    const v = await requireUser(c);
    const { applicationId } = await body(c, audienceVoteSchema);
    return c.json(await audiencePrizeService.vote(v, uuidParam(c, "id"), applicationId));
  });
