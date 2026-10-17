// Une action de l'appli qui appelle l'API (lot 35c) : un état « en cours » nommé, l'erreur de l'API (son message, tel
// quel : structure suspendue, droits, règles métier) et la confirmation. Évite de répéter try / catch / finally.
import { useCallback, useState } from "react";

import { errorMessage } from "./http";

export function useRun() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Lance `work` ; renvoie `true` si elle a abouti. `done` s'affiche en confirmation. */
  const run = useCallback(async (key: string, work: () => Promise<unknown>, done?: string): Promise<boolean> => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await work();
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  const clear = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return { busy, error, notice, run, clear, setError, setNotice };
}
