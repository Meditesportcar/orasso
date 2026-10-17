import {
  banCreateSchema,
  memberInviteSchema,
  memberUpdateSchema,
  registryCheckInputSchema,
  structureCreateSchema,
  structureListQuery,
  structureUpdateSchema,
  structureVerifySchema,
  verificationDocumentKindSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { type AppEnv, optionalUser, requireUser } from "../../lib/session";
import { body, parse, query, uuidParam } from "../../lib/validate";
import { structuresService } from "./service";
import { verificationService } from "./verification";

const ip = (c: { req: { header(name: string): string | undefined } }) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

export const structuresRoutes = new Hono<AppEnv>()
  .post("/structures", async (c) => {
    const v = await requireUser(c);
    return c.json(await structuresService.create(v, await body(c, structureCreateSchema)), 201);
  })
  .get("/structures", async (c) => {
    const q = query(c, structureListQuery);
    return c.json(await structuresService.list(q.limit, q.cursor, q.q), 200, {
      "cache-control": "public, max-age=60",
    });
  })
  .get("/invitations/:token", async (c) => c.json(await structuresService.byInviteToken(c.req.param("token"))))
  .post("/invitations/:token/accept", async (c) =>
    c.json(await structuresService.acceptInvite(await requireUser(c), c.req.param("token"))),
  )
  .post("/structures/:id/logo", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    if (!(form.logo instanceof File)) throw validation("Champ « logo » attendu (fichier)");
    return c.json(await structuresService.setLogo(v, uuidParam(c, "id"), form.logo));
  })
  .get("/structures/:id/verification", async (c) =>
    c.json(await verificationService.view(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/structures/:id/verification/check", async (c) => {
    const v = await requireUser(c);
    const { number } = await body(c, registryCheckInputSchema);
    return c.json(await verificationService.check(v, uuidParam(c, "id"), number));
  })
  .post("/structures/:id/verification/documents", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    if (!(form.file instanceof File)) throw validation("Champ « file » attendu (fichier)");
    const kind = parse(verificationDocumentKindSchema, form.kind);
    return c.json(await verificationService.addDocument(v, uuidParam(c, "id"), kind, form.file), 201);
  })
  .delete("/structures/:id/verification/documents/:documentId", async (c) => {
    await verificationService.removeDocument(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "documentId"));
    return c.body(null, 204);
  })
  .post("/structures/:id/verification/submit", async (c) =>
    c.json(await verificationService.submit(await requireUser(c), uuidParam(c, "id"))),
  )
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
    const id = uuidParam(c, "id");
    await structuresService.verify(v, id, input.verified, input.note, ip(c));
    await verificationService.afterDecision(id, input.verified, input.note);
    return c.body(null, 204);
  })
  .get("/admin/structures", async (c) => {
    const status = c.req.query("status") === "all" ? "all" : "pending";
    return c.json(await verificationService.adminList(await requireUser(c), status));
  })
  .get("/admin/verification-documents/:id", async (c) => {
    const { data, doc } = await verificationService.adminDocument(await requireUser(c), uuidParam(c, "id"), ip(c));
    return c.body(new Uint8Array(data), 200, {
      "content-type": doc.contentType,
      "content-disposition": `inline; filename="${doc.fileName}"`,
      "cache-control": "private, no-store",
    });
  });
