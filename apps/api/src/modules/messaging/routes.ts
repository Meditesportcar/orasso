// Messagerie et Boîte (lot 18) : routes de ARCHITECTURE-SUITE § 3.3. Toutes connectées ; les droits sont dans le
// service (règles par sorte de conversation).
import {
  contactRequestCreateSchema,
  contactRequestsQuery,
  conversationsQuery,
  directConversationSchema,
  messageReadSchema,
  messageSendSchema,
  messagesQuery,
} from "@orasso/shared";
import { Hono } from "hono";

import { realtime } from "../../lib/realtime";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { contactsService } from "./contacts";
import { messagingService } from "./service";

// Abonnements WebSocket `conversation:{id}` : mêmes droits que la lecture (vérifiés à l'abonnement, puis toutes les
// 30 s, et chaque diffusion ne va qu'aux lecteurs du moment).
realtime.registerAuthorizer("conversation:", (userId, channel, ctx) =>
  messagingService.canSubscribe(userId, channel, ctx.secondFactor),
);

export const messagingRoutes = new Hono<AppEnv>()
  .get("/me/conversations", async (c) => {
    const v = await requireUser(c);
    return c.json(await messagingService.list(v, query(c, conversationsQuery)));
  })
  .post("/conversations/direct", async (c) => {
    const v = await requireUser(c);
    const { userId } = await body(c, directConversationSchema);
    const result = await messagingService.openDirect(v, userId);
    return c.json(result, result.created ? 201 : 200);
  })
  .post("/structures/:id/conversation", async (c) => {
    const v = await requireUser(c);
    const result = await messagingService.openWithStructure(v, uuidParam(c, "id"));
    return c.json(result, result.created ? 201 : 200);
  })
  .post("/structures/:id/conversations/with/:userId", async (c) => {
    const v = await requireUser(c);
    const result = await messagingService.openFromStructure(v, uuidParam(c, "id"), c.req.param("userId"));
    return c.json(result, result.created ? 201 : 200);
  })
  .get("/conversations/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await messagingService.view(v, uuidParam(c, "id")));
  })
  .get("/conversations/:id/messages", async (c) => {
    const v = await requireUser(c);
    return c.json(await messagingService.messages(v, uuidParam(c, "id"), query(c, messagesQuery)));
  })
  .post("/conversations/:id/messages", async (c) => {
    const v = await requireUser(c);
    const result = await messagingService.send(v, uuidParam(c, "id"), await body(c, messageSendSchema));
    return c.json(result.message, result.created ? 201 : 200);
  })
  .post("/conversations/:id/read", async (c) => {
    const v = await requireUser(c);
    const { messageId } = await body(c, messageReadSchema);
    return c.json(await messagingService.markRead(v, uuidParam(c, "id"), messageId));
  })
  .delete("/messages/:id", async (c) => {
    const v = await requireUser(c);
    await messagingService.deleteMessage(v, uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .get("/conversations/:id/images/:name", async (c) => {
    const v = await requireUser(c);
    const data = await messagingService.image(v, uuidParam(c, "id"), c.req.param("name"));
    return c.body(new Uint8Array(data), 200, {
      "content-type": "image/webp",
      // Image privée : jamais dans un cache partagé.
      "cache-control": "private, max-age=3600",
    });
  })
  .get("/me/contact-requests", async (c) => {
    const v = await requireUser(c);
    return c.json(await contactsService.list(v, query(c, contactRequestsQuery).direction));
  })
  .post("/contact-requests", async (c) => {
    const v = await requireUser(c);
    return c.json(await contactsService.create(v, await body(c, contactRequestCreateSchema)), 201);
  })
  .post("/contact-requests/:id/accept", async (c) => {
    const v = await requireUser(c);
    return c.json(await contactsService.accept(v, uuidParam(c, "id")));
  })
  .post("/contact-requests/:id/decline", async (c) => {
    const v = await requireUser(c);
    await contactsService.decline(v, uuidParam(c, "id"));
    return c.body(null, 204);
  });
