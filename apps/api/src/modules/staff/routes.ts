import {
  eventStaffUpdateSchema,
  presenceSchema,
  staffRemindSchema,
  staffRequestAcceptSchema,
  staffRequestSchema,
  staffSyncQuerySchema,
  ticketScanBatchSchema,
  visitorEntryBatchSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, parse, query, uuidParam } from "../../lib/validate";
import { staffRemindService } from "./remind";
import { staffRequestsService } from "./requests";
import { staffService } from "./service";
import { shopService } from "./shop";
import { teamHistoryService } from "./team-history";

const userIdParam = (raw: string | undefined) => {
  const id = raw ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw validation("userId invalide");
  return id;
};

export const staffRoutes = new Hono<AppEnv>()
  .get("/me/staff-events", async (c) => c.json(await staffService.myEvents(await requireUser(c))))
  .get("/events/:id/staff", async (c) => c.json(await staffService.list(await requireUser(c), uuidParam(c, "id"))))
  // Équipe en bulles (lot 52) : historique de chaque membre avec la structure.
  .get("/structures/:id/team-history", async (c) => {
    c.header("cache-control", "private, no-store");
    return c.json(await teamHistoryService.ofStructure(await requireUser(c), uuidParam(c, "id")));
  })
  .patch("/events/:id/staff/:userId", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, eventStaffUpdateSchema);
    return c.json(await staffService.update(v, uuidParam(c, "id"), userIdParam(c.req.param("userId")), input));
  })
  // « Relancer » ceux qui n'ont pas répondu (tous, ou un seul : `userId`).
  .post("/events/:id/staff/remind", async (c) => {
    const v = await requireUser(c);
    const input = parse(staffRemindSchema, await c.req.json().catch(() => ({})));
    return c.json(await staffService.remind(v, uuidParam(c, "id"), input.userId));
  })
  // Relance à la demande d'un membre qui n'a pas répondu (casquette Organisateur de l'appli, lot 22).
  .post("/events/:id/staff/:userId/remind", async (c) => {
    const v = await requireUser(c);
    return c.json(await staffRemindService.remind(v, uuidParam(c, "id"), userIdParam(c.req.param("userId"))));
  })
  .put("/events/:id/staff/me/presence", async (c) => {
    const v = await requireUser(c);
    const { present } = await body(c, presenceSchema);
    return c.json(await staffService.setPresence(v, uuidParam(c, "id"), present));
  })
  .get("/events/:id/staff/sync", async (c) => {
    const v = await requireUser(c);
    const { since } = query(c, staffSyncQuerySchema);
    return c.json(await staffService.sync(v, uuidParam(c, "id"), since));
  })
  // Devenir staff d'une structure (lot 24) : demande du public, réponse de l'organisation.
  .get("/me/staff-invitations", async (c) => {
    c.header("cache-control", "private, no-store");
    return c.json(await staffRequestsService.myInvitations(await requireUser(c)));
  })
  .post("/structures/:id/staff-requests", async (c) => {
    const v = await requireUser(c);
    const { message } = await body(c, staffRequestSchema);
    return c.json(await staffRequestsService.request(v, uuidParam(c, "id"), message), 201);
  })
  .post("/structures/:id/members/:userId/accept", async (c) => {
    const v = await requireUser(c);
    // Lot 36 : la personne entre dans l'équipe sans rôle (corps ancien accepté et ignoré) ; rôles par événement ensuite.
    const input = parse(staffRequestAcceptSchema, await c.req.json().catch(() => ({})));
    await staffRequestsService.accept(v, uuidParam(c, "id"), userIdParam(c.req.param("userId")), input);
    return c.body(null, 204);
  })
  .post("/structures/:id/members/:userId/decline", async (c) => {
    const v = await requireUser(c);
    await staffRequestsService.decline(v, uuidParam(c, "id"), userIdParam(c.req.param("userId")));
    return c.body(null, 204);
  })
  // Rôle boutique (lot 24) : contrôle des billets du public et compteur d'entrées visiteurs.
  .post("/events/:id/ticket-scans", async (c) => {
    const v = await requireUser(c);
    return c.json(await shopService.scanTickets(v, uuidParam(c, "id"), await body(c, ticketScanBatchSchema)));
  })
  .post("/events/:id/visitor-entries", async (c) => {
    const v = await requireUser(c);
    return c.json(await shopService.addVisitorEntries(v, uuidParam(c, "id"), await body(c, visitorEntryBatchSchema)));
  });
