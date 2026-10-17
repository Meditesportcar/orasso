// Horloge simulée (lot 34a, développement seulement) : une seule ligne, le décalage persistant entre l'heure système et
// l'heure d'Orasso. Elle reste vide et sans effet quand DEV_CLOCK n'est pas posée (la table existe partout, la migration
// étant la même ; rien ne la lit ni ne l'écrit hors développement).

import { sql } from "drizzle-orm";
import { bigint, check, integer, pgTable, text } from "drizzle-orm/pg-core";

import { tstz } from "./common";

export const devClock = pgTable(
  "dev_clock",
  {
    id: integer("id").primaryKey().default(1),
    /** Millisecondes ajoutées à l'heure système. Jamais négatif : l'horloge n'avance que, ou revient à zéro. */
    offsetMs: bigint("offset_ms", { mode: "number" }).notNull().default(0),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
    /** Qui a changé le décalage : pseudo du super admin, ou « script » pour `pnpm dev:clock`. */
    updatedBy: text("updated_by"),
  },
  (t) => [
    check("dev_clock_single_row", sql`${t.id} = 1`),
    check("dev_clock_offset_not_negative", sql`${t.offsetMs} >= 0`),
  ],
);
