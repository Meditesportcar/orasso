// Synchronise le référentiel des véhicules (lot R3c) : ajoute les marques, modèles et générations de la liste qui
// manquent dans la base, sans rien renommer ni supprimer ; une ligne supprimée ou renommée dans l'admin ne revient pas
// (table `vehicle_reference_seen`). Idempotente. Séparée du seed de démonstration : c'est elle qui fait arriver la liste
// en production. Lancée à chaque démarrage de l'API par deploy/api-start.sh, après les migrations.
// Lot R5a : puis le catalogue de départ des styles (`syncStyleCatalog`, même principe : un style vu n'est plus réécrit).
// Usage : pnpm --filter @orasso/api db:reference [--dry-run]
//   --dry-run  liste ce qui serait ajouté, sans rien écrire (à lancer sur dev avant un déploiement).
import * as Sentry from "@sentry/node";

import { pool } from "../src/db/client";
import { captureError, initSentry } from "../src/lib/sentry";
import { syncVehicleReference } from "../src/modules/vehicles/reference-sync";
import { syncStyleCatalog } from "../src/modules/vehicles/style-sync";

const dryRun = process.argv.includes("--dry-run");
const sentry = initSentry();

/** Une erreur dite clairement et envoyée à GlitchTip quand il est configuré ; rien n'a été écrit (transaction annulée). */
async function failed(what: string, error: unknown) {
  console.error(
    `[orasso] ERREUR : synchronisation ${what} impossible, rien n'a été écrit :`,
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  if (sentry) {
    captureError(error);
    await Sentry.flush(5000);
  }
  process.exitCode = 1;
}

// Le démarrage de l'API n'attend pas ces synchronisations (deploy/api-start.sh). Lot R5a, tour 2 : chacune a son propre
// `try` : un échec du référentiel n'empêche pas le catalogue des styles, et inversement.
try {
  try {
    const started = Date.now();
    const r = await syncVehicleReference({ dryRun });
    if (dryRun) for (const line of r.added) console.log(`+ ${line}`);
    console.log(
      `Référentiel des véhicules${dryRun ? " (passe à blanc, rien n'est écrit)" : ""} : ${r.makes} marques, ` +
        `${r.models} modèles, ${r.generations} générations ${dryRun ? "à ajouter" : "ajoutées"} (« Autre » compris), ` +
        `${r.offroad} tout-terrain marqués (${Date.now() - started} ms).`,
    );
  } catch (error) {
    await failed("du référentiel des véhicules", error);
  }
  if (!dryRun) {
    try {
      const styles = await syncStyleCatalog();
      console.log(`Catalogue des styles : ${styles.inserted} ajoutés, ${styles.adopted} mis à jour une première fois.`);
    } catch (error) {
      await failed("du catalogue des styles", error);
    }
  }
} finally {
  await pool.end();
}
