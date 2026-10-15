import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// En local, les variables viennent du .env à la racine du dépôt. En production, de l'environnement.
const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.url(),
  PUBLIC_URL: z.url().default("http://localhost:5173"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET : au moins 32 caractères"),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  APPLE_CLIENT_ID: optional,
  APPLE_CLIENT_SECRET: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Configuration invalide :");
  for (const issue of parsed.error.issues) console.error(`- ${issue.path.join(".")} : ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
