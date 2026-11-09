// Garde d'heure du direct sur le site (lot R7d2, tours 2 et 3) : voir l'équivalent de l'appli (`useAfter.ts`). L'heure est
// celle d'Orasso (`nowMs`) : la machine, plus le décalage de l'horloge simulée. Le site n'a pas de mesure de l'écart avec
// le serveur (le rendu serveur donne l'heure de référence au chargement, la page se relit à chaque frontière).
import { type LiveSpan, nextPresenceBoundary, scheduleAt } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import { nowMs } from "./clock";

/** Renvoie l'heure d'Orasso à chaque rendu ; re-rendu et `onReach` à chaque frontière de la présence de `span`. */
export function useNowUntil(span: LiveSpan | null | undefined, onReach?: () => void): number {
  const [tick, setTick] = useState(0);
  const reach = useRef(onReach);
  reach.current = onReach;
  const key = span ? JSON.stringify([span.startsAt, span.endsAt, span.days]) : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` résume `span` ; `tick` relance après chaque frontière
  useEffect(() => {
    if (!span) return;
    const target = nextPresenceBoundary(span, nowMs());
    if (target === null) return;
    return scheduleAt(target, nowMs, () => {
      setTick((n) => n + 1);
      reach.current?.();
    });
  }, [key, tick]);
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
