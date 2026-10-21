// Exécuté dans chaque processus de test, AVANT l'import de `src/env.ts` et `src/db/client.ts` (qui lisent
// l'environnement à l'import) : pointe l'API vers la base et le dossier de données propres à ce processus.
import { databaseNames, ensureDatabases, withDatabase } from "./databases";

const testUrl = process.env.ORASSO_TEST_DATABASE_URL ?? "";
const poolId = process.env.VITEST_POOL_ID ?? "1";

const { worker } = databaseNames(testUrl, poolId);
process.env.DATABASE_URL = withDatabase(testUrl, worker);
process.env.DATA_DIR = `.data/test/${poolId}`;
// Déjà créée par global-setup (simple vérification d'empreinte) ; recréée ici si le nombre de processus dépasse la prévision.
await ensureDatabases(testUrl, [poolId]);
