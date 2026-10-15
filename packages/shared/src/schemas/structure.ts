import { z } from "zod";
import { departmentSchema, type StructureKind, type StructureVerification, structureKinds } from "../enums";
import type { StaffRole, StructureRole } from "../roles";
import { staffRoleSchema } from "../roles";
import { optionalText } from "./common";

const socialsSchema = z
  .object({
    instagram: z.url().max(200).nullish(),
    facebook: z.url().max(200).nullish(),
    tiktok: z.url().max(200).nullish(),
    youtube: z.url().max(200).nullish(),
  })
  .partial();

export const structureCreateSchema = z.object({
  kind: z.enum(structureKinds),
  name: z.string().trim().min(2).max(80),
  description: optionalText(2000),
  addressLine: optionalText(200),
  postalCode: optionalText(10),
  city: optionalText(80),
  department: departmentSchema.nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  departments: z.array(departmentSchema).max(20).default([]),
  website: z.url().max(200).nullish(),
  socials: socialsSchema.default({}),
  siret: z
    .string()
    .regex(/^\d{14}$/)
    .nullish(),
  rna: z
    .string()
    .regex(/^W\d{9}$/)
    .nullish(),
});
export type StructureCreate = z.infer<typeof structureCreateSchema>;

export const structureUpdateSchema = structureCreateSchema.partial();
export type StructureUpdate = z.infer<typeof structureUpdateSchema>;

/** Invitation d'un membre par pseudo ou e-mail (le membre accepte ensuite). */
export const memberInviteSchema = z
  .object({
    pseudo: z.string().trim().min(3).max(24).optional(),
    email: z.email().optional(),
    role: z.enum(["co_organizer", "staff"]),
    staffRoles: z.array(staffRoleSchema).max(6).default([]),
    canDecide: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.pseudo) !== Boolean(v.email), { message: "Pseudo ou e-mail, l'un des deux" });
export type MemberInvite = z.infer<typeof memberInviteSchema>;

export const memberUpdateSchema = z
  .object({
    role: z.enum(["co_organizer", "staff"]),
    staffRoles: z.array(staffRoleSchema).max(6),
    canDecide: z.boolean(),
  })
  .partial();
export type MemberUpdate = z.infer<typeof memberUpdateSchema>;

export const banCreateSchema = z.object({ pseudo: z.string().trim().min(3).max(24), reason: optionalText(500) });

export const structureVerifySchema = z.object({ verified: z.boolean(), note: optionalText(500) });

export type StructurePublic = {
  id: string;
  slug: string;
  kind: StructureKind;
  name: string;
  logoUrl: string | null;
  description: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  department: string | null;
  lat: number | null;
  lng: number | null;
  departments: string[];
  website: string | null;
  socials: Record<string, string | null | undefined>;
  verified: boolean;
  followersCount: number;
  isFollowing?: boolean;
};

export type StructureOrganizer = StructurePublic & {
  verification: StructureVerification;
  verifiedAt: string | null;
  badgeExpiresAt: string | null;
  siret: string | null;
  rna: string | null;
  inviteToken: string;
  myRole: StructureRole | "super_admin";
};

export type StructureMember = {
  userId: string;
  pseudo: string;
  role: StructureRole;
  staffRoles: StaffRole[];
  canDecide: boolean;
  status: "invited" | "requested" | "active" | "removed";
  joinedAt: string | null;
};
