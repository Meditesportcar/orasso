// Routes des crews et de l'inscription en crew (lot 19, ARCHITECTURE-SUITE § 4.3). Toutes réservées aux connectés.
import {
  crewConfirmSchema,
  crewCreateSchema,
  crewInviteSchema,
  crewLogoSchema,
  crewOptionsQuery,
  crewRegistrationSchema,
  crewRequestSchema,
  crewSearchQuery,
  crewUpdateSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { applicationsQueries } from "../applications/queries";
import { crewRegistrationService } from "./registration";
import { crewsService } from "./service";
import "./inbox";

/** Identifiant de compte dans un chemin (Better Auth : 32 caractères alphanumériques). */
function userIdParam(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw validation("Identifiant de compte invalide");
  return value;
}

function slugParam(value: string | undefined): string {
  if (!value || !/^[a-z0-9-]{1,80}$/.test(value)) throw validation("Adresse de crew invalide");
  return value;
}

export const crewsRoutes = new Hono<AppEnv>()
  .get("/me/crews", async (c) => c.json(await crewsService.mine((await requireUser(c)).user.id)))
  .get("/me/crew-requests", async (c) => c.json(await crewsService.inboxRequests(await requireUser(c))))
  .get("/me/crew-confirmations", async (c) =>
    c.json(await crewRegistrationService.confirmations((await requireUser(c)).user.id)),
  )
  .post("/me/crew-invitations/:crewId/accept", async (c) =>
    c.json(await crewsService.acceptInvitation(await requireUser(c), uuidParam(c, "crewId"))),
  )
  .post("/me/crew-invitations/:crewId/decline", async (c) => {
    await crewsService.declineInvitation(await requireUser(c), uuidParam(c, "crewId"));
    return c.body(null, 204);
  })
  .get("/crews/search", async (c) => {
    const v = await requireUser(c);
    return c.json(await crewsService.search(v, query(c, crewSearchQuery)));
  })
  .post("/crews", async (c) => {
    const v = await requireUser(c);
    return c.json(await crewsService.create(v, await body(c, crewCreateSchema)), 201);
  })
  .get("/crews/by-slug/:slug", async (c) =>
    c.json(await crewsService.viewBySlug(await requireUser(c), slugParam(c.req.param("slug")))),
  )
  .get("/crews/:id", async (c) => c.json(await crewsService.viewById(await requireUser(c), uuidParam(c, "id"))))
  .patch("/crews/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await crewsService.update(v, uuidParam(c, "id"), await body(c, crewUpdateSchema)));
  })
  .delete("/crews/:id", async (c) => {
    await crewsService.archive(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .post("/crews/:id/logo", async (c) => {
    const v = await requireUser(c);
    const { key } = await body(c, crewLogoSchema);
    return c.json(await crewsService.setLogo(v, uuidParam(c, "id"), key));
  })
  .get("/crews/:id/members", async (c) => c.json(await crewsService.members(await requireUser(c), uuidParam(c, "id"))))
  .delete("/crews/:id/members/:userId", async (c) => {
    await crewsService.removeMember(await requireUser(c), uuidParam(c, "id"), userIdParam(c.req.param("userId")));
    return c.body(null, 204);
  })
  .get("/crews/:id/requests", async (c) => c.json(await crewsService.pending(await requireUser(c), uuidParam(c, "id"))))
  .post("/crews/:id/requests", async (c) => {
    const v = await requireUser(c);
    const { message } = await body(c, crewRequestSchema);
    return c.json(await crewsService.request(v, uuidParam(c, "id"), message), 201);
  })
  .post("/crews/:id/requests/:userId/accept", async (c) => {
    await crewsService.acceptRequest(await requireUser(c), uuidParam(c, "id"), userIdParam(c.req.param("userId")));
    return c.body(null, 204);
  })
  .post("/crews/:id/requests/:userId/decline", async (c) => {
    await crewsService.declineRequest(await requireUser(c), uuidParam(c, "id"), userIdParam(c.req.param("userId")));
    return c.body(null, 204);
  })
  .post("/crews/:id/invitations", async (c) => {
    const v = await requireUser(c);
    const { pseudo } = await body(c, crewInviteSchema);
    return c.json(await crewsService.invite(v, uuidParam(c, "id"), pseudo), 201);
  })
  // Inscription en crew.
  .get("/events/:id/crew-applications/options", async (c) => {
    const v = await requireUser(c);
    return c.json(await crewRegistrationService.options(v, uuidParam(c, "id"), query(c, crewOptionsQuery).crewId));
  })
  .get("/events/:id/crew-applications/mine", async (c) =>
    c.json(await crewRegistrationService.mine(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/events/:id/crew-applications", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, crewRegistrationSchema);
    return c.json(await crewRegistrationService.register(v, uuidParam(c, "id"), input), 201);
  })
  .post("/applications/:id/confirm-crew", async (c) => {
    const v = await requireUser(c);
    const row = await crewRegistrationService.confirm(v, uuidParam(c, "id"), await body(c, crewConfirmSchema));
    return c.json(await applicationsQueries.one(v, row.id));
  })
  .post("/applications/:id/decline-crew", async (c) => {
    const v = await requireUser(c);
    const row = await crewRegistrationService.decline(v, uuidParam(c, "id"));
    return c.json(await applicationsQueries.one(v, row.id));
  })
  .post("/applications/:id/crew-remove", async (c) => {
    await crewRegistrationService.removeAwaiting(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  });
