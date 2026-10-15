import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Les tests de l'API parlent à la base locale (`pnpm db:start` puis `pnpm db:migrate`).
    fileParallelism: false,
  },
});
