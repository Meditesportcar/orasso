// Routes des invitations nominatives (lot 25, ARCHITECTURE-SUITE § 9.1).
import { invitationAcceptSchema, invitationCreateSchema, invitationFromEventSchema } from "@orasso/shared";
import { Hono } from "hono";

import { notFound } from "../../lib/errors";
import { type AppEnv, optionalUser, requireUser } from "../../lib/session";
import { body, uuidParam } from "../../lib/validate";
import { invitationsService } from "./service";
import "./inbox";

/** Jeton du lien (24 octets en base64url) ; une forme invalide est un lien introuvable. */
function tokenParam(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9_-]{20,64}$/.test(value)) throw notFound("Lien d'invitation introuvable");
  return value;
}

export const invitationsRoutes = new Hono<AppEnv>()
  // Organisateur.
  .get("/events/:id/invitations", async (c) =>
    c.json(await invitationsService.listForEvent(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/events/:id/invitations", async (c) => {
    const v = await requireUser(c);
    return c.json(await invitationsService.create(v, uuidParam(c, "id"), await body(c, invitationCreateSchema)), 201);
  })
  .post("/events/:id/invitations/from-event", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, invitationFromEventSchema);
    return c.json(await invitationsService.fromEvent(v, uuidParam(c, "id"), input), 201);
  })
  .get("/events/:id/invitations/sources", async (c) =>
    c.json(await invitationsService.sourceEvents(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/events/:id/invitations/candidates", async (c) =>
    c.json(await invitationsService.candidates(await requireUser(c), uuidParam(c, "id"))),
  )
  .delete("/events/:id/invitations/:invitationId", async (c) => {
    await invitationsService.remove(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "invitationId"));
    return c.body(null, 204);
  })
  // Invité.
  .get("/me/event-invitations", async (c) => c.json(await invitationsService.mine(await requireUser(c))))
  .post("/event-invitations/:id/accept", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, invitationAcceptSchema);
    return c.json(await invitationsService.accept(v, uuidParam(c, "id"), input));
  })
  .post("/event-invitations/:id/decline", async (c) => {
    await invitationsService.decline(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  // Lien envoyé par e-mail (public), puis rattachement au compte après connexion.
  .get("/invitation-evenement/:token", async (c) => {
    const view = await invitationsService.linkView(tokenParam(c.req.param("token")), await optionalUser(c));
    return c.json(view, 200, { "cache-control": "private, no-store" });
  })
  .post("/invitation-evenement/:token/claim", async (c) =>
    c.json(await invitationsService.claim(tokenParam(c.req.param("token")), await requireUser(c))),
  );
