import { existsSync } from "node:fs";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

// Ports réglés dans le .env de la racine (API_PORT, WEB_PORT), comme pour l'API.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

// En dev, l'API tourne à part : le site la sert sous /api (même origine, comme sur dev.orasso.fr).
const apiTarget = process.env.API_PROXY_TARGET ?? `http://localhost:${process.env.API_PORT ?? 3001}`;

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  // MapLibre charge son worker par URL relative : il ne doit pas être pré-empaqueté par Vite en développement.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false, ws: true },
    },
  },
});
