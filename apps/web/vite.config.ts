import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

// En dev, l'API tourne à part : le site la sert sous /api (même origine, comme sur dev.orasso.fr).
const apiTarget = process.env.API_PROXY_TARGET ?? `http://localhost:${process.env.API_PORT ?? 3001}`;

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false, ws: true },
    },
  },
});
