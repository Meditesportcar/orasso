// Livre tout de suite les notifications en attente d'un compte, en développement et pour les tests de bout en bout :
// la nuit (heures calmes, 22:00–08:00), les notifications sont reportées à 08:00 et n'apparaissent pas au Journal, ce qui
// rendait les recettes dépendantes de l'heure. Ne change rien au comportement de l'API.
// Usage : tsx scripts/deliver-now.ts <e-mail>
// Refuse de tourner en production.
import { and, eq, isNull, sql } from "drizzle-orm";

import { db, pool } from "../src/db/client";
import { notifications, user } from "../src/db/schema";
import { notificationsService } from "../src/modules/notifications/service";

if (process.env.NODE_ENV === "production") {
  console.error("deliver-now est réservé au développement.");
  process.exit(2);
}

const email = process.argv[2];
if (!email) {
  console.error("Usage : tsx scripts/deliver-now.ts <e-mail>");
  process.exit(2);
}

const [account] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase()));
if (!account) {
  console.error(`Compte « ${email} » introuvable.`);
  process.exit(1);
}
const moved = await db
  .update(notifications)
  .set({ deliverAfter: sql`now()` })
  .where(and(eq(notifications.userId, account.id), isNull(notifications.deliveredAt)))
  .returning({ id: notifications.id });
const delivered = await notificationsService.deliverDue();
await notificationsService.flush();
console.log(JSON.stringify({ moved: moved.length, delivered }));
await pool.end();
