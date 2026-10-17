// Routes de « Après l'événement et badge de structure » (lot 27). Organisation : bilan, remerciement, export tracé,
// notes internes. Équipe Orasso : fiche de structure, renouvellement du badge, suspension, levée, transfert de
// propriétaire, justificatif.
import {
  badgeReasonSchema,
  badgeRenewSchema,
  exportQuerySchema,
  noteCreateSchema,
  noteListQuerySchema,
  noteUpdateSchema,
  thanksSchema,
  transferOwnerSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { badgeService } from "./badge";
import { exportService } from "./export";
import { clientIp } from "./helpers";
import { notesService } from "./notes";
import { reportService } from "./report";
import { thanksService } from "./thanks";

export const afterEventRoutes = new Hono<AppEnv>()
  .get("/events/:id/report", async (c) => c.json(await reportService.get(await requireUser(c), uuidParam(c, "id"))))
  .post("/events/:id/thanks", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, thanksSchema);
    return c.json(await thanksService.send(v, uuidParam(c, "id"), input), 201);
  })
  .get("/events/:id/participants/export", async (c) => {
    const v = await requireUser(c);
    const input = query(c, exportQuerySchema);
    const out = await exportService.participants(v, uuidParam(c, "id"), input, {
      ip: clientIp((name) => c.req.header(name)),
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.body(out.csv, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${out.fileName}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-export-rows": String(out.rowCount),
    });
  })
  // Notes internes de la structure.
  .get("/structures/:id/notes", async (c) =>
    c.json(await notesService.list(await requireUser(c), uuidParam(c, "id"), query(c, noteListQuerySchema))),
  )
  .post("/structures/:id/notes", async (c) => {
    const v = await requireUser(c);
    return c.json(await notesService.create(v, uuidParam(c, "id"), await body(c, noteCreateSchema)), 201);
  })
  .patch("/structure-notes/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await notesService.update(v, uuidParam(c, "id"), await body(c, noteUpdateSchema)));
  })
  .delete("/structure-notes/:id", async (c) => {
    await notesService.remove(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  // Équipe Orasso : badge et propriétaire.
  .get("/admin/structures/:id", async (c) =>
    c.json(await badgeService.detail(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/admin/structures/:id/renew-badge", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, badgeRenewSchema);
    return c.json(
      await badgeService.renew(
        v,
        uuidParam(c, "id"),
        input.note,
        clientIp((n) => c.req.header(n)),
      ),
    );
  })
  .post("/admin/structures/:id/suspend", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, badgeReasonSchema);
    return c.json(
      await badgeService.suspend(
        v,
        uuidParam(c, "id"),
        input.reason,
        clientIp((n) => c.req.header(n)),
      ),
    );
  })
  .post("/admin/structures/:id/lift", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, badgeReasonSchema);
    return c.json(
      await badgeService.lift(
        v,
        uuidParam(c, "id"),
        input.reason,
        clientIp((n) => c.req.header(n)),
      ),
    );
  })
  .post("/admin/structures/:id/transfer-owner", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, transferOwnerSchema);
    return c.json(
      await badgeService.transferOwner(
        v,
        uuidParam(c, "id"),
        input,
        clientIp((n) => c.req.header(n)),
      ),
    );
  })
  .post("/admin/structures/:id/documents", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    if (!(form.file instanceof File)) throw validation("Champ « file » attendu (fichier)");
    return c.json(
      await badgeService.addDocument(
        v,
        uuidParam(c, "id"),
        form.file,
        clientIp((n) => c.req.header(n)),
      ),
      201,
    );
  });
