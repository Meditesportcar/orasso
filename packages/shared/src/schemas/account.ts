// Compte et sécurité (lot 15, ARCHITECTURE-SUITE § 1.2).
import { z } from "zod";
import { departmentSchema, type NotificationFamily, notificationTypes, profileVisibilities } from "../enums";
import type { PublicProfile } from "./profile";

const notificationTypeNames = Object.keys(notificationTypes) as [string, ...string[]];

/** `PATCH /me/settings` : tout est facultatif, seuls les champs présents changent. */
export const accountSettingsSchema = z
  .object({
    notificationPrefs: z.object({
      application: z.boolean(),
      event: z.boolean(),
      social: z.boolean(),
      grade: z.boolean(),
    }),
    mutedTypes: z.array(z.enum(notificationTypeNames)).max(100),
    visibility: z.enum(profileVisibilities),
    departments: z.array(departmentSchema).max(20),
    radiusKm: z.number().int().min(10).max(300),
    interests: z.array(z.uuid()).max(30),
    homeWidgets: z.unknown().nullable(),
  })
  .partial();
export type AccountSettingsUpdate = z.infer<typeof accountSettingsSchema>;

export type AccountSettings = {
  notificationPrefs: Record<NotificationFamily, boolean>;
  mutedTypes: string[];
  visibility: (typeof profileVisibilities)[number];
  departments: string[];
  radiusKm: number;
  interests: string[];
  homeWidgets: unknown;
};

export const referralSchema = z.object({ token: z.string().trim().min(8).max(64) });

/** `DELETE /me` : mot de passe, et code de l'application d'authentification si la 2FA est active. */
export const accountDeleteSchema = z.object({
  password: z.string().min(1).max(128),
  totpCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Code à 6 chiffres")
    .nullish(),
});
export type AccountDelete = z.infer<typeof accountDeleteSchema>;

export type SessionView = {
  id: string;
  /** « Chrome · Windows », « Appli Orasso · Android » : jamais l'adresse IP. */
  device: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
};

/** `GET /me/public-preview` : ce que voit un autre utilisateur connecté (sérialiseur public appliqué à soi). */
export type PublicPreview = PublicProfile;
