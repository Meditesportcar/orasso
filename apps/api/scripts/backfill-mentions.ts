// Reprise des mentions des publications (vague R8, lot R8a2) : à lancer **une fois au déploiement** de la livraison 2, après
// les migrations. Rejouable sans risque (aucun doublon), sans notification.
// Usage : pnpm --filter @orasso/api exec tsx scripts/backfill-mentions.ts
import { pool } from "../src/db/client";
import { backfillMentions } from "../src/modules/feed/mentions";

try {
  const { posts, created } = await backfillMentions();
  console.log(`Mentions : ${posts} publications relues, ${created} mentions créées.`);
} catch (error) {
  console.error("[orasso] ERREUR : reprise des mentions impossible :", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
