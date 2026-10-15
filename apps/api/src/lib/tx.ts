import { db } from "../db/client";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Base ou transaction : ce que reçoivent les fonctions de `repo.ts`. */
export type Executor = typeof db | Tx;

type After = () => unknown;

/**
 * Transaction de service. `after(fn)` diffère un effet hors base (WebSocket, planification de tâche)
 * après la validation ; une erreur dans ces effets est journalisée sans annuler la transaction.
 */
export async function withTx<T>(fn: (tx: Tx, after: (cb: After) => void) => Promise<T>): Promise<T> {
  const callbacks: After[] = [];
  const result = await db.transaction((tx) => fn(tx, (cb) => callbacks.push(cb)));
  for (const cb of callbacks) {
    try {
      await cb();
    } catch (error) {
      console.error("Effet après validation :", error);
    }
  }
  return result;
}
