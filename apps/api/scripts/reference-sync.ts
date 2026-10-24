// Synchronise le référentiel des véhicules (lot R3c) : ajoute les marques, modèles et générations de la liste qui
// manquent dans la base, sans rien renommer ni supprimer. Idempotente. Séparée du seed de démonstration : c'est elle
// qui fait arriver la liste en production. Usage : pnpm --filter @orasso/api db:reference
// Lancée à chaque démarrage de l'API par deploy/api-start.sh, après les migrations.
import { pool } from "../src/db/client";
import { syncVehicleReference } from "../src/modules/vehicles/reference-sync";

try {
  const started = Date.now();
  const added = await syncVehicleReference();
  console.log(
    `Référentiel des véhicules : ${added.makes} marques, ${added.models} modèles, ${added.generations} générations ` +
      `ajoutées, ${added.offroad} tout-terrain marqués (${Date.now() - started} ms).`,
  );
} catch (error) {
  console.error("Synchronisation du référentiel impossible :", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
