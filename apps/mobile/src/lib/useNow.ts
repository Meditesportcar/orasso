import { useEffect, useState } from "react";

import { now as clockNow, useClockOffset } from "./clock";

/** L'heure d'Orasso (heure de l'appareil, alignée sur le serveur en simulation), remise à jour à intervalle régulier. */
export function useNow(intervalMs = 30_000): Date {
  const offset = useClockOffset();
  const [now, setNow] = useState(() => clockNow());
  // biome-ignore lint/correctness/useExhaustiveDependencies: le décalage change l'heure affichée sans attendre le tick.
  useEffect(() => {
    setNow(clockNow());
    const timer = setInterval(() => setNow(clockNow()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, offset]);
  return now;
}
