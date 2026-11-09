// Rendez-vous au spot (lot R7i, ARCHITECTURE-R7 § 1.6) : un rendez-vous de dernière minute (12 h au plus), un seul actif par
// personne, visible de ses invités seuls. Le lieu est celui du rendez-vous, jamais une position de personne : il est effacé
// avec lui (`purged_at`, `place_label = ''`, `lat = lng = 0`, réponses supprimées). Les lignes effacées restent 30 jours
// (onglet Spots du crew, sans lieu), puis la tâche `spot.purge` les supprime.
import { spotAnswers, spotAudiences } from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { crews } from "./crews";

export const spotAudienceEnum = pgEnum("spot_audience", spotAudiences);
export const spotRsvpEnum = pgEnum("spot_rsvp", spotAnswers);

export const spotMeetups = pgTable(
  "spot_meetups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    audience: spotAudienceEnum("audience").notNull(),
    /** Renseigné seulement pour `audience = crew`. */
    crewId: uuid("crew_id").references(() => crews.id, { onDelete: "cascade" }),
    /** Le lieu : nom (80 au plus), vide une fois effacé. */
    placeLabel: text("place_label").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at").notNull(),
    note: text("note"),
    cancelledAt: tstz("cancelled_at"),
    /** Lieu et réponses effacés (fin du rendez-vous, ou annulation). */
    purgedAt: tstz("purged_at"),
    /** Posé à l'effacement : combien de personnes venaient (un nombre, jamais la liste). */
    cameCount: integer("came_count"),
    ...timestamps,
  },
  (t) => [
    // Un seul rendez-vous actif par auteur : garde-fou en base (l'API le vérifie d'abord, en transaction).
    uniqueIndex("spot_meetups_one_active_key")
      .on(t.authorId)
      .where(sql`${t.cancelledAt} is null and ${t.purgedAt} is null`),
    index("spot_meetups_ends_idx").on(t.endsAt).where(sql`${t.purgedAt} is null`),
    index("spot_meetups_crew_idx").on(t.crewId, t.endsAt.desc()).where(sql`${t.crewId} is not null`),
    index("spot_meetups_author_idx").on(t.authorId, t.createdAt.desc()),
    check(
      "spot_meetups_times_check",
      sql`${t.endsAt} > ${t.startsAt} and ${t.endsAt} <= ${t.startsAt} + interval '12 hours'`,
    ),
    check("spot_meetups_crew_check", sql`(${t.audience} = 'crew') = (${t.crewId} is not null)`),
    check("spot_meetups_place_check", sql`char_length(${t.placeLabel}) <= 80`),
    check("spot_meetups_note_check", sql`${t.note} is null or char_length(${t.note}) <= 140`),
  ],
);

/** Une réponse d'un invité (« Je viens », « Peut-être »). Supprimées avec le lieu, à la fin du rendez-vous. */
export const spotMeetupReplies = pgTable(
  "spot_meetup_replies",
  {
    meetupId: uuid("meetup_id")
      .notNull()
      .references(() => spotMeetups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    answer: spotRsvpEnum("answer").notNull(),
    answeredAt: tstz("answered_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.meetupId, t.userId], name: "spot_meetup_replies_pkey" }),
    index("spot_meetup_replies_user_idx").on(t.userId),
  ],
);
