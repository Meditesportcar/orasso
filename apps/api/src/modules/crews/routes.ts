// Routes des crews et de l'inscription en crew (lot 19, ARCHITECTURE-SUITE § 4.3). Toutes réservées aux connectés.
import {
  crewConfirmSchema,
  crewCreateSchema,
  crewInviteSchema,
  crewLogoSchema,
  crewOptionsQuery,
  crewOutingCreateSchema,
  crewOutingRsvpSchema,
  crewOutingUpdateSchema,
  crewRegistrationSchema,
  crewRequestSchema,
  crewSearchQuery,
  crewUpdateSchema,
  eventInviteCandidatesQuery,
  type PlateRect,
  plateRectsSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, parse, query, uuidParam } from "../../lib/validate";
import { applicationsQueries } from "../applications/queries";
import { crewInviteCandidates } from "./invite-candidates";
import { crewOutingsService } from "./outings";
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
  // Lot R5c2 : bannière (chef ; même chaîne de plaque que les photos de véhicule), multipart `banner`, `plateRects`
  // (JSON) ou `noPlate=true`.
  .post("/crews/:id/banner", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    if (!(form.banner instanceof File)) throw validation("Champ « banner » attendu (fichier)");
    let plateRects: PlateRect[] | undefined;
    if (typeof form.plateRects === "string" && form.plateRects.trim()) {
      let raw: unknown;
      try {
        raw = JSON.parse(form.plateRects);
      } catch {
        throw validation("Champ « plateRects » : JSON attendu");
      }
      plateRects = parse(plateRectsSchema, raw);
    }
    return c.json(
      await crewsService.setBanner(v, uuidParam(c, "id"), form.banner, plateRects, form.noPlate === "true"),
    );
  })
  .delete("/crews/:id/banner", async (c) =>
    c.json(await crewsService.setBanner(await requireUser(c), uuidParam(c, "id"), null, undefined, false)),
  )
  // Tour 2 : la bannière (espace privé), lue avec une session et revérifiée à chaque lecture. Sans décision de plaque,
  // jamais gardée en cache ; avec, une heure dans le cache privé du navigateur.
  .get("/crews/:id/banner/:name", async (c) => {
    const { data, cleared } = await crewsService.bannerFile(
      await requireUser(c),
      uuidParam(c, "id"),
      c.req.param("name"),
    );
    return c.body(new Uint8Array(data), 200, {
      "content-type": "image/webp",
      "cache-control": cleared ? "private, max-age=3600" : "private, no-store",
      "x-content-type-options": "nosniff",
    });
  })
  // Lot R5c2 : sorties du crew (membres actifs).
  .post("/crews/:id/outings", async (c) => {
    const v = await requireUser(c);
    return c.json(await crewOutingsService.create(v, uuidParam(c, "id"), await body(c, crewOutingCreateSchema)), 201);
  })
  // Lot R6a, tour 2 : une sortie relue à un signal (modifiée, réponse), pour sa carte du fil, où qu'elle soit ; 404 une
  // fois annulée (la carte quitte le fil).
  .get("/crews/:id/outings/:outingId", async (c) =>
    c.json(await crewOutingsService.read(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "outingId"))),
  )
  .patch("/crews/:id/outings/:outingId", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, crewOutingUpdateSchema);
    return c.json(await crewOutingsService.update(v, uuidParam(c, "id"), uuidParam(c, "outingId"), input));
  })
  .delete("/crews/:id/outings/:outingId", async (c) => {
    await crewOutingsService.cancel(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "outingId"));
    return c.body(null, 204);
  })
  .put("/crews/:id/outings/:outingId/rsvp", async (c) => {
    const v = await requireUser(c);
    const { answer } = await body(c, crewOutingRsvpSchema);
    return c.json(await crewOutingsService.rsvp(v, uuidParam(c, "id"), uuidParam(c, "outingId"), answer));
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
  // Lot R6c (R6.7) : la feuille « Inviter dans <crew> » d'un membre : son réseau, avec l'état de chacun dans le crew.
  .get("/crews/:id/invite-candidates", async (c) => {
    const v = await requireUser(c);
    return c.json(await crewInviteCandidates(v, uuidParam(c, "id"), query(c, eventInviteCandidatesQuery)), 200, {
      "cache-control": "private, no-store",
    });
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
