// Révoque une clé de signature compromise (ARCHITECTURE.md § 3.1) et réémet avec la clé active tous les QR valides
// qu'elle avait signés. Usage : pnpm --filter @orasso/api keys:revoke <kid>
// Avant : mettre une nouvelle clé dans QR_SIGNING_KEYS, la rendre active (QR_SIGNING_ACTIVE_KID), redémarrer l'API.
// Après : la clé révoquée peut être retirée de QR_SIGNING_KEYS. Détail : deploy/README.md.
import { pool } from "../src/db/client";
import { accessService } from "../src/modules/access/service";
import { notificationsService } from "../src/modules/notifications/service";

const kid = Number(process.argv[2]);
if (!Number.isInteger(kid) || kid < 0 || kid > 255) {
  console.error("Usage : keys:revoke <kid> (entier de 0 à 255)");
  process.exit(2);
}
try {
  const { reissued } = await accessService.revokeSigningKey(kid);
  console.log(`Clé ${kid} révoquée ; ${reissued} QR réémis avec la clé active.`);
  await notificationsService.flush();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
