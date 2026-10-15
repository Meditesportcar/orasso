// Simule « J+2 » pour un événement, en développement et pour les tests de bout en bout du site :
// recule les dates de l'événement (terminé il y a 3 jours), puis lance le règlement des points (tâche `event.settle`).
// Usage : tsx scripts/simulate-settle.ts <slug-de-l-evenement>
// Refuse de tourner en production : cela réécrit les dates d'un événement.
import { eq } from "drizzle-orm";

import { db, pool } from "../src/db/client";
import { events } from "../src/db/schema";
import { notificationsService } from "../src/modules/notifications/service";
import { pointsService } from "../src/modules/points/service";

if (process.env.NODE_ENV === "production") {
  console.error("simulate-settle est réservé au développement.");
  process.exit(2);
}

const slug = process.argv[2];
if (!slug) {
  console.error("Usage : tsx scripts/simulate-settle.ts <slug-de-l-evenement>");
  process.exit(2);
}

const day = 24 * 3600 * 1000;
const event = await db.query.events.findFirst({ where: eq(events.slug, slug) });
if (!event) {
  console.error(`Événement « ${slug} » introuvable.`);
  process.exit(1);
}
const now = Date.now();
await db
  .update(events)
  .set({ startsAt: new Date(now - 4 * day), endsAt: new Date(now - 3 * day), settledAt: null })
  .where(eq(events.id, event.id));
const settled = await pointsService.settleEvent(event.id);
await notificationsService.flush();
console.log(JSON.stringify({ eventId: event.id, settled }));
await pool.end();
process.exit(settled ? 0 : 1);
