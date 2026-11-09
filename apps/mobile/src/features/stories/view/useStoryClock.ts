// Minuterie d'une story (lot R7f2) : la barre de progression se remplit sur le fil d'interface (valeur partagée animée par
// `withTiming`, aucun travail JS pendant qu'elle avance) ; le passage à la suivante est une minuterie JS posée pour le temps
// restant. Pause (appui long, feuille ouverte, champ de réponse, écran quitté, image pas encore lue) : le temps écoulé est
// gardé, la barre s'arrête à sa place, la reprise repart de là. Les calculs (durées, restant) sont dans `@orasso/shared`.
import { progressOf, remainingMs } from "@orasso/shared";
import { useEffect, useRef } from "react";
import { cancelAnimation, Easing, useSharedValue, withTiming } from "react-native-reanimated";

/** `resetKey` change à chaque nouvelle story (le compteur repart de zéro) ; `running` : la minuterie avance. */
export function useStoryClock(resetKey: string, total: number, running: boolean, onDone: () => void) {
  const progress = useSharedValue(0);
  const elapsed = useRef(0);
  const startedAt = useRef<number | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  // Déclaré avant l'effet de marche : à un changement de story, les nettoyages passent d'abord, puis celui-ci remet à zéro,
  // puis la marche repart.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `resetKey` est le seul déclencheur voulu.
  useEffect(() => {
    elapsed.current = 0;
    startedAt.current = null;
    progress.value = 0;
  }, [resetKey, progress]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `resetKey` relance la marche pour la story suivante.
  useEffect(() => {
    if (!running) return;
    const left = remainingMs(total, elapsed.current);
    startedAt.current = Date.now();
    progress.value = progressOf(total, elapsed.current);
    progress.value = withTiming(1, { duration: Math.max(1, left), easing: Easing.linear });
    const timer = setTimeout(() => done.current(), left);
    return () => {
      clearTimeout(timer);
      elapsed.current += Date.now() - (startedAt.current ?? Date.now());
      cancelAnimation(progress);
      progress.value = progressOf(total, elapsed.current);
    };
  }, [running, resetKey, total, progress]);

  return progress;
}
