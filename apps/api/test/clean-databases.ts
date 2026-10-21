// Depuis apps/api : node --import tsx test/clean-databases.ts (serveur local indiqué par le .env).
import { fileURLToPath } from "node:url";
import { cleanDatabases } from "./databases";

process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Nettoyage réservé au serveur local");
console.log("Bases de test supprimées :", await cleanDatabases(url.toString()));
