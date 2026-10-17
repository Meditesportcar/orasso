// Candidatures et journal des transitions (ARCHITECTURE.md § 1.5).
import {
  applicationKinds,
  applicationSources,
  applicationStatuses,
  type FilteringOpinion,
  type RefusalReason,
  transitionActors,
} from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { crews } from "./crews";
import { eventDays, events, eventZones } from "./events";
import { providerProfiles } from "./providers";
import { vehicles } from "./vehicles";

export const applicationKindEnum = pgEnum("application_kind", applicationKinds);
export const applicationStatusEnum = pgEnum("application_status", applicationStatuses);
export const applicationSourceEnum = pgEnum("application_source", applicationSources);
export const transitionActorEnum = pgEnum("transition_actor", transitionActors);

export type FilteringOpinionEntry = { userId: string; opinion: FilteringOpinion; note: string | null; at: string };

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: applicationKindEnum("kind").notNull().default("vehicle"),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "restrict" }),
    /** Prestataire (`kind = provider`, lot 21) : son profil ; `vehicle_id` est alors nul. */
    providerProfileId: uuid("provider_profile_id").references(() => providerProfiles.id, { onDelete: "restrict" }),
    /** Accréditation « média officiel » donnée par l'organisateur à un photographe retenu (par événement, S23). */
    accreditedMedia: boolean("accredited_media").notNull().default(false),
    /**
     * Événement sur plusieurs jours (lot 26) : le jour choisi ; `null` = tout l'événement (et toujours `null` pour un
     * événement d'un jour). `no action` : un jour qui a des candidatures ne se supprime pas (avant le lot 26 :
     * `set null`, qui aurait changé en silence une candidature d'un jour en candidature pour tout l'événement).
     */
    eventDayId: uuid("event_day_id").references(() => eventDays.id, { onDelete: "no action" }),
    status: applicationStatusEnum("status").notNull(),
    /** Règlement accepté. Nul seulement pour un membre inscrit par son chef qui n'a pas (encore) confirmé (lot 19). */
    rulesAcceptedAt: tstz("rules_accepted_at"),
    companions: smallint("companions").notNull().default(0),
    message: text("message"),
    followStructure: boolean("follow_structure").notNull(),
    decidedAt: tstz("decided_at"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    refusalReasons: text("refusal_reasons").array().$type<RefusalReason[]>().notNull().default(sql`'{}'::text[]`),
    refusalNote: text("refusal_note"),
    refusalSent: boolean("refusal_sent").notNull().default(true),
    waitlistRank: integer("waitlist_rank"),
    waitlistedAt: tstz("waitlisted_at"),
    offeredAt: tstz("offered_at"),
    offerExpiresAt: tstz("offer_expires_at"),
    withdrawnAt: tstz("withdrawn_at"),
    /** Désistement après verrouillage → malus à J+2 (lot 06). */
    withdrawnAfterLock: boolean("withdrawn_after_lock").notNull().default(false),
    zoneId: uuid("zone_id").references(() => eventZones.id, { onDelete: "set null" }),
    source: applicationSourceEnum("source").notNull().default("self"),
    filteringOpinion: jsonb("filtering_opinion").$type<FilteringOpinionEntry[]>(),
    /** Inscription en crew (lot 19) : le crew, l'inscription qui regroupe ses membres, la confirmation du membre. */
    crewId: uuid("crew_id").references(() => crews.id, { onDelete: "set null" }),
    crewApplicationId: uuid("crew_application_id"),
    memberConfirmedAt: tstz("member_confirmed_at"),
    ...timestamps,
  },
  (t) => [
    index("applications_event_status_idx").on(t.eventId, t.status),
    index("applications_user_status_idx").on(t.userId, t.status),
    index("applications_event_waitlist_idx").on(t.eventId, t.waitlistRank),
    // Une candidature active par véhicule et par événement, `awaiting_member` comprise (lot 19 : une inscription en
    // crew bloque le véhicule). Écrit par les statuts terminés : la migration qui ajoute `awaiting_member` à l'enum ne
    // peut pas citer la nouvelle valeur dans la même transaction. **Liste noire** : tout futur statut terminal doit être
    // ajouté ici (sinon il bloquerait le véhicule pour toujours).
    // Lot 26 (§ 10) : par jour — le même véhicule peut candidater pour le jour 1 et pour le jour 2 ; « tout
    // l'événement » (`event_day_id` nul) a sa propre clé (uuid nul). Qu'un véhicule n'ait pas à la fois une candidature
    // « tout l'événement » et une candidature d'un jour est vérifié par le service, sous le verrou de l'événement.
    uniqueIndex("applications_active_vehicle_key")
      .on(t.eventId, t.vehicleId, sql`coalesce(${t.eventDayId}, '00000000-0000-0000-0000-000000000000'::uuid)`)
      .where(sql`${t.status} not in ('refused', 'withdrawn', 'expired', 'cancelled')`),
    index("applications_event_day_idx").on(t.eventDayId).where(sql`${t.eventDayId} is not null`),
    index("applications_crew_idx").on(t.crewId, t.eventId).where(sql`${t.crewId} is not null`),
    // Règlement accepté, sauf pour un membre de crew qui n'a pas confirmé (`awaiting_member`, puis désisté ou annulé).
    check("applications_rules_check", sql`${t.rulesAcceptedAt} is not null or ${t.crewApplicationId} is not null`),
    // Une candidature active par profil prestataire et par événement.
    uniqueIndex("applications_active_provider_key")
      .on(t.eventId, t.providerProfileId)
      .where(sql`${t.status} in ('pending', 'accepted', 'waitlisted', 'offered')`),
    check("applications_provider_kind_check", sql`${t.kind} <> 'provider' or ${t.providerProfileId} is not null`),
    check("applications_vehicle_kind_check", sql`${t.kind} <> 'vehicle' or ${t.vehicleId} is not null`),
    check("applications_companions_check", sql`${t.companions} between 0 and 9`),
  ],
);

/** Journal des transitions : toute transition passe par `ApplicationService` qui écrit ici. */
export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: applicationStatusEnum("from_status"),
    toStatus: applicationStatusEnum("to_status").notNull(),
    actor: transitionActorEnum("actor").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    reason: text("reason"),
    at: tstz("at").notNull(),
  },
  (t) => [index("application_events_application_idx").on(t.applicationId, t.at)],
);
