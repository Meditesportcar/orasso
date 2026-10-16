// Routes de la modération (lot 32, ARCHITECTURE-SUITE § 15.3).
import { isIP } from "node:net";
import {
  adminReportStatusSchema,
  adminReportsQuery,
  adminSanctionSchema,
  adminSanctionsQuery,
  reportCreateSchema,
  sanctionContestSchema,
  sanctionDecisionSchema,
  sanctionLiftSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { moderationService } from "./service";

/** Adresse du client pour le journal d'administration (première de `x-forwarded-for`, posée par nginx). */
function clientIp(header: string | undefined): string | null {
  const ip = header?.split(",")[0]?.trim() ?? "";
  return isIP(ip) ? ip : null;
}

export const moderationRoutes = new Hono<AppEnv>()
  .post("/reports", async (c) => {
    const v = await requireUser(c);
    return c.json(await moderationService.create(v, await body(c, reportCreateSchema)), 201);
  })
  .get("/me/sanctions", async (c) => c.json(await moderationService.mySanctions(await requireUser(c))))
  // Seule écriture permise à un compte suspendu (avec la suppression du compte), § 0.4.
  .post("/sanctions/:id/contest", async (c) => {
    const v = await requireUser(c);
    const { message } = await body(c, sanctionContestSchema);
    return c.json(await moderationService.contest(v, uuidParam(c, "id"), message));
  })
  .get("/admin/reports", async (c) => {
    const v = await requireUser(c);
    return c.json(await moderationService.adminList(v, query(c, adminReportsQuery)));
  })
  .get("/admin/reports/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(
      await moderationService.adminDetail(v, uuidParam(c, "id"), clientIp(c.req.header("x-forwarded-for"))),
    );
  })
  .get("/admin/reports/:id/screenshot", async (c) => {
    const data = await moderationService.screenshot(await requireUser(c), uuidParam(c, "id"));
    return c.body(new Uint8Array(data), 200, { "content-type": "image/webp", "cache-control": "private, no-store" });
  })
  .post("/admin/reports/:id/status", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, adminReportStatusSchema);
    return c.json(
      await moderationService.setStatus(v, uuidParam(c, "id"), input, clientIp(c.req.header("x-forwarded-for"))),
    );
  })
  .post("/admin/reports/:id/sanction", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, adminSanctionSchema);
    return c.json(
      await moderationService.sanction(v, uuidParam(c, "id"), input, clientIp(c.req.header("x-forwarded-for"))),
    );
  })
  .get("/admin/sanctions", async (c) => {
    const v = await requireUser(c);
    return c.json(await moderationService.adminSanctions(v, query(c, adminSanctionsQuery).filter));
  })
  .post("/admin/sanctions/:id/decide", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, sanctionDecisionSchema);
    await moderationService.decide(v, uuidParam(c, "id"), input, clientIp(c.req.header("x-forwarded-for")));
    return c.body(null, 204);
  })
  .post("/admin/sanctions/:id/lift", async (c) => {
    const v = await requireUser(c);
    const { note } = await body(c, sanctionLiftSchema);
    await moderationService.lift(v, uuidParam(c, "id"), note, clientIp(c.req.header("x-forwarded-for")));
    return c.body(null, 204);
  });
