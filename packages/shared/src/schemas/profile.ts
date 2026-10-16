import { z } from "zod";
import { departmentSchema, devicePlatforms, type notificationFamilies, profileVisibilities } from "../enums";
import type { Grade } from "../grades";
import type { PlatformRole, StaffRole, StructureRole } from "../roles";
import { optionalText } from "./common";

/** Pseudo : 3 à 24 caractères, lettres, chiffres, « _ » et « . », unique sans tenir compte de la casse. */
export const pseudoSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.]{3,24}$/, "3 à 24 caractères : lettres, chiffres, « _ » ou « . »");

export const profileUpdateSchema = z
  .object({
    pseudo: pseudoSchema,
    bio: optionalText(500),
    visibility: z.enum(profileVisibilities),
    departments: z.array(departmentSchema).max(20),
    radiusKm: z.number().int().min(5).max(500),
    interests: z.array(z.uuid()).max(30),
    notificationPrefs: z.object({
      application: z.boolean(),
      event: z.boolean(),
      social: z.boolean(),
      grade: z.boolean(),
    }),
    newsletterOptIn: z.boolean(),
    firstName: optionalText(60),
    lastName: optionalText(60),
    phone: optionalText(30),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const deviceRegisterSchema = z.object({
  platform: z.enum(devicePlatforms),
  expoPushToken: z
    .string()
    .regex(/^Expo(nent)?PushToken\[.+\]$/)
    .nullish(),
  name: optionalText(80),
  appVersion: optionalText(20),
});
export type DeviceRegister = z.infer<typeof deviceRegisterSchema>;

export type Membership = {
  structureId: string;
  structureSlug: string;
  structureName: string;
  role: StructureRole;
  staffRoles: StaffRole[];
  canDecide: boolean;
  status: "invited" | "requested" | "active" | "removed";
};

export type Me = {
  user: { id: string; email: string; emailVerified: boolean; twoFactorEnabled: boolean };
  profile: {
    pseudo: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    avatarUrl: string | null;
    bio: string | null;
    visibility: (typeof profileVisibilities)[number];
    departments: string[];
    radiusKm: number;
    interests: string[];
    platformRole: PlatformRole;
    newsletterOptIn: boolean;
    notificationPrefs: Record<(typeof notificationFamilies)[number], boolean>;
    pointsSeason: number;
    grade: Grade;
    inviteToken: string;
  };
  memberships: Membership[];
  /** Fiche pro du compte (casquette Pro de l'appli, espace `/pro/<slug>` du site), `null` sans fiche. */
  pro: { id: string; slug: string; name: string; logoUrl: string | null; published: boolean; verified: boolean } | null;
  /** La double authentification est exigée (organisateur ou administration) mais pas encore activée. */
  twoFactorRequired: boolean;
  /** Lot 15 : que faire quand la 2FA est exigée — l'activer, ou se reconnecter avec sa clé d'accès (la session doit la prouver). */
  twoFactorHint: "setup" | "passkey_sign_in" | null;
  counts: { vehicles: number; upcomingApplications: number; unreadNotifications: number };
};

/** Profil vu par un autre utilisateur connecté (compte privé : version réduite). */
export type PublicProfile = {
  pseudo: string;
  avatarUrl: string | null;
  grade: Grade;
  visibility: (typeof profileVisibilities)[number];
  bio: string | null;
  departments: string[] | null;
  vehicles: { id: string; label: string; makeName: string; modelName: string; photoUrl: string | null }[];
};
