// Compte et sécurité (lot 15, ARCHITECTURE-SUITE § 1.2).
import { z } from "zod";
import {
  departmentSchema,
  MAX_DEPARTMENTS,
  type NotificationFamily,
  notificationTypes,
  profileVisibilities,
} from "../enums";
import { arriveeLabels } from "../labels/arrivee.fr";
import { type HomeWidgets, homeWidgetsSchema } from "./home";
import type { UserProfileView } from "./social";

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
    departments: z.array(departmentSchema).max(MAX_DEPARTMENTS, arriveeLabels.errors.tooMany),
    radiusKm: z.number().int().min(10).max(300),
    interests: z.array(z.uuid()).max(30),
    homeWidgets: homeWidgetsSchema.nullable(),
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
  homeWidgets: HomeWidgets | null;
};

export const referralSchema = z.object({ token: z.string().trim().min(8).max(64) });

/** `DELETE /me` : mot de passe, et code de l'application d'authentification si la 2FA est active. */
export const accountDeleteSchema = z.object({
  /** Vide pour un compte sans mot de passe : la session ouverte par une clé d'accès confirme alors. */
  password: z.string().max(128).default(""),
  /** Code à 6 chiffres de l'application d'authentification, ou code de secours (« abcde-12345 »). */
  totpCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{6,20}$/, "Code à 6 chiffres ou code de secours")
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
export type PublicPreview = UserProfileView;
