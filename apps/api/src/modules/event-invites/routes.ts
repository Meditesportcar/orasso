import { eventInviteCandidatesQuery, eventInviteCreateSchema, invitationMuteSchema } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { eventInvitesService } from "./service";

// Lot R6c (maquettes R6.3 à R6.6) : « Qui y va », inviter du monde, le bandeau de l'invité, couper les invitations.
// Toujours connecté (un visiteur sans compte ne voit personne). `POST /events/:id/invitations` reste aux invitations
// nominatives de l'organisateur (lot 25) : les invitations entre passionnés sont sous `/peer-invitations`.
const PRIVATE = { "cache-control": "private, no-store" } as const;

export const eventInvitesRoutes = new Hono<AppEnv>()
  .get("/events/:id/following-going", async (c) =>
    c.json(await eventInvitesService.followingGoing(await requireUser(c), uuidParam(c, "id")), 200, PRIVATE),
  )
  .get("/events/:id/peer-invitations/candidates", async (c) => {
    const v = await requireUser(c);
    return c.json(
      await eventInvitesService.candidates(v, uuidParam(c, "id"), query(c, eventInviteCandidatesQuery)),
      200,
      PRIVATE,
    );
  })
  .get("/events/:id/peer-invitations/received", async (c) =>
    c.json(await eventInvitesService.received(await requireUser(c), uuidParam(c, "id")), 200, PRIVATE),
  )
  .post("/events/:id/peer-invitations", async (c) => {
    const v = await requireUser(c);
    return c.json(await eventInvitesService.invite(v, uuidParam(c, "id"), await body(c, eventInviteCreateSchema)));
  })
  .get("/me/invitation-mutes", async (c) => c.json(await eventInvitesService.mutes(await requireUser(c)), 200, PRIVATE))
  .post("/me/invitation-mutes", async (c) => {
    const v = await requireUser(c);
    const { userId } = await body(c, invitationMuteSchema);
    return c.json(await eventInvitesService.mute(v, userId));
  })
  .delete("/me/invitation-mutes/:userId", async (c) =>
    c.json(await eventInvitesService.unmute(await requireUser(c), c.req.param("userId"))),
  );
