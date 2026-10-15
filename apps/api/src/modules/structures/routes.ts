import {
  banCreateSchema,
  memberInviteSchema,
  memberUpdateSchema,
  structureCreateSchema,
  structureUpdateSchema,
  structureVerifySchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, optionalUser, requireUser } from "../../lib/session";
import { body, uuidParam } from "../../lib/validate";
import { structuresService } from "./service";

const ip = (c: { req: { header(name: string): string | undefined } }) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

export const structuresRoutes = new Hono<AppEnv>()
  .post("/structures", async (c) => {
    const v = await requireUser(c);
    return c.json(await structuresService.create(v, await body(c, structureCreateSchema)), 201);
  })
  .get("/structures/by-slug/:slug", async (c) =>
    c.json(await structuresService.getPublic(c.req.param("slug"), await optionalUser(c))),
  )
  .get("/structures/:id", async (c) =>
    c.json(await structuresService.getForOrganizer(await requireUser(c), uuidParam(c, "id"))),
  )
  .patch("/structures/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await structuresService.update(v, uuidParam(c, "id"), await body(c, structureUpdateSchema)));
  })
  .post("/structures/:id/follow", async (c) => {
    await structuresService.follow(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .delete("/structures/:id/follow", async (c) => {
    await structuresService.unfollow(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .get("/structures/:id/followers", async (c) =>
    c.json(await structuresService.followers(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/structures/:id/members", async (c) =>
    c.json(await structuresService.members(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/structures/:id/members", async (c) => {
    const v = await requireUser(c);
    return c.json(await structuresService.invite(v, uuidParam(c, "id"), await body(c, memberInviteSchema)), 201);
  })
  .patch("/structures/:id/members/:userId", async (c) => {
    const v = await requireUser(c);
    await structuresService.updateMember(
      v,
      uuidParam(c, "id"),
      c.req.param("userId"),
      await body(c, memberUpdateSchema),
    );
    return c.body(null, 204);
  })
  .delete("/structures/:id/members/:userId", async (c) => {
    await structuresService.removeMember(await requireUser(c), uuidParam(c, "id"), c.req.param("userId"));
    return c.body(null, 204);
  })
  .post("/me/memberships/:structureId/accept", async (c) => {
    await structuresService.respondToInvitation(await requireUser(c), uuidParam(c, "structureId"), true);
    return c.body(null, 204);
  })
  .post("/me/memberships/:structureId/decline", async (c) => {
    await structuresService.respondToInvitation(await requireUser(c), uuidParam(c, "structureId"), false);
    return c.body(null, 204);
  })
  .get("/structures/:id/bans", async (c) =>
    c.json(await structuresService.bans(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/structures/:id/bans", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, banCreateSchema);
    await structuresService.ban(v, uuidParam(c, "id"), input.pseudo, input.reason);
    return c.body(null, 204);
  })
  .delete("/structures/:id/bans/:userId", async (c) => {
    await structuresService.unban(await requireUser(c), uuidParam(c, "id"), c.req.param("userId"));
    return c.body(null, 204);
  })
  .post("/admin/structures/:id/verify", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, structureVerifySchema);
    await structuresService.verify(v, uuidParam(c, "id"), input.verified, input.note, ip(c));
    return c.body(null, 204);
  });
