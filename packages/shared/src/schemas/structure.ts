import { z } from "zod";
import {
  departmentSchema,
  type StructureKind,
  type StructureSuspensionReason,
  type StructureVerification,
  structureKinds,
  type VerificationDocumentKind,
  verificationDocumentKinds,
} from "../enums";
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

const structureFields = z.object({
  kind: z.enum(structureKinds),
  name: z.string().trim().min(2).max(80),
  description: optionalText(2000),
  addressLine: optionalText(200),
  postalCode: optionalText(10),
  city: optionalText(80),
  department: departmentSchema.nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  departments: z.array(departmentSchema).max(20),
  website: z.url().max(200).nullish(),
  socials: socialsSchema,
  siret: z
    .string()
    .regex(/^\d{14}$/)
    .nullish(),
  rna: z
    .string()
    .regex(/^W\d{9}$/)
    .nullish(),
});
/** Défauts à la création seulement (voir eventCreateSchema). */
export const structureCreateSchema = structureFields.extend({
  departments: structureFields.shape.departments.default([]),
  socials: structureFields.shape.socials.default({}),
});
export type StructureCreate = z.infer<typeof structureCreateSchema>;

export const structureUpdateSchema = structureFields.partial();
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

// --- Vérification (lot 13) -----------------------------------------------------------------------------------

/** Résultat du contrôle automatique SIRET / RNA dans les registres publics (API Recherche d'entreprises). */
export type RegistryCheck = {
  checkedAt: string;
  source: "siret" | "rna";
  query: string;
  /** `matched` : trouvé et actif ; `closed` : établissement fermé ; `not_found` ; `unavailable` : registre injoignable. */
  status: "matched" | "closed" | "not_found" | "unavailable";
  name: string | null;
  siren: string | null;
  siret: string | null;
  rna: string | null;
  /** Nature juridique d'association : signale une structure « association » qui n'en est pas une. */
  isAssociation: boolean;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  department: string | null;
};

export const registryCheckInputSchema = z.object({ number: z.string().trim().min(9).max(20) });

export const verificationDocumentKindSchema = z.enum(verificationDocumentKinds);

export type VerificationDocument = {
  id: string;
  kind: VerificationDocumentKind;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

/** Vue de la vérification pour l'organisateur (`GET /structures/:id/verification`). */
export type StructureVerificationView = {
  verification: StructureVerification;
  verifiedAt: string | null;
  badgeExpiresAt: string | null;
  siret: string | null;
  rna: string | null;
  registryCheck: RegistryCheck | null;
  documents: VerificationDocument[];
  canSubmit: boolean;
  /** Pourquoi on ne peut pas encore envoyer (message affiché). */
  submitBlockedReason: string | null;
};

/** Une structure dans la file de l'administration. */
export type AdminStructureRow = {
  id: string;
  slug: string;
  name: string;
  kind: StructureKind;
  verification: StructureVerification;
  createdAt: string;
  owner: { pseudo: string; email: string } | null;
  siret: string | null;
  rna: string | null;
  registryCheck: RegistryCheck | null;
  documents: VerificationDocument[];
  city: string | null;
  department: string | null;
};

export type StructureRating = { average: number | null; count: number };

/** Une structure dans une liste publique (annuaire, plan du site). */
export type StructureCard = {
  slug: string;
  name: string;
  kind: StructureKind;
  logoUrl: string | null;
  city: string | null;
  department: string | null;
  upcomingCount: number;
};

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
  /** Note moyenne des avis des événements de la structure (moyenne affichée à partir de 3 avis). */
  rating: StructureRating;
};

export type StructureOrganizer = StructurePublic & {
  verification: StructureVerification;
  verifiedAt: string | null;
  badgeExpiresAt: string | null;
  /** Lot 27 : suspendue, et pourquoi (badge échu, ou décision de l'équipe). */
  suspendedReason: StructureSuspensionReason | null;
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
