// Passeport et tampons, prix du public (lot 49, ARCHITECTURE-DA-V2 § 5.5). Le récap n'a pas de table : il est calculé.
import { stampKinds, stampShapes } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, smallint, text, unique, uuid } from "drizzle-orm/pg-core";

import { applications } from "./applications";
import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";
import { seasons } from "./points";
import { tickets } from "./ticketing";

export const stampKindEnum = pgEnum("stamp_kind", stampKinds);
export const stampShapeEnum = pgEnum("stamp_shape", stampShapes);

/**
 * Un tampon par personne, événement et genre : `participation` au pointage, `visit` au billet scanné, `staff` à la
 * présence confirmée ; les rares (`first_outing`, `tenth_event`, `full_moon`, `audience_prize`) au règlement de J+2.
 * Forme, encre et aléa sont figés à la pose : le passeport ne change pas si l'événement change ensuite.
 */
export const passportStamps = pgTable(
  "passport_stamps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** Saison du début de l'événement (« Saison 2026 »). */
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    kind: stampKindEnum("kind").notNull(),
    shape: stampShapeEnum("shape").notNull(),
    /** Code du département qui a son encre (`stamp-ink-66`), sinon `default`. */
    ink: text("ink").notNull(),
    /** Aléa 0–9999 : angle, pression, bavure, dessinés par le client. */
    seed: smallint("seed").notNull(),
    rare: boolean("rare").notNull().default(false),
    /** Candidature pointée (participation, prix du public) ou billet scanné (visite). */
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    stampedAt: tstz("stamped_at").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("passport_stamps_user_event_kind_key").on(t.userId, t.eventId, t.kind),
    index("passport_stamps_user_season_idx").on(t.userId, t.seasonId, t.stampedAt),
    index("passport_stamps_event_idx").on(t.eventId),
    check("passport_stamps_seed_check", sql`${t.seed} between 0 and 9999`),
  ],
);

/** Une voix par personne et par événement, modifiable jusqu'à la clôture (fin de l'événement). */
export const audienceVotes = pgTable(
  "audience_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    voterUserId: text("voter_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Le véhicule voté (sa candidature, pointée). */
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    unique("audience_votes_event_voter_key").on(t.eventId, t.voterUserId),
    index("audience_votes_event_application_idx").on(t.eventId, t.applicationId),
  ],
);

/** Résultats figés au règlement de J+2 : les dix premiers ; le rang 1 est le gagnant s'il a reçu le prix. */
export const audiencePrizeResults = pgTable(
  "audience_prize_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    rank: smallint("rank").notNull(),
    votes: integer("votes").notNull(),
    /** Prix décerné (rang 1, au moins 2 véhicules et 3 voix). */
    winner: boolean("winner").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique("audience_prize_results_event_rank_key").on(t.eventId, t.rank),
    unique("audience_prize_results_event_application_key").on(t.eventId, t.applicationId),
  ],
);
