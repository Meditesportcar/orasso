// Profils, centres d'intérêt, catégories, appareils (ARCHITECTURE.md § 1.1).
import {
  categoryFamilies,
  categoryMakeModes,
  defaultNotificationPrefs,
  devicePlatforms,
  grades,
  mainProfiles,
  type NotificationPrefs,
  type ProfileSocials,
  platformRoles,
  profileVisibilities,
} from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { session, user } from "./auth";
import { bytea, timestamps, tstz } from "./common";
import { vehicles } from "./vehicles";

export const platformRoleEnum = pgEnum("platform_role", platformRoles);
export const profileVisibilityEnum = pgEnum("profile_visibility", profileVisibilities);
export const gradeEnum = pgEnum("grade", grades);
export const devicePlatformEnum = pgEnum("device_platform", devicePlatforms);
export const categoryMakeModeEnum = pgEnum("category_make_mode", categoryMakeModes);
export const categoryFamilyEnum = pgEnum("category_family", categoryFamilies);
export const mainProfileEnum = pgEnum("main_profile_enum", mainProfiles);

/** Tout ce qui est métier sur un compte (1 pour 1 avec `user`, table de Better Auth). */
export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    pseudo: text("pseudo").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    avatarKey: text("avatar_key"),
    bio: text("bio"),
    /** Lot R5b (maquette R5.5) : les réseaux, pseudos seuls (`socialHandle`), jamais une adresse ; le lien est fabriqué. */
    socials: jsonb("socials").$type<ProfileSocials>().notNull().default({}),
    visibility: profileVisibilityEnum("visibility").notNull().default("public"),
    departments: text("departments").array().notNull().default(sql`'{}'::text[]`),
    /** Distance habituelle (10 à 200 km) autour du coin (départements) ; null = partout en France (lot M6, tour 2). */
    radiusKm: smallint("radius_km").default(50),
    /** Lot M6 (« Tes préférences ») : types d'événements préférés (`EventFormat`, validés par l'API) ; vide = tous. */
    preferredFormats: text("preferred_formats").array().notNull().default(sql`'{}'::text[]`),
    /** Lot M6 : l'étape « Tes préférences » a été vue (validée ou passée) ; null = jamais, l'appli la propose une fois. */
    preferencesSeenAt: tstz("preferences_seen_at"),
    /** Lot 41 : profil choisi à l'arrivée (textes et tuto, pas les casquettes) ; null pour les comptes antérieurs. */
    mainProfile: mainProfileEnum("main_profile"),
    platformRole: platformRoleEnum("platform_role").notNull().default("user"),
    newsletterOptIn: boolean("newsletter_opt_in").notNull().default(false),
    /** Conditions générales acceptées (lot 36) : case obligatoire de l'inscription express, horodatée. */
    termsAcceptedAt: tstz("terms_accepted_at"),
    notificationPrefs: jsonb("notification_prefs")
      .$type<NotificationPrefs>()
      .notNull()
      .default(defaultNotificationPrefs),
    pointsSeason: integer("points_season").notNull().default(0),
    grade: gradeEnum("grade").notNull().default("rodage"),
    accountQrSecret: bytea("account_qr_secret").notNull(),
    /** 8 premiers octets de SHA-256(user_id) : identifiant court du QR de compte (§ 3.3), stocké pour la recherche. */
    accountQrShortId: bytea("account_qr_short_id").notNull(),
    inviteToken: text("invite_token").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, { onDelete: "set null" }),
    /** Fin de la sanction active la plus longue (lot 32 : `BAN_UNTIL` pour un bannissement), tenue par la modération. */
    suspendedUntil: tstz("suspended_until"),
    /** Lot 32 : banni de la plateforme (connexion refusée, sessions révoquées). */
    bannedAt: tstz("banned_at"),
    /** Lot 15 : compte supprimé par son titulaire (anonymisé, plus de session). */
    deletedAt: tstz("deleted_at"),
    /** Lot 15 : types de notification coupés un par un (en plus des familles), voir `shouldDeliver`. */
    mutedTypes: text("muted_types").array().notNull().default(sql`'{}'::text[]`),
    /** Widgets de l'accueil réglés par l'utilisateur (posée au lot 15, utilisée au lot 30) ; null = par défaut. */
    homeWidgets: jsonb("home_widgets").$type<unknown>(),
    /** Lot 17 : nombre d'amis acceptés. ARCHIVE depuis le lot R6b (plus lu ni écrit) ; retiré avec la table `friendships`. */
    friendsCount: integer("friends_count").notNull().default(0),
    /**
     * Lot R4c (maquette R4.5) : le véhicule principal choisi (« Mettre en avant »). Nul = le plus ancien véhicule actif ;
     * un principal archivé est ignoré à la lecture (`effectiveMainVehicleId`), un principal supprimé remet la colonne à nul.
     */
    mainVehicleId: uuid("main_vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("profiles_pseudo_lower_key").on(sql`lower(${t.pseudo})`),
    uniqueIndex("profiles_invite_token_key").on(t.inviteToken),
    uniqueIndex("profiles_account_qr_short_id_key").on(t.accountQrShortId),
    index("profiles_departments_idx").using("gin", t.departments),
    // Lot 17 : recherche de personnes par début de pseudo.
    index("profiles_pseudo_prefix_idx").on(sql`lower(${t.pseudo}) text_pattern_ops`),
  ],
);

/** Une seule liste pour les catégories de véhicules, d'événements et les centres d'intérêt (choix C17). */
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique("categories_slug_key"),
  label: text("label").notNull(),
  position: smallint("position").notNull().default(0),
  minVehicleAge: smallint("min_vehicle_age"),
  /** Types de véhicule admis (`car`, `moto`, `truck`) ; null = tous (lot 31). */
  allowedVehicleTypes: text("allowed_vehicle_types").array(),
  /** Pays de marque admis (ISO 3166-1 alpha-2) ; null = tous. */
  allowedCountries: text("allowed_countries").array(),
  /** `whitelist` : seules les marques de `category_makes` (ex. supercar). */
  makeMode: categoryMakeModeEnum("make_mode").notNull().default("any"),
  /** Lot R5a : un style en pause (`false`) ne se propose plus ; il reste sur les véhicules qui l'ont. */
  active: boolean("active").notNull().default(true),
  /** Lot R5a (maquette R5.2) : famille du style (Époque, Genre, Préparation, Pratique ; Pays pour les origines). */
  family: categoryFamilyEnum("family").notNull().default("genre"),
  /** Lot R5a : icône du kit, dans la liste fermée `categoryIcons` de `@orasso/shared`. */
  icon: text("icon").notNull().default("star"),
  /** Lot R5a : libellé au masculin, pour un camion (« Ancien », « Préparé ») ; nul : le libellé vaut pour tous. */
  labelM: text("label_m"),
  /**
   * Lot R5a, tour 2 : le nom normalisé (`styleKey` : sans accents, casse, espaces, ponctuation ni apostrophe
   * typographique), unique : « D’origine » ne crée pas un second style à côté de `origine`. Posé par l'API (création,
   * renommage, acceptation, catalogue) ; les slugs historiques sont gardés.
   */
  labelKey: text("label_key").unique("categories_label_key_key"),
  ...timestamps,
});

export const profileInterests = pgTable(
  "profile_interests",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ name: "profile_interests_pkey", columns: [t.userId, t.categoryId] })],
);

/** Codes de QR de compte déjà présentés (anti-rejeu dans la même fenêtre de 60 s ; purgés après 3 min). */
export const accountQrUses = pgTable(
  "account_qr_uses",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Compteur HOTP (minutes Unix). */
    counter: integer("counter").notNull(),
    usedAt: tstz("used_at").notNull(),
  },
  (t) => [
    primaryKey({ name: "account_qr_uses_pkey", columns: [t.userId, t.counter] }),
    index("account_qr_uses_used_at_idx").on(t.usedAt),
  ],
);

/** Un appareil = un jeton push et un identifiant de scanner. */
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    platform: devicePlatformEnum("platform").notNull(),
    expoPushToken: text("expo_push_token").unique("devices_expo_push_token_key"),
    /**
     * Lot M6, tour 4 (vie privée) : la session qui a inscrit l'appareil. Révoquée (déconnexion à distance, mot de passe
     * changé, suspension) ou expirée, plus aucun push n'y part et le jeton est effacé (`profilesService.forgetStalePush`).
     * `set null` et pas `cascade` : la ligne sert aussi d'appareil du staff (lectures du jour J rattachées).
     */
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    name: text("name"),
    appVersion: text("app_version"),
    lastSeenAt: tstz("last_seen_at"),
    revokedAt: tstz("revoked_at"),
    ...timestamps,
  },
  (t) => [index("devices_user_id_idx").on(t.userId), index("devices_session_id_idx").on(t.sessionId)],
);
