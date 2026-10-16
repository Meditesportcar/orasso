// Droits : rôles de plateforme, rôles de structure, double authentification obligatoire (ARCHITECTURE.md § 5.2).
import { staffRoles as ALL_STAFF_ROLES, type StaffRole, type StructureRole } from "@orasso/shared";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db/client";
import { adminAuditLog, eventStaff, passkey, structureMembers } from "../db/schema";
import { env } from "../env";
import { AppError, forbidden } from "./errors";
import type { Viewer } from "./session";

export const isSuperAdmin = (v: Viewer) => v.profile.platformRole === "super_admin";

/**
 * Double authentification prouvée par la session (lot 15, corrections après relecture) : TOTP activé (Better Auth exige
 * alors le code à chaque connexion par mot de passe) **ou** session ouverte par une clé d'accès vérifiée. Une clé
 * enregistrée sur le compte ne suffit pas : une connexion par mot de passe seul ne la prouve pas.
 */
export function hasSecondFactor(v: Viewer): boolean {
  return Boolean(v.user.twoFactorEnabled) || v.session?.secondFactor === "passkey";
}

/** Le compte a-t-il au moins une clé d'accès (pour dire « reconnecte-toi avec ta clé ») ? */
export async function hasPasskey(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: passkey.id }).from(passkey).where(eq(passkey.userId, userId)).limit(1);
  return Boolean(row);
}

/** 2FA (TOTP ou clé d'accès), ou contournement explicite de développement (`DEV_SKIP_2FA`, refusé en production). */
async function assertTwoFactor(v: Viewer) {
  if (env.DEV_SKIP_2FA || hasSecondFactor(v)) return;
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

/** Acteur du journal des transitions pour un organisateur ou un super admin. */
export const organizerActor = (a: OrganizerAccess): "admin" | "organizer" =>
  a.role === "super_admin" ? "admin" : "organizer";

/**
 * Organisateur de la structure (propriétaire ou co-organisateur), 2FA exigée.
 * Un super admin passe partout ; chaque passage est tracé (`structure.view_as`).
 */
export async function requireOrganizer(v: Viewer, structureId: string, ip?: string | null): Promise<OrganizerAccess> {
  const member = await activeMembership(v.user.id, structureId);
  if (member && (member.role === "owner" || member.role === "co_organizer")) {
    await assertTwoFactor(v);
    return { role: member.role };
  }
  if (isSuperAdmin(v)) {
    await assertTwoFactor(v);
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
  await assertTwoFactor(v);
}

export type StaffAccess = { actor: "organizer" | "admin" | "staff"; canDecide: boolean; roles: StaffRole[] };

/**
 * Organisateur, ou staff actif ayant l'un des rôles demandés. Avec `eventId`, les rôles et le droit de trancher
 * ajustés pour l'événement (`event_staff`, lot 06) remplacent ceux de la structure. `null` si aucun droit.
 */
export async function staffAccess(
  v: Viewer,
  structureId: string,
  staffRoles: readonly StaffRole[],
  eventId?: string,
): Promise<StaffAccess | null> {
  const member = await activeMembership(v.user.id, structureId);
  if (member && (member.role === "owner" || member.role === "co_organizer")) {
    await assertTwoFactor(v);
    return { actor: "organizer", canDecide: true, roles: [...ALL_STAFF_ROLES] };
  }
  if (member?.role === "staff") {
    const perEvent = eventId
      ? await db.query.eventStaff.findFirst({
          where: and(eq(eventStaff.eventId, eventId), eq(eventStaff.userId, v.user.id)),
        })
      : undefined;
    const roles = (perEvent?.roles ?? member.staffRoles).filter((r): r is StaffRole =>
      (ALL_STAFF_ROLES as readonly string[]).includes(r),
    );
    if (roles.some((r) => staffRoles.includes(r))) {
      return { actor: "staff", canDecide: perEvent?.canDecide ?? member.canDecide, roles };
    }
  }
  if (isSuperAdmin(v)) {
    await requireOrganizer(v, structureId);
    return { actor: "admin", canDecide: true, roles: [...ALL_STAFF_ROLES] };
  }
  return null;
}

/** La double authentification est exigée mais pas encore activée (affiché dans `GET /me`). */
export async function twoFactorRequired(v: Viewer): Promise<boolean> {
  if (hasSecondFactor(v)) return false;
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
