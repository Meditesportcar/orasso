// Horloge simulée (lot 34a, développement seulement) : `/dev/clock`. Sans DEV_CLOCK, ces routes répondent 404 comme si
// elles n'existaient pas (l'API refuse de démarrer en production avec DEV_CLOCK). Super admin avec second facteur de
// session ; chaque changement est tracé dans `admin_audit_log`.
import { clockAdvanceInput } from "@orasso/shared";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import { db } from "../../db/client";
import { adminAuditLog } from "../../db/schema";
import { env } from "../../env";
import { requirePlatformRole } from "../../lib/access";
import { notFound } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { body } from "../../lib/validate";
import { clientIp } from "../after-event/helpers";
import { devClockService } from "./service";

const enabledOnly = createMiddleware<AppEnv>(async (_c, next) => {
  if (!env.DEV_CLOCK) throw notFound("Route inconnue");
  await next();
});

export const devClockRoutes = new Hono<AppEnv>()
  .use("/dev/clock", enabledOnly)
  .use("/dev/clock/*", enabledOnly)
  .get("/dev/clock", async (c) => {
    await requirePlatformRole(await requireUser(c), "super_admin");
    return c.json(await devClockService.status());
  })
  .get("/dev/clock/events", async (c) => {
    await requirePlatformRole(await requireUser(c), "super_admin");
    return c.json({ items: await devClockService.events() });
  })
  .post("/dev/clock/advance", async (c) => {
    const v = await requireUser(c);
    await requirePlatformRole(v, "super_admin");
    const input = await body(c, clockAdvanceInput);
    const result = await devClockService.advance(input, { updatedBy: v.profile.pseudo });
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "dev_clock.advance",
      targetType: "dev_clock",
      targetId: input.eventId ?? "1",
      reason: `${input.by ?? input.to ?? `${input.milestone} de l'événement ${input.eventId}`} → ${result.target}`,
      ip: clientIp((name) => c.req.header(name)),
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.json(result);
  })
  .post("/dev/clock/reset", async (c) => {
    const v = await requireUser(c);
    await requirePlatformRole(v, "super_admin");
    const result = await devClockService.reset({ updatedBy: v.profile.pseudo });
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "dev_clock.reset",
      targetType: "dev_clock",
      targetId: "1",
      reason: "retour à l'heure réelle",
      ip: clientIp((name) => c.req.header(name)),
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.json(result);
  });
