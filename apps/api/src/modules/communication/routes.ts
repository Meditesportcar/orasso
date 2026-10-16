// Communication de l'organisateur (lot 20) : fil de l'événement, consignes, messages groupés, modèles, discussions du
// staff, Boîte de la casquette Organisateur.
import {
  announcementCreateSchema,
  announcementUpdateSchema,
  conversationsQuery,
  groupMessageCreateSchema,
  groupMessagePreviewQuery,
  instructionsSendSchema,
  templateCreateSchema,
  templateUpdateSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, optionalUser, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { announcementsService } from "./announcements";
import { groupMessagesService } from "./group-messages";
import { organizerInboxService } from "./inbox";
import { staffChatsService } from "./staff-chats";
import { templatesService } from "./templates";

export const communicationRoutes = new Hono<AppEnv>()
  // Fil de l'événement : public (sans compte), enrichi pour les retenus et l'équipe.
  .get("/events/by-slug/:slug/announcements", async (c) =>
    c.json(await announcementsService.listPublic(c.req.param("slug"), await optionalUser(c)), 200, {
      "cache-control": "private, no-store",
    }),
  )
  .get("/events/:id/announcements", async (c) =>
    c.json(await announcementsService.listForOrganizer(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/events/:id/announcements", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, announcementCreateSchema);
    return c.json(await announcementsService.create(v, uuidParam(c, "id"), input), 201);
  })
  .patch("/events/:id/announcements/:aid", async (c) => {
    const v = await requireUser(c);
    const { pinned } = await body(c, announcementUpdateSchema);
    return c.json(await announcementsService.setPinned(v, uuidParam(c, "id"), uuidParam(c, "aid"), pinned));
  })
  .delete("/events/:id/announcements/:aid", async (c) => {
    await announcementsService.remove(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "aid"));
    return c.body(null, 204);
  })
  .post("/events/:id/instructions/send", async (c) => {
    const v = await requireUser(c);
    const { instructions } = await body(c, instructionsSendSchema);
    return c.json(await announcementsService.sendInstructions(v, uuidParam(c, "id"), instructions));
  })
  // Messages groupés.
  .get("/structures/:id/messaging/quota", async (c) =>
    c.json(await groupMessagesService.quota(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/structures/:id/group-messages/preview", async (c) => {
    const v = await requireUser(c);
    return c.json(await groupMessagesService.preview(v, uuidParam(c, "id"), query(c, groupMessagePreviewQuery)));
  })
  .get("/structures/:id/group-messages", async (c) =>
    c.json(await groupMessagesService.list(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/structures/:id/group-messages", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, groupMessageCreateSchema);
    const result = await groupMessagesService.create(v, uuidParam(c, "id"), input);
    return c.json(result, result.created ? 202 : 200);
  })
  .get("/group-messages/:id", async (c) =>
    c.json(await groupMessagesService.get(await requireUser(c), uuidParam(c, "id"))),
  )
  // Modèles.
  .get("/structures/:id/templates", async (c) =>
    c.json(await templatesService.list(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/structures/:id/templates", async (c) => {
    const v = await requireUser(c);
    return c.json(await templatesService.create(v, uuidParam(c, "id"), await body(c, templateCreateSchema)), 201);
  })
  .patch("/structures/:id/templates/:tid", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, templateUpdateSchema);
    return c.json(await templatesService.update(v, uuidParam(c, "id"), uuidParam(c, "tid"), input));
  })
  .delete("/structures/:id/templates/:tid", async (c) => {
    await templatesService.remove(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "tid"));
    return c.body(null, 204);
  })
  // Discussions du staff.
  .get("/structures/:id/staff-conversation", async (c) =>
    c.json(await staffChatsService.forStructure(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/structures/:id/staff-conversations", async (c) =>
    c.json({ items: await staffChatsService.listForStructure(await requireUser(c), uuidParam(c, "id")) }),
  )
  .get("/events/:id/staff-conversation", async (c) =>
    c.json(await staffChatsService.forEvent(await requireUser(c), uuidParam(c, "id"))),
  )
  // Boîte de la casquette Organisateur (lot 22).
  .get("/structures/:id/inbox/summary", async (c) =>
    c.json(await organizerInboxService.summary(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/structures/:id/conversations", async (c) => {
    const v = await requireUser(c);
    return c.json(await organizerInboxService.conversations(v, uuidParam(c, "id"), query(c, conversationsQuery)));
  });
