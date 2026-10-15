// Applique les migrations versionnées de drizzle/ (local et serveur, sans drizzle-kit).

import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "./client";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

await migrate(db, { migrationsFolder });
await pool.end();
console.log("Migrations appliquées");
