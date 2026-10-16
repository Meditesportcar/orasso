import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Les tests de l'API parlent à une base dédiée `<base>_test` du serveur local (`pnpm db:start`),
// créée et migrée par `test/global-setup.ts` : la base de dev et son seed ne sont jamais touchés.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const url = new URL(process.env.DATABASE_URL ?? "postgres://orasso:orasso@localhost:54329/orasso");
if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
process.env.ORASSO_TEST_DATABASE_URL = url.toString();

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: "./test/global-setup.ts",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: url.toString(),
      DATA_DIR: ".data/test",
      DEV_SKIP_2FA: "false",
      MAIL_TRANSPORT: "journal",
      // Météo (lot 28) : le fournisseur par défaut, quel que soit le .env ; les tests simulent `fetch` (jamais de réseau).
      WEATHER_PROVIDER: "open-meteo",
    },
  },
});
