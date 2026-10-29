import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { env } from "../env";
import * as schema from "./schema";

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
// Connexion coupée par PostgreSQL (base redémarrée, arrêt de Docker, connexion tuée) : sans écouteur, node-postgres
// lève l'erreur et fait tomber toute l'API (vu le 29/10 à la mise à jour de Docker). Chaque connexion a donc le sien,
// au repos comme empruntée (ses requêtes échouent alors et remontent comme toute erreur) ; le pool écarte la
// connexion morte et la requête suivante en ouvre une neuve.
pool.on("connect", (client) => {
  client.on("error", (error) => console.error("PostgreSQL, connexion coupée :", error.message));
});
// Au repos, le pool relaie la même erreur : déjà journalisée par l'écouteur de la connexion.
pool.on("error", () => {});
export const db = drizzle(pool, { schema });
export type Db = typeof db;
