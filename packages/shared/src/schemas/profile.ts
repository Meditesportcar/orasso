import { z } from "zod";
import {
  departmentSchema,
  devicePlatforms,
  MAX_DEPARTMENTS,
  type MainProfile,
  mainProfiles,
  type notificationFamilies,
  profileVisibilities,
} from "../enums";
import type { Grade } from "../grades";
import { arriveeLabels } from "../labels/arrivee.fr";
import type { SuspensionInfo } from "../moderation";
import { PREFERENCE_RADIUS } from "../preferences";
import type { PlatformRole, StaffRole, StructureRole } from "../roles";
import { type ProfileSocials, socialHandle, socialNetworks } from "../rules/socials";
import { optionalText } from "./common";

/** Pseudo : 3 à 24 caractères, lettres, chiffres, « _ » et « . », unique sans tenir compte de la casse. */
export const pseudoSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.]{3,24}$/, "3 à 24 caractères : lettres, chiffres, « _ » ou « . »");

const socialInput = z.string().max(300).nullish();

/**
 * Lot R5b (maquette R5.5) : les cinq réseaux tels que saisis (pseudo, « @pseudo » ou lien de profil), ramenés au pseudo
 * par `socialHandle`. Remplace tous les réseaux du profil (un réseau absent ou vide est retiré). Un refus porte sur le
 * réseau (`socials.instagram`) avec la phrase qui dit quoi faire.
 */
export const socialsInputSchema = z
  .object({
    instagram: socialInput,
    tiktok: socialInput,
    youtube: socialInput,
    facebook: socialInput,
    snapchat: socialInput,
  })
  .strict()
  .transform((value, ctx) => {
    const out: ProfileSocials = {};
    for (const network of socialNetworks) {
      const checked = socialHandle(network, value[network]);
      if (!checked.ok) ctx.addIssue({ code: "custom", message: checked.reason, path: [network] });
      else if (checked.handle) out[network] = checked.handle;
    }
    return out;
  });

export const profileUpdateSchema = z
  .object({
    pseudo: pseudoSchema,
    bio: optionalText(500),
    visibility: z.enum(profileVisibilities),
    mainProfile: z.enum(mainProfiles),
    departments: z.array(departmentSchema).max(MAX_DEPARTMENTS, arriveeLabels.errors.tooMany),
    radiusKm: z.number().int().min(PREFERENCE_RADIUS.min).max(PREFERENCE_RADIUS.max).nullable(),
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
    socials: socialsInputSchema,
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

/** Lot M6, tour 3 : retirer le jeton push d'un appareil pour le compte connecté (déconnexion de l'appli). */
export const deviceUnregisterSchema = z.object({
  expoPushToken: z.string().regex(/^Expo(nent)?PushToken\[.+\]$/),
});
export type DeviceUnregister = z.infer<typeof deviceUnregisterSchema>;

export type Membership = {
  structureId: string;
  structureSlug: string;
  structureName: string;
  role: StructureRole;
  staffRoles: StaffRole[];
  canDecide: boolean;
  status: "invited" | "requested" | "active" | "removed";
  /** Lot 33 : survol d'un super admin non membre (mode assistance, site seulement ; jamais renvoyé par l'API). */
  assisted?: boolean;
};

/**
 * Les profils de l'appli (lot 16, six depuis la DA v2, lot 38) : le passionné exposant (`fan`, avec un véhicule), le
 * visiteur (sans véhicule), une structure, la fiche pro, le profil prestataire, le profil média. L'API ne renvoie
 * encore que `fan`, `organizer`, `pro` et `provider` : le lot 40 branche `visitor`, le lot 45 `media`.
 */
export const personaKinds = ["fan", "visitor", "organizer", "pro", "provider", "media"] as const;
export type PersonaKind = (typeof personaKinds)[number];

/** Nom de chaque profil (prototype DA v2, `s-profil`). */
export const personaKindLabels: Record<PersonaKind, string> = {
  fan: "Exposant",
  visitor: "Visiteur",
  organizer: "Organisateur",
  pro: "Pro",
  provider: "Prestataire",
  media: "Média",
};

/**
 * Une casquette du compte (`GET /me` → `personas`). `id` = identifiant de la structure, de la fiche pro ou du profil
 * prestataire (`"fan"` pour le passionné, toujours en premier). `badge` = « quelque chose à traiter » (0 = rien).
 */
export type PersonaEntry = {
  kind: PersonaKind;
  id: string;
  label: string;
  logoUrl: string | null;
  badge: number;
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
    /** Lot R5b : mes réseaux (pseudos seuls). */
    socials: ProfileSocials;
    visibility: (typeof profileVisibilities)[number];
    departments: string[];
    /** Distance habituelle (10 à 200 km) ; `null` = partout en France. */
    radiusKm: number | null;
    /** Profil choisi à l'arrivée (lot 41) ; `null` pour les comptes antérieurs. */
    mainProfile: MainProfile | null;
    /** Lot R4c : le véhicule principal effectif (choisi s'il est actif, sinon le plus ancien actif), `null` sans véhicule. */
    mainVehicleId: string | null;
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
  twoFactorHint: "setup" | "passkey_sign_in" | "totp_sign_in" | null;
  counts: { vehicles: number; upcomingApplications: number; unreadNotifications: number };
  /** Lot 16 : les casquettes du compte, le passionné en premier. */
  personas: PersonaEntry[];
  /** Lot 16 : messages non lus de la Boîte (0 jusqu'au lot 18). */
  unreadInbox: number;
  /** Lot 32 : compte suspendu ou banni en ce moment (`null` sinon). */
  suspension: SuspensionInfo | null;
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
