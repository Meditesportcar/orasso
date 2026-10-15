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
export const staffRoles = ["scan", "shop", "placement", "control", "filtration", "super_staff"] as const;
export const staffRoleSchema = z.enum(staffRoles);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const staffRoleLabels: Record<StaffRole, string> = {
  scan: "Scan accueil",
  shop: "Boutique",
  placement: "Placement",
  control: "Contrôle",
  filtration: "Filtration",
  super_staff: "Super staff",
};
