import { PgBoss } from "pg-boss";

import { env } from "./env";

// Tâches planifiées dans PostgreSQL (schéma « pgboss », créé et mis à jour par pg-boss lui-même).
// Aucune tâche pour l'instant : relances staff, points à J+2, rappel J-7, délais de liste d'attente viendront.
export async function startJobs(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });
  boss.on("error", (error) => console.error("pg-boss :", error));
  await boss.start();
  return boss;
}
