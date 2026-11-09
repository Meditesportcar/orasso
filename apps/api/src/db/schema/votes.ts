// Votes à thème (lot R7l1, ARCHITECTURE-R7 § 1.3, décision D38) : le prix du public devient le vote « Toutes catégories »,
// présent d'office à chaque événement ; l'organisateur en ajoute autant qu'il veut. Les voix (`audience_votes`) et les
// résultats (`audience_prize_results`) restent dans `passport.ts`, rattachés à un vote.
import {
  type VoteCandidateFilter,
  voteCandidateModes,
  voteCandidateSources,
  voteKinds,
  voteOpenModes,
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
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { applications } from "./applications";
import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";
import { vehicles } from "./vehicles";

export const voteKindEnum = pgEnum("vote_kind", voteKinds);
export const voteCandidateModeEnum = pgEnum("vote_candidate_mode", voteCandidateModes);
export const voteOpenModeEnum = pgEnum("vote_open_mode", voteOpenModes);
export const voteCandidateSourceEnum = pgEnum("vote_candidate_source", voteCandidateSources);

/**
 * Un vote d'un événement. L'état (prévu, ouvert, clos) se déduit de ces colonnes et de l'événement (`voteState`) ; les
 * colonnes `opened_at` et `closed_at` fixent ce que les tâches et l'organisateur ont constaté.
 */
export const eventVotes = pgTable(
  "event_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: voteKindEnum("kind").notNull(),
    candidateMode: voteCandidateModeEnum("candidate_mode").notNull().default("all"),
    candidateFilter: jsonb("candidate_filter").$type<VoteCandidateFilter>(),
    openMode: voteOpenModeEnum("open_mode").notNull().default("first_entry"),
    /** Mode « à l'heure » : l'ouverture prévue. */
    opensAt: tstz("opens_at"),
    /** Durée en minutes ; nulle : jusqu'à la fin de l'événement. */
    durationMinutes: integer("duration_minutes"),
    openedAt: tstz("opened_at"),
    /** Fin prévue (informative : l'état se déduit de `voteClosesAt`). */
    closesAt: tstz("closes_at"),
    /** Clôture constatée (à la main, ou fin de l'événement pour les votes migrés). */
    closedAt: tstz("closed_at"),
    /** Tampon rare au premier : « Toutes catégories » seulement (D38). */
    rareStamp: boolean("rare_stamp").notNull().default(false),
    position: smallint("position").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Retiré par l'organisateur (« Toutes catégories » aussi). */
    deletedAt: tstz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    index("event_votes_event_position_idx").on(t.eventId, t.position),
    // Un seul « Toutes catégories » par événement, même retiré : un vote retiré ne revient pas tout seul.
    uniqueIndex("event_votes_all_categories_key").on(t.eventId).where(sql`${t.kind} = 'all_categories'`),
    check("event_votes_title_check", sql`char_length(${t.title}) between 1 and 60`),
    check("event_votes_duration_check", sql`${t.durationMinutes} is null or ${t.durationMinutes} > 0`),
  ],
);

/** Candidats choisis à la main (mode `hand`) : par choix, ou par le scan de leur QR. Les autres modes se calculent. */
export const eventVoteCandidates = pgTable(
  "event_vote_candidates",
  {
    voteId: uuid("vote_id")
      .notNull()
      .references(() => eventVotes.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    source: voteCandidateSourceEnum("source").notNull().default("hand"),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    addedAt: tstz("added_at").notNull().defaultNow(),
  },
  (t) => [unique("event_vote_candidates_vote_application_key").on(t.voteId, t.applicationId)],
);

/**
 * Trophée d'un véhicule : un par vote et par véhicule du podium. Le trophée affiché sur la carte est celui du rang 1 ;
 * les rangs 2 et 3 servent au récap. Titres recopiés : le trophée survit à un événement ou un vote retiré.
 */
export const vehicleTrophies = pgTable(
  "vehicle_trophies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    voteId: uuid("vote_id").references(() => eventVotes.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    eventTitle: text("event_title").notNull(),
    voteTitle: text("vote_title").notNull(),
    rank: smallint("rank").notNull(),
    awardedAt: tstz("awarded_at").notNull(),
  },
  (t) => [
    unique("vehicle_trophies_vote_vehicle_key").on(t.voteId, t.vehicleId),
    index("vehicle_trophies_vehicle_idx").on(t.vehicleId, t.awardedAt),
    check("vehicle_trophies_rank_check", sql`${t.rank} between 1 and 3`),
  ],
);
