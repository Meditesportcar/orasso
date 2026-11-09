// Rend l'écran une fois de plus à une heure donnée (lot R7d2, tour 2 : la garde d'heure du direct). Un écran resté ouvert
// au-delà de la fin d'un événement doit cesser d'afficher « N sur place », « Votes » et « Je suis sur place » sans attendre
// une relecture. Heure d'Orasso (`nowMs`, horloge simulée comprise) ; rien n'est gardé.
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

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
        // À l'échéance, la lecture est refaite ; l'écran a déjà retiré le direct si elle échoue (garde d'heure).
        if (wait + 50 <= MAX_WAIT_MS) reach.current?.();
      },
      Math.min(wait + 50, MAX_WAIT_MS),
    );
    return () => clearTimeout(timer);
  }, [at]);
  return nowMs();
}

/** Relit (`reload`) au retour de l'appli au premier plan, tant que `active` (un direct en cours, un écran resté ouvert). */
export function useReloadOnForeground(active: boolean, reload: () => void) {
  const latest = useRef(reload);
  latest.current = reload;
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") latest.current();
    });
    return () => sub.remove();
  }, [active]);
}
