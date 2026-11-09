// Le direct : présence par GPS (lot R7d1, ARCHITECTURE-R7 § 1.2). « Présent, validé à telle heure » : rien d'autre.
// AUCUNE colonne de position, ni ici ni ailleurs : la vérification se fait en mémoire, dans la requête, puis la position
// est oubliée (invariant du domaine, testé sur le schéma lui-même). Ne jamais en ajouter une, même « pour déboguer ».
import { pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";
import { tickets } from "./ticketing";

/** Comment la présence a été prouvée (aujourd'hui seulement le GPS ; l'entrée du véhicule et le billet ont leurs tables). */
export const presenceKinds = ["gps"] as const;
export const presenceKindEnum = pgEnum("presence_kind", presenceKinds);

/** Une validation par compte et par événement (contrainte d'unicité : deux requêtes simultanées, une seule passe). */
export const eventPresences = pgTable(
  "event_presences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: presenceKindEnum("kind").notNull().default("gps"),
    /** Le billet du visiteur, s'il en a un pour cet événement (visiteur « avec place »). */
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    validatedAt: tstz("validated_at").notNull(),
    /** Appareil, si un jour l'appli en envoie un ; jamais une position. */
    deviceId: text("device_id"),
    ...timestamps,
  },
  (t) => [unique("event_presences_event_user_key").on(t.eventId, t.userId)],
);
