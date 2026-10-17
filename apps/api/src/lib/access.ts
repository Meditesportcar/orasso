// Droits : rôles de plateforme, rôles de structure, double authentification obligatoire (ARCHITECTURE.md § 5.2).
import { staffRoles as ALL_STAFF_ROLES, assistanceActive, type StaffRole, type StructureRole } from "@orasso/shared";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db/client";
import { adminAuditLog, assistanceRequests, eventStaff, passkey, structureMembers, structures } from "../db/schema";
import { env } from "../env";
import { isSecondFactor } from "../modules/security/passkey";
import { now } from "./deps";
import { AppError, forbidden } from "./errors";
import { requestContext } from "./request-context";
import type { Viewer } from "./session";

export const isSuperAdmin = (v: Viewer) => v.profile.platformRole === "super_admin";

/**
 * Double authentification prouvée par la **session** (lot 15, corrections des relectures) : session ouverte par une clé
 * d'accès vérifiée (`passkey`) ou par le code de l'application d'authentification / un code de secours / un appareil
 * de confiance (`totp`). L'état du compte (TOTP activé, clé enregistrée) ne suffit jamais : une session ouverte par
 * mot de passe avant l'activation, ou une future connexion Google / Apple, ne prouvent rien.
 */
export function hasSecondFactor(v: Viewer): boolean {
  return isSecondFactor(v.session?.secondFactor);
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

/** Demande d'aide ouverte de la structure et encore valable (7 jours au plus), lot 33. */
export async function openAssistanceRequest(structureId: string) {
  const [row] = await db
    .select({ id: assistanceRequests.id, status: assistanceRequests.status, createdAt: assistanceRequests.createdAt })
    .from(assistanceRequests)
    .where(and(eq(assistanceRequests.structureId, structureId), eq(assistanceRequests.status, "open")))
    .limit(1);
  return row && assistanceActive(row, now()) ? row : null;
}

/**
 * Organisateur de la structure (propriétaire ou co-organisateur), 2FA exigée.
 * Un super admin passe partout en lecture ; chaque passage est tracé (`structure.view_as`). Mode assistance (lot 33,
 * S41) : une écriture d'un super admin dans l'espace de la structure n'est permise que si la structure a une demande
 * d'aide ouverte ; elle est tracée (`structure.assist`) avec l'identifiant de la demande. Les routes `/api/admin/*`
 * (décisions de l'équipe, déjà tracées par elles-mêmes) ne sont pas concernées.
 */
export async function requireOrganizer(v: Viewer, structureId: string, ip?: string | null): Promise<OrganizerAccess> {
  const member = await activeMembership(v.user.id, structureId);
  if (member && (member.role === "owner" || member.role === "co_organizer")) {
    await assertTwoFactor(v);
    return { role: member.role };
  }
  if (isSuperAdmin(v)) {
    await assertTwoFactor(v);
    const req = requestContext.get();
    if (requestContext.isWrite() && req && !req.path.startsWith("/api/admin/")) {
      const open = await openAssistanceRequest(structureId);
      if (!open) {
        throw new AppError(
          403,
          "assistance_required",
          "Mode assistance : lecture seule. La structure doit demander l'aide d'Orasso pour qu'on intervienne.",
        );
      }
      // Une seule trace par requête, écrite après la réponse si l'écriture a réussi (`requestContextMiddleware`).
      requestContext.noteAssist({ actorUserId: v.user.id, structureId, assistanceRequestId: open.id });
      return { role: "super_admin" };
    }
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "structure.view_as",
      targetType: "structure",
      targetId: structureId,
      structureId,
      ip: ip ?? req?.ip ?? null,
    });
    return { role: "super_admin" };
  }
  throw forbidden("Réservé aux organisateurs de la structure");
}

/**
 * Écriture d'organisateur (lot 27, S31) : comme `requireOrganizer`, mais refusée à une structure suspendue (badge échu
 * ou décision de l'équipe). Restent permis : tout ce qui se lit, le tri, l'accueil et le jour J des événements déjà
 * publiés, le staff de ces événements, Maintenu / Incertain et l'annulation (sécurité des inscrits), l'export tracé.
 */
export async function requireOrganizerWrite(
  v: Viewer,
  structureId: string,
  ip?: string | null,
): Promise<OrganizerAccess> {
  const access = await requireOrganizer(v, structureId, ip);
  const [s] = await db
    .select({ verification: structures.verification })
    .from(structures)
    .where(eq(structures.id, structureId));
  if (s?.verification === "suspended") {
    throw forbidden("Structure suspendue : lecture seule. Écris à l'équipe Orasso pour la rétablir.");
  }
  return access;
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
