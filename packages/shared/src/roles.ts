import { z } from "zod";

/**
 * Rôle d'un compte sur la plateforme. « Organisateur » n'en fait pas partie :
 * il découle de l'appartenance à une structure (propriétaire ou co-organisateur).
 */
export const platformRoles = ["user", "moderator", "super_admin"] as const;
export const platformRoleSchema = z.enum(platformRoles);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const platformRoleLabels: Record<PlatformRole, string> = {
  user: "Utilisateur",
  moderator: "Modérateur",
  super_admin: "Super administrateur",
};

/** Rôle interne d'un membre dans une structure. */
export const structureRoles = ["owner", "co_organizer", "staff"] as const;
export const structureRoleSchema = z.enum(structureRoles);
export type StructureRole = z.infer<typeof structureRoleSchema>;

export const structureRoleLabels: Record<StructureRole, string> = {
  owner: "Propriétaire",
  co_organizer: "Co-organisateur",
  staff: "Staff",
};

/** Rôles du staff, fixés par la structure et ajustables par événement. */
export const staffRoles = ["scan", "shop", "placement", "control", "filtering", "super_staff"] as const;
export const staffRoleSchema = z.enum(staffRoles);
export type StaffRole = z.infer<typeof staffRoleSchema>;
/**
 * Rôles qui pointent les entrées (scan, pointage manuel ou par plaque, accueil drive) et reçoivent les secrets des codes
 * tournants (relecture du lot 48) ; l'organisateur a tous les rôles.
 */
export const checkinStaffRoles: readonly StaffRole[] = ["scan", "control", "super_staff"];

export const staffRoleLabels: Record<StaffRole, string> = {
  scan: "Accueil et scan",
  shop: "Contrôle des billets",
  placement: "Placement",
  control: "Contrôle",
  filtering: "Filtration",
  super_staff: "Super staff",
};
