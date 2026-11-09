// Garde d'heure du direct (lot R7d2, tours 2 et 3). Un écran resté ouvert au-delà d'une frontière de la présence (fermeture
// d'une journée, ouverture de la suivante, fin de l'événement) doit cesser d'afficher « Je suis sur place », « N sur place »
// et « Votes » sans attendre une relecture. Heure du SERVEUR estimée (`serverNowMs` : appareil + écart mesuré + horloge
// simulée), jamais l'heure brute du téléphone ; rien n'est gardé.
import { type LiveSpan, nextPresenceBoundary, scheduleAt } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { serverNowMs } from "./clock";

/**
 * Renvoie l'heure du serveur à chaque rendu ; l'écran est re-rendu à chaque frontière de la présence de `span` et
 * `onReach` relit alors la fiche (la garde a déjà retiré ce qui est périmé si la lecture échoue).
 */
export function useServerClock(span: LiveSpan | null | undefined, onReach?: () => void): number {
  const [tick, setTick] = useState(0);
  const reach = useRef(onReach);
  reach.current = onReach;
  const key = span ? JSON.stringify([span.startsAt, span.endsAt, span.days]) : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` résume `span` ; `tick` relance après chaque frontière
  useEffect(() => {
    if (!span) return;
    const target = nextPresenceBoundary(span, serverNowMs());
    if (target === null) return;
    return scheduleAt(target, serverNowMs, () => {
      setTick((n) => n + 1);
      reach.current?.();
    });
  }, [key, tick]);
  return serverNowMs();
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
