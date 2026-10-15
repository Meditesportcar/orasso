// Droits : rôles de plateforme, rôles de structure, double authentification obligatoire (ARCHITECTURE.md § 5.2).
import type { StaffRole, StructureRole } from "@orasso/shared";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db/client";
import { adminAuditLog, structureMembers } from "../db/schema";
import { env } from "../env";
import { AppError, forbidden } from "./errors";
import type { Viewer } from "./session";

export const isSuperAdmin = (v: Viewer) => v.profile.platformRole === "super_admin";

/** 2FA activée, ou contournement explicite de développement (`DEV_SKIP_2FA`, refusé en production). */
function assertTwoFactor(v: Viewer) {
  if (env.DEV_SKIP_2FA || v.user.twoFactorEnabled) return;
  throw new AppError(403, "two_factor_required", "Double authentification obligatoire pour cet espace");
}

export async function activeMembership(userId: string, structureId: string) {
  return db.query.structureMembers.findFirst({
    where: and(
      eq(structureMembers.structureId, structureId),
      eq(structureMembers.userId, userId),
      eq(structureMembers.status, "active"),
    ),
  });
}

export type OrganizerAccess = { role: StructureRole | "super_admin" };

/**
 * Organisateur de la structure (propriétaire ou co-organisateur), 2FA exigée.
 * Un super admin passe partout ; chaque passage est tracé (`structure.view_as`).
 */
export async function requireOrganizer(v: Viewer, structureId: string, ip?: string | null): Promise<OrganizerAccess> {
  const member = await activeMembership(v.user.id, structureId);
  if (member && (member.role === "owner" || member.role === "co_organizer")) {
    assertTwoFactor(v);
    return { role: member.role };
  }
  if (isSuperAdmin(v)) {
    assertTwoFactor(v);
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "structure.view_as",
      targetType: "structure",
      targetId: structureId,
      structureId,
      ip: ip ?? null,
    });
    return { role: "super_admin" };
  }
  throw forbidden("Réservé aux organisateurs de la structure");
}

export async function requirePlatformRole(v: Viewer, role: "moderator" | "super_admin") {
  const ok = role === "moderator" ? v.profile.platformRole !== "user" : v.profile.platformRole === "super_admin";
  if (!ok) throw forbidden("Réservé à l'administration");
  assertTwoFactor(v);
}

/** Organisateur, ou staff actif ayant l'un des rôles demandés (rôles fixés au niveau de la structure). */
export async function staffAccess(
  v: Viewer,
  structureId: string,
  staffRoles: StaffRole[],
): Promise<{ organizer: boolean; canDecide: boolean } | null> {
  const member = await activeMembership(v.user.id, structureId);
  if (member && (member.role === "owner" || member.role === "co_organizer")) {
    assertTwoFactor(v);
    return { organizer: true, canDecide: true };
  }
  if (member?.role === "staff" && member.staffRoles.some((r) => staffRoles.includes(r as StaffRole))) {
    return { organizer: false, canDecide: member.canDecide };
  }
  if (isSuperAdmin(v)) {
    await requireOrganizer(v, structureId);
    return { organizer: true, canDecide: true };
  }
  return null;
}

/** La double authentification est exigée mais pas encore activée (affiché dans `GET /me`). */
export async function twoFactorRequired(v: Viewer): Promise<boolean> {
  if (v.user.twoFactorEnabled) return false;
  if (v.profile.platformRole !== "user") return true;
  const organizer = await db.query.structureMembers.findFirst({
    where: and(
      eq(structureMembers.userId, v.user.id),
      eq(structureMembers.status, "active"),
      inArray(structureMembers.role, ["owner", "co_organizer"]),
    ),
    columns: { id: true },
  });
  return Boolean(organizer);
}
