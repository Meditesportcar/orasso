// Administration minimale du lot 05 : journal des accès (la vérification des structures est dans `structures`).
import { pageQuery } from "@orasso/shared";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../../db/client";
import { adminAuditLog, profiles } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { decodeCursor, toPage } from "../../lib/pagination";
import { type AppEnv, requireUser } from "../../lib/session";
import { query } from "../../lib/validate";

export const adminRoutes = new Hono<AppEnv>().get("/admin/audit", async (c) => {
  await requirePlatformRole(await requireUser(c), "super_admin");
  const q = query(c, pageQuery);
  const cur = decodeCursor(q.cursor);
  const rows = await db
    .select({ log: adminAuditLog, pseudo: profiles.pseudo })
    .from(adminAuditLog)
    .leftJoin(profiles, eq(profiles.userId, adminAuditLog.actorUserId))
    .where(
      cur
        ? or(
            lt(adminAuditLog.createdAt, cur.createdAt),
            and(eq(adminAuditLog.createdAt, cur.createdAt), lt(adminAuditLog.id, cur.id)),
          )
        : undefined,
    )
    .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
    .limit(q.limit + 1);
  return c.json(
    toPage(
      rows.map((r) => ({ ...r.log, actorPseudo: r.pseudo })),
      q.limit,
      (r) => ({ ...r, createdAt: r.createdAt.toISOString() }),
    ),
  );
});
