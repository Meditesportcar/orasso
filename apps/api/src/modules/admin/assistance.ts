// Mode assistance (lot 33, S41, docs/01 « Administration et rôles ») : un super admin survole l'espace d'une structure en
// lecture seule ; il n'y écrit que si la structure a demandé l'aide d'Orasso (demande ouverte, 7 jours au plus).
// Le garde est dans `requireOrganizer` (lib/access) ; ici : demandes, état du bandeau, clôture, file de l'équipe et
// clôture automatique (tâche `assistance.auto-close`, idempotente).
import {
  ASSISTANCE_MAX_MS,
  type AssistanceRequestView,
  type AssistanceState,
  assistanceActive,
  assistanceExpiresAt,
} from "@orasso/shared";
import { and, count, desc, eq, inArray, lte, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../../db/client";
import { adminAuditLog, assistanceRequests, profiles, structures } from "../../db/schema";
import { activeMembership, isSuperAdmin, requireOrganizer, requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, forbidden, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { audit } from "./audit";

type Row = typeof assistanceRequests.$inferSelect;

const requester = alias(profiles, "requester");
const closer = alias(profiles, "closer");

async function views(where: SQL | undefined, limit = 100): Promise<AssistanceRequestView[]> {
  const rows = await db
    .select({ r: assistanceRequests, s: structures, by: requester.pseudo, closedByPseudo: closer.pseudo })
    .from(assistanceRequests)
    .innerJoin(structures, eq(structures.id, assistanceRequests.structureId))
    .leftJoin(requester, eq(requester.userId, assistanceRequests.requestedBy))
    .leftJoin(closer, eq(closer.userId, assistanceRequests.closedBy))
    .where(where)
    .orderBy(desc(assistanceRequests.createdAt))
    .limit(limit);
  const ids = rows.map((r) => r.r.id);
  const counts = ids.length
    ? await db
        .select({ id: adminAuditLog.assistanceRequestId, n: count() })
        .from(adminAuditLog)
        .where(and(inArray(adminAuditLog.assistanceRequestId, ids), eq(adminAuditLog.action, "structure.assist")))
        .groupBy(adminAuditLog.assistanceRequestId)
    : [];
  const n = new Map(counts.map((c) => [c.id, c.n]));
  return rows.map(({ r, s, by, closedByPseudo }) => ({
    id: r.id,
    structure: { id: s.id, slug: s.slug, name: s.name },
    requestedBy: r.requestedBy && by ? { id: r.requestedBy, pseudo: by } : null,
    message: r.message,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    expiresAt: assistanceExpiresAt(r.createdAt).toISOString(),
    closedAt: r.closedAt?.toISOString() ?? null,
    closedBy: r.closedBy && closedByPseudo ? { id: r.closedBy, pseudo: closedByPseudo } : null,
    closeReason: r.closeReason,
    interventions: n.get(r.id) ?? 0,
  }));
}

/** Organisateur (propriétaire ou co-organisateur) membre de la structure, 2FA exigée ; jamais le survol d'un admin. */
async function requireMemberOrganizer(v: Viewer, structureId: string) {
  const member = await activeMembership(v.user.id, structureId);
  if (!member || (member.role !== "owner" && member.role !== "co_organizer")) {
    throw forbidden("Réservé aux organisateurs de la structure");
  }
  await requireOrganizer(v, structureId);
}

async function superAdmins(): Promise<string[]> {
  const rows = await db.select({ id: profiles.userId }).from(profiles).where(eq(profiles.platformRole, "super_admin"));
  return rows.map((r) => r.id);
}

export const assistanceService = {
  /** `POST /structures/:id/assistance-requests {message}` (organisateur) : « Demander l'aide d'Orasso ». */
  async create(v: Viewer, structureId: string, message: string): Promise<AssistanceRequestView> {
    await requireMemberOrganizer(v, structureId);
    const id = await withTx(async (tx, after) => {
      const [s] = await tx.select().from(structures).where(eq(structures.id, structureId));
      if (!s || s.deletedAt) throw notFound("Structure introuvable");
      // Une demande ouverte mais échue (tâche pas encore passée) est close d'abord.
      await tx
        .update(assistanceRequests)
        .set({ status: "closed", closedAt: now(), closeReason: "expired" })
        .where(
          and(
            eq(assistanceRequests.structureId, structureId),
            eq(assistanceRequests.status, "open"),
            lte(assistanceRequests.createdAt, new Date(now().getTime() - ASSISTANCE_MAX_MS)),
          ),
        );
      const [row] = await tx
        .insert(assistanceRequests)
        .values({ structureId, requestedBy: v.user.id, message, createdAt: now(), updatedAt: now() })
        .onConflictDoNothing()
        .returning();
      if (!row) throw conflict("conflict", "Une demande d'aide est déjà ouverte pour cette structure.");
      await audit(tx, v, {
        action: "assistance.request",
        targetType: "structure",
        targetId: structureId,
        structureId,
        assistanceRequestId: row.id,
        reason: message.slice(0, 300),
      });
      for (const adminId of await superAdmins()) {
        await notificationsService.notify(tx, adminId, "assistance_requested", {
          title: `Demande d'aide · ${s.name}`,
          body: message.slice(0, 200),
          link: { label: "Ouvrir les demandes d'aide", path: "/admin/assistance" },
          data: { structureId, assistanceRequestId: row.id },
        });
      }
      after(() => notificationsService.kick());
      return row.id;
    });
    const [view] = await views(eq(assistanceRequests.id, id), 1);
    if (!view) throw notFound("Demande introuvable");
    return view;
  },

  /**
   * `GET /structures/:id/assistance` : la demande en cours et l'historique pour la structure ; pour un super admin qui
   * survole, le mode du bandeau (« lecture seule » ou « intervention en cours »).
   */
  async state(v: Viewer, structureId: string): Promise<AssistanceState> {
    const access = await requireOrganizer(v, structureId);
    const all = await views(eq(assistanceRequests.structureId, structureId), 20);
    const t = now();
    const current =
      all.find((r) => assistanceActive({ status: r.status, createdAt: new Date(r.createdAt) }, t)) ?? null;
    return {
      mode: access.role === "super_admin" ? (current ? "intervention" : "read_only") : null,
      current,
      history: all.filter((r) => r.id !== current?.id),
    };
  },

  /**
   * `POST /assistance-requests/:id/close` : par un organisateur de la structure (ou le super admin). L'autre côté est
   * prévenu ; rien ne se passe si la demande est déjà close.
   */
  async close(v: Viewer, id: string): Promise<AssistanceRequestView> {
    const [req] = await db.select().from(assistanceRequests).where(eq(assistanceRequests.id, id));
    if (!req) throw notFound("Demande introuvable");
    const admin = isSuperAdmin(v);
    if (admin) await requirePlatformRole(v, "super_admin");
    else await requireMemberOrganizer(v, req.structureId);
    await withTx(async (tx, after) => {
      const [locked] = await tx.select().from(assistanceRequests).where(eq(assistanceRequests.id, id)).for("update");
      if (locked?.status !== "open") return;
      await tx
        .update(assistanceRequests)
        .set({ status: "closed", closedAt: now(), closedBy: v.user.id, closeReason: admin ? "admin" : "organizer" })
        .where(eq(assistanceRequests.id, id));
      await audit(tx, v, {
        action: "assistance.close",
        targetType: "structure",
        targetId: locked.structureId,
        structureId: locked.structureId,
        assistanceRequestId: id,
        reason: admin ? "Close par l'équipe Orasso" : "Close par la structure",
      });
      await notifyClosed(tx, locked, admin ? "admin" : "organizer", v.user.id);
      after(() => notificationsService.kick());
    });
    const [view] = await views(eq(assistanceRequests.id, id), 1);
    if (!view) throw notFound("Demande introuvable");
    return view;
  },

  /** `POST /admin/assistance-requests/:id/close` : le rôle est vérifié avant de chercher la demande. */
  async adminClose(v: Viewer, id: string): Promise<AssistanceRequestView> {
    await requirePlatformRole(v, "super_admin");
    return this.close(v, id);
  },

  /** `GET /admin/assistance-requests?status=` (super admin). */
  async adminList(v: Viewer, status: "open" | "closed" | "all"): Promise<AssistanceRequestView[]> {
    await requirePlatformRole(v, "super_admin");
    return views(status === "all" ? undefined : eq(assistanceRequests.status, status), 200);
  },

  /** Tâche `assistance.auto-close` (chaque heure) : demandes ouvertes depuis 7 jours, closes. Idempotente. */
  async autoClose(): Promise<number> {
    const limit = new Date(now().getTime() - ASSISTANCE_MAX_MS);
    return withTx(async (tx, after) => {
      const closed = await tx
        .update(assistanceRequests)
        .set({ status: "closed", closedAt: now(), closeReason: "expired" })
        .where(and(eq(assistanceRequests.status, "open"), lte(assistanceRequests.createdAt, limit)))
        .returning();
      for (const r of closed) await notifyClosed(tx, r, "expired", null);
      if (closed.length) after(() => notificationsService.kick());
      return closed.length;
    });
  },
};

async function notifyClosed(tx: Tx, r: Row, reason: "organizer" | "admin" | "expired", by: string | null) {
  const [s] = await tx
    .select({ name: structures.name, slug: structures.slug })
    .from(structures)
    .where(eq(structures.id, r.structureId));
  const body =
    reason === "expired"
      ? "La demande d'aide est close automatiquement au bout de 7 jours."
      : reason === "admin"
        ? "L'équipe Orasso a clos la demande d'aide."
        : "La structure a clos sa demande d'aide.";
  const recipients =
    reason === "organizer" ? await superAdmins() : r.requestedBy && r.requestedBy !== by ? [r.requestedBy] : [];
  for (const userId of recipients) {
    if (userId === by) continue;
    await notificationsService.notify(tx, userId, "assistance_closed", {
      title: `Demande d'aide close · ${s?.name ?? ""}`,
      body,
      link:
        reason === "organizer"
          ? { label: "Ouvrir les demandes d'aide", path: "/admin/assistance" }
          : { label: "Ouvrir la structure", path: `/orga/${s?.slug ?? ""}/structure` },
      data: { structureId: r.structureId, assistanceRequestId: r.id },
    });
  }
}
