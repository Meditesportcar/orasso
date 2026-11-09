// Rend l'écran une fois de plus à une heure donnée (lot R7d2, tour 2 : la garde d'heure du direct). Un écran resté ouvert
// au-delà de la fin d'un événement doit cesser d'afficher « N sur place », « Votes » et « Je suis sur place » sans attendre
// une relecture. Heure d'Orasso (`nowMs`, horloge simulée comprise) ; rien n'est gardé.
import { useEffect, useRef, useState } from "react";

import { nowMs } from "./clock";

/** Plus long délai d'un minuteur sûr (au-delà, on se réveille plus tôt et on recalcule). */
const MAX_WAIT_MS = 2 ** 30;

/** Renvoie l'heure d'Orasso à chaque rendu ; l'écran est re-rendu juste après `at` (ISO), s'il est encore dans le futur. */
export function useNowUntil(at: string | null | undefined, onReach?: () => void): number {
  const [, setTick] = useState(0);
  const reach = useRef(onReach);
  reach.current = onReach;
  useEffect(() => {
    if (!at) return;
    const wait = new Date(at).getTime() - nowMs();
    if (!(wait > 0)) return;
    const timer = setTimeout(
      () => {
        setTick((n) => n + 1);
        // À l'échéance, la page se relit ; elle a déjà retiré le direct si la lecture échoue (garde d'heure).
        if (wait + 50 <= MAX_WAIT_MS) reach.current?.();
      },
      Math.min(wait + 50, MAX_WAIT_MS),
    );
    return () => clearTimeout(timer);
  }, [at]);
  return nowMs();
}

/** Relit (`reload`) au retour de l'onglet au premier plan et au retour du réseau, tant que `active`. */
export function useReloadOnReturn(active: boolean, reload: () => void) {
  const latest = useRef(reload);
  latest.current = reload;
  useEffect(() => {
    if (!active) return;
    const visible = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    const online = () => latest.current();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", online);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", online);
    };
  }, [active]);
}
