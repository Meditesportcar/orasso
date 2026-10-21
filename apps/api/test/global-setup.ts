// Mise en place globale, une fois avant tous les tests : base modèle migrée + une base clonée par processus prévu.
// Le détail (empreinte des migrations, clones) est dans test/databases.ts ; le principe, en tête de vitest.config.ts.
import type { TestProject } from "vitest/node";

import { ensureDatabases } from "./databases";

export default async function setup(project: TestProject) {
  const configured = Number(project.config.maxWorkers);
  const workers = Number.isFinite(configured) && configured > 0 ? configured : 4;
  await ensureDatabases(
    process.env.ORASSO_TEST_DATABASE_URL ?? "",
    Array.from({ length: workers }, (_, i) => String(i + 1)),
  );
}
