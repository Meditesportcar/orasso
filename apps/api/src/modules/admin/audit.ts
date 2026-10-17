// Journal d'administration (lot 33) : une ligne par action de l'équipe qui touche un compte, une structure ou un
// réglage, avec le motif, l'acteur, l'adresse et l'appareil (contexte de la requête). Lecture filtrée et paginée.
import type { AdminAuditRow } from "@orasso/shared";
import { and, desc, eq, gte, like, lt, lte, or, type SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { adminAuditLog, profiles } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { decodeCursor, escapeLike, toPage } from "../../lib/pagination";
import { requestContext } from "../../lib/request-context";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";

export type AuditEntry = {
  action: string;
  targetType: string;
  targetId: string;
  structureId?: string | null;
  assistanceRequestId?: string | null;
  reason?: string | null;
};

export async function audit(ex: Executor, v: Viewer, entry: AuditEntry) {
  const req = requestContext.get();
  await ex.insert(adminAuditLog).values({
    actorUserId: v.user.id,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    structureId: entry.structureId ?? null,
    assistanceRequestId: entry.assistanceRequestId ?? null,
    reason: entry.reason ?? null,
    ip: req?.ip ?? null,
    userAgent: req?.userAgent ?? null,
  });
}

export type AuditFilter = {
  action?: string;
  actor?: string;
  structure?: string;
  target?: string;
  from?: Date;
  to?: Date;
  limit: number;
  cursor?: string;
};

export const auditService = {
  /** `GET /admin/audit?action=&actor=&structure=&target=&from=&to=` (super admin), du plus récent au plus ancien. */
  async list(v: Viewer, f: AuditFilter) {
    await requirePlatformRole(v, "super_admin");
    const cur = decodeCursor(f.cursor);
    const where: (SQL | undefined)[] = [];
    if (f.action) {
      // « structure. » = toutes les actions de la famille ; sinon l'action exacte.
      where.push(
        f.action.endsWith(".")
          ? like(adminAuditLog.action, `${escapeLike(f.action)}%`)
          : eq(adminAuditLog.action, f.action),
      );
    }
    if (f.actor) {
      // Identifiant du compte, ou pseudo exact.
      const byPseudo = await db.query.profiles.findFirst({
        where: eq(profiles.pseudo, f.actor),
        columns: { userId: true },
      });
      where.push(eq(adminAuditLog.actorUserId, byPseudo?.userId ?? f.actor));
    }
    if (f.structure) where.push(eq(adminAuditLog.structureId, f.structure));
    if (f.target) where.push(eq(adminAuditLog.targetId, f.target));
    if (f.from) where.push(gte(adminAuditLog.createdAt, f.from));
    if (f.to) where.push(lte(adminAuditLog.createdAt, f.to));
    if (cur) {
      where.push(
        or(
          lt(adminAuditLog.createdAt, cur.createdAt),
          and(eq(adminAuditLog.createdAt, cur.createdAt), lt(adminAuditLog.id, cur.id)),
        ),
      );
    }
    const rows = await db
      .select({ log: adminAuditLog, pseudo: profiles.pseudo })
      .from(adminAuditLog)
      .leftJoin(profiles, eq(profiles.userId, adminAuditLog.actorUserId))
      .where(and(...where))
      .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
      .limit(f.limit + 1);
    return toPage(
      rows.map((r) => ({ ...r.log, actorPseudo: r.pseudo })),
      f.limit,
      (r): AdminAuditRow => ({
        id: r.id,
        action: r.action,
        actorUserId: r.actorUserId,
        actorPseudo: r.actorPseudo,
        targetType: r.targetType,
        targetId: r.targetId,
        structureId: r.structureId,
        assistanceRequestId: r.assistanceRequestId,
        reason: r.reason,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      }),
    );
  },
};
