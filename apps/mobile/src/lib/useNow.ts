import { useEffect, useState } from "react";

/** L'heure de l'appareil, remise à jour à intervalle régulier (compte à rebours, délais d'une offre). */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
