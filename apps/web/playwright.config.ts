import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Tests de bout en bout du site : ils attendent le site et l'API déjà lancés (`pnpm dev:api`, `pnpm dev:web`) sur la
// base locale avec le seed. Ports lus dans le .env de la racine, comme pour le reste du dépôt.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`,
    // Chrome installé sur le PC (pas de téléchargement de navigateur) ; E2E_BROWSER=msedge pour Edge.
    channel: process.env.E2E_BROWSER ?? "chrome",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
});
