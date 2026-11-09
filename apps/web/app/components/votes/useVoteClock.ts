// Horloge des pages de vote du site (lot R7l3) : l'heure d'Orasso, remise à jour toutes les 30 s, et la surveillance de la
// clôture d'un vote. L'échéance se mesure à **l'heure du serveur** (écart calculé à partir de la réponse du chargeur, jamais
// l'horloge brute du navigateur) ; elle est surveillée **tant que le vote n'est pas fini**, qu'il soit ouvert ou pas encore
// (constat du 09/11 : l'ouverture d'un vote après l'arrivée sur la page ne ré-armait pas la minuterie).
import { type ClosingWatch, type VoteView, voteIsOver, voteWatchDeadline, watchClosing } from "@orasso/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { nowMs } from "../../lib/clock";

/** Appelle `onTick` avec l'heure d'Orasso toutes les `intervalMs` ; renvoie l'arrêt. Pur, testé sans écran. */
export function tickClock(intervalMs: number, now: () => number, onTick: (at: Date) => void): () => void {
  const timer = setInterval(() => onTick(new Date(now())), intervalMs);
  return () => clearInterval(timer);
}

/** L'heure d'Orasso, rendue à nouveau toutes les `intervalMs`. */
export function useOrassoNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date(nowMs()));
  useEffect(() => tickClock(intervalMs, nowMs, setNow), [intervalMs]);
  return now;
}

/**
 * À l'échéance, relit la page puis réessaie (2, 4, 8, 15, 30, 60 s) jusqu'à ce que l'API dise « clos » ou « réglé ».
 * `vote` est le vote affiché (`null` : pas relu, rien à surveiller) ; `serverAt` l'heure du serveur à la lecture.
 */
export function useClosingWatch(vote: VoteView | null, serverAt: number) {
  const revalidator = useRevalidator();
  const skew = useRef(0);
  useMemo(() => {
    skew.current = serverAt - nowMs();
  }, [serverAt]);
  const latest = useRef({ vote, revalidate: revalidator.revalidate });
  latest.current = { vote, revalidate: revalidator.revalidate };
  const closing = useRef<ClosingWatch | null>(null);
  const deadline = voteWatchDeadline(vote);
  const deadlineMs = deadline ? deadline.getTime() : null;
  useEffect(() => {
    if (deadlineMs === null) return undefined;
    const watch = watchClosing({
      deadline: new Date(deadlineMs),
      now: () => new Date(nowMs() + skew.current),
      reload: async () => {
        await latest.current.revalidate();
        await new Promise((resolve) => setTimeout(resolve, 0)); // laisse la page prendre les données relues
        return voteIsOver(latest.current.vote);
      },
    });
    closing.current = watch;
    return () => {
      watch.stop();
      if (closing.current === watch) closing.current = null;
    };
  }, [deadlineMs]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque lecture de la page est l'occasion de revoir l'heure du serveur
  useEffect(() => closing.current?.check(), [serverAt]);
}
