import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Les tests de l'API parlent à des bases dédiées du serveur local (`pnpm db:start`) : la base de dev et son seed ne
// sont jamais touchés. Les fichiers de test tournent en parallèle (4 processus par défaut, `--maxWorkers=N` pour
// changer), chaque processus ayant ses propres bases et dossiers :
//   - `test/global-setup.ts` (une fois) crée et migre la base modèle `<base>_test_tpl`, puis clone
//     `<base>_test_1` … `<base>_test_N` (CREATE DATABASE … TEMPLATE, rapide). Modèle et clones portent l'empreinte
//     de `apps/api/drizzle` : si les migrations changent, ils sont recréés au passage suivant ; sinon réutilisés.
//   - `test/setup-process.ts` (dans chaque processus, avant tout import de `src/`) pose `DATABASE_URL` sur la base
//     du processus (`VITEST_POOL_ID`) et `DATA_DIR` sur `.data/test/<id>` (e-mails du journal, fichiers envoyés).
//   - Un test doit rester autonome : `resetDb()` vide les tables avant chaque test, aucun état n'est partagé
//     entre fichiers (pas de port fixe ; dossiers temporaires par `mkdtemp`).
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const url = new URL(process.env.DATABASE_URL ?? "postgres://orasso:orasso@localhost:54329/orasso");
if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
process.env.ORASSO_TEST_DATABASE_URL = url.toString();

export default defineConfig({
  test: {
    environment: "node",
    maxWorkers: 4,
    globalSetup: "./test/global-setup.ts",
    setupFiles: ["./test/setup-process.ts"],
    // Large : en parallèle sur un PC chargé, les tests longs (hachage des mots de passe) ralentissent ; un blocage reste détecté.
    testTimeout: 45_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      // DATABASE_URL et DATA_DIR sont posés par test/setup-process.ts (propres à chaque processus).
      DEV_SKIP_2FA: "false",
      // Horloge simulée (lot 34a) : éteinte par défaut, quel que soit le .env ; les tests qui en ont besoin la posent.
      DEV_CLOCK: "off",
      MAIL_TRANSPORT: "journal",
      // Météo (lot 28) : le fournisseur par défaut, quel que soit le .env ; les tests simulent `fetch` (jamais de réseau).
      WEATHER_PROVIDER: "open-meteo",
    },
  },
});
