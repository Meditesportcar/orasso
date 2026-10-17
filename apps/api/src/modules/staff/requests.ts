// Devenir staff (lot 24, ARCHITECTURE-SUITE § 8.1) : demande d'un utilisateur à une structure vérifiée, réponse de
// l'organisation, invitations de l'organisation. Une seule ligne `structure_members` par personne et par structure
// (unicité en base) ; toute décision se prend sous verrou, la file d'attente est bornée et une personne dont la
// demande ou l'invitation vient d'être refusée n'est pas relancée tout de suite.
import {
  STAFF_PENDING_MAX,
  STAFF_REQUEST_COOLDOWN_MS,
  type StaffInvitationView,
  type StaffRequestAccept,
  type StaffRole,
  staffRequestLabels,
} from "@orasso/shared";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { profiles, structureBans, structureMembers, structures } from "../../db/schema";
import { requireOrganizer } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { staffChatsService } from "../communication/staff-chats";
import { inboxService, registerInboxCounter } from "../messaging/inbox";
import { notificationsService } from "../notifications/service";
import { structureById } from "../structures/service";

type MemberRow = typeof structureMembers.$inferSelect;

const lockStructureStaff = (tx: Tx, structureId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`staff-requests:${structureId}`}, 0))`);

/** Propriétaire et co-organisateurs actifs (ceux qui reçoivent les demandes). */
async function organizersOf(ex: Executor, structureId: string): Promise<string[]> {
  const rows = await ex
    .select({ userId: structureMembers.userId })
    .from(structureMembers)
    .where(
      and(
        eq(structureMembers.structureId, structureId),
        eq(structureMembers.status, "active"),
        inArray(structureMembers.role, ["owner", "co_organizer"]),
      ),
    );
  return rows.map((r) => r.userId);
}

/** Demandes et invitations en attente d'une structure. */
async function pendingTotal(ex: Executor, structureId: string): Promise<number> {
  const [row] = await ex
    .select({ n: count() })
    .from(structureMembers)
    .where(
      and(eq(structureMembers.structureId, structureId), inArray(structureMembers.status, ["requested", "invited"])),
    );
  return row?.n ?? 0;
}

/**
 * Une ligne `removed` qui n'a jamais été active (demande ou invitation refusée, ou retirée) est récente : la même
 * paire ne se relance pas avant 24 h. Un ancien membre retiré peut en revanche redemander tout de suite.
 */
export function recentlyDeclined(row: Pick<MemberRow, "status" | "joinedAt" | "updatedAt">): boolean {
  return (
    row.status === "removed" &&
    row.joinedAt === null &&
    now().getTime() - row.updatedAt.getTime() < STAFF_REQUEST_COOLDOWN_MS
  );
}

export const staffRequestsService = {
  /** Verrou consultatif des demandes et invitations d'une structure (jusqu'à la fin de la transaction). */
  lockStructure: lockStructureStaff,

  /** Demandes reçues, en attente de réponse (pastille de la Boîte de l'organisateur et de sa casquette). */
  async pendingRequests(structureId: string, ex: Executor = db): Promise<number> {
    const [row] = await ex
      .select({ n: count() })
      .from(structureMembers)
      .where(and(eq(structureMembers.structureId, structureId), eq(structureMembers.status, "requested")));
    return row?.n ?? 0;
  },

  /** Invitations reçues par la personne (à accepter depuis sa Boîte). */
  async pendingInvitations(userId: string, ex: Executor = db): Promise<number> {
    const [row] = await ex
      .select({ n: count() })
      .from(structureMembers)
      .where(and(eq(structureMembers.userId, userId), eq(structureMembers.status, "invited")));
    return row?.n ?? 0;
  },

  /** `GET /me/staff-invitations` : mes invitations en attente (structure, rôle proposé, qui m'invite). */
  async myInvitations(v: Viewer): Promise<StaffInvitationView[]> {
    const rows = await db
      .select({ m: structureMembers, s: structures, inviter: profiles.pseudo })
      .from(structureMembers)
      .innerJoin(structures, eq(structures.id, structureMembers.structureId))
      .leftJoin(profiles, eq(profiles.userId, structureMembers.invitedBy))
      .where(
        and(
          eq(structureMembers.userId, v.user.id),
          eq(structureMembers.status, "invited"),
          isNull(structures.deletedAt),
        ),
      )
      .orderBy(desc(structureMembers.updatedAt));
    return rows.map(({ m, s, inviter }) => ({
      structureId: s.id,
      structureSlug: s.slug,
      structureName: s.name,
      logoUrl: storage.url(s.logoKey),
      role: m.role === "co_organizer" ? "co_organizer" : "staff",
      staffRoles: m.staffRoles as StaffRole[],
      invitedBy: inviter,
      invitedAt: m.updatedAt.toISOString(),
    }));
  },

  /**
   * `POST /structures/:id/staff-requests` : un utilisateur demande à rejoindre le staff d'une structure vérifiée.
   * Répéter la demande en cours est sans effet (pas de seconde notification) ; un refus récent bloque 24 h ; la file
   * d'une structure est bornée.
   */
  async request(v: Viewer, structureId: string, message: string | null | undefined): Promise<{ status: "requested" }> {
    rateLimit("staffRequest", v.user.id);
    const structure = await structureById(structureId);
    if (structure.verification !== "verified") throw notFound("Structure introuvable");
    const banned = await db.query.structureBans.findFirst({
      where: and(eq(structureBans.structureId, structureId), eq(structureBans.userId, v.user.id)),
    });
    if (banned) throw forbidden(staffRequestLabels.banned);
    await withTx(async (tx, after) => {
      await lockStructureStaff(tx, structureId);
      const existing = await tx.query.structureMembers.findFirst({
        where: and(eq(structureMembers.structureId, structureId), eq(structureMembers.userId, v.user.id)),
      });
      if (existing?.status === "active") throw conflict("conflict", staffRequestLabels.alreadyMember);
      if (existing?.status === "invited") {
        throw conflict("conflict", "Cette structure t'a déjà invité : accepte l'invitation depuis ta Boîte.");
      }
      if (existing?.status === "requested") return;
      if (existing && recentlyDeclined(existing)) throw conflict("conflict", staffRequestLabels.cooldown);
      if ((await pendingTotal(tx, structureId)) >= STAFF_PENDING_MAX) {
        throw conflict("conflict", staffRequestLabels.tooMany);
      }
      const values = {
        role: "staff" as const,
        staffRoles: [] as string[],
        canDecide: false,
        status: "requested" as const,
        invitedBy: null,
        joinedAt: null,
      };
      if (existing) await tx.update(structureMembers).set(values).where(eq(structureMembers.id, existing.id));
      else await tx.insert(structureMembers).values({ structureId, userId: v.user.id, ...values });
      const organizers = await organizersOf(tx, structureId);
      const note = message?.trim();
      for (const userId of organizers) {
        await notificationsService.notify(tx, userId, "staff_request", {
          title: "Demande pour rejoindre le staff",
          body: `${v.profile.pseudo} voudrait rejoindre le staff de « ${structure.name} »${note ? ` : « ${note} »` : "."}`,
          data: { structureId, screen: "staff-requests" },
          link: { label: "Répondre", path: `/orga/${structure.slug}/staff` },
        });
      }
      after(() => {
        for (const userId of organizers) inboxService.publish(userId);
        notificationsService.kick();
      });
    });
    return { status: "requested" };
  },

  /** `POST /structures/:id/members/:userId/accept` : l'organisation accepte une demande (rôles donnés d'emblée). */
  async accept(v: Viewer, structureId: string, userId: string, input: StaffRequestAccept): Promise<void> {
    await requireOrganizer(v, structureId);
    const structure = await structureById(structureId);
    // Structure suspendue : plus de recrutement (ses événements publiés continuent avec le staff déjà en place).
    if (structure.verification === "suspended") throw forbidden("Cette structure est suspendue.");
    await withTx(async (tx, after) => {
      await lockStructureStaff(tx, structureId);
      const [row] = await tx
        .update(structureMembers)
        .set({
          status: "active",
          staffRoles: input.staffRoles,
          canDecide: input.canDecide,
          joinedAt: now(),
          invitedBy: v.user.id,
        })
        .where(
          and(
            eq(structureMembers.structureId, structureId),
            eq(structureMembers.userId, userId),
            eq(structureMembers.role, "staff"),
            eq(structureMembers.status, "requested"),
          ),
        )
        .returning();
      if (!row) throw notFound("Demande introuvable");
      await notificationsService.notify(tx, userId, "staff_request_accepted", {
        title: "Demande de staff acceptée",
        body: `« ${structure.name} » t'a accepté dans son staff. Ton accès et tes rôles sont dans l'onglet Accès.`,
        data: { structureId, screen: "acces" },
        link: { label: "Ouvrir mon accès", path: "/app/acces" },
      });
      after(() => {
        inboxService.publish(userId);
        notificationsService.kick();
      });
    });
    // Discussions du staff (lot 20) : participants à jour.
    await staffChatsService.syncStructure(structureId);
  },

  /** `POST /structures/:id/members/:userId/decline` : l'organisation refuse (la ligne est conservée pour le délai). */
  async decline(v: Viewer, structureId: string, userId: string): Promise<void> {
    await requireOrganizer(v, structureId);
    await withTx(async (tx) => {
      await lockStructureStaff(tx, structureId);
      const [row] = await tx
        .update(structureMembers)
        // Heure de l'appli (et non celle de la base) : le délai de 24 h se compare à `now()`.
        .set({ status: "removed", joinedAt: null, updatedAt: now() })
        .where(
          and(
            eq(structureMembers.structureId, structureId),
            eq(structureMembers.userId, userId),
            eq(structureMembers.role, "staff"),
            eq(structureMembers.status, "requested"),
          ),
        )
        .returning();
      if (!row) throw notFound("Demande introuvable");
    });
  },

  /**
   * Avant d'inviter (`structuresService.invite`) : la file est bornée, une invitation refusée récemment n'est pas
   * renvoyée, 30 invitations par jour et par organisateur.
   */
  async beforeInvite(tx: Tx, structureId: string, existing: MemberRow | undefined): Promise<void> {
    await lockStructureStaff(tx, structureId);
    if (existing && recentlyDeclined(existing)) {
      throw new AppError(409, "conflict", "Cette personne a refusé récemment : réessaie demain.");
    }
    if ((await pendingTotal(tx, structureId)) >= STAFF_PENDING_MAX) {
      throw conflict("conflict", staffRequestLabels.tooMany);
    }
  },
};

// Pastille de la Boîte de l'utilisateur : invitations à rejoindre une structure. (La pastille de la casquette d'une
// structure compte déjà les demandes de staff : `registerOrganizerBadge` de `communication/inbox.ts`, lot 22 ; ne pas
// la déclarer une seconde fois ici, les demandes seraient comptées deux fois.)
registerInboxCounter("staffInvitation", (userId, ex) => staffRequestsService.pendingInvitations(userId, ex));
