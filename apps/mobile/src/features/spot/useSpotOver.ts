// « Ce rendez-vous est terminé » sans attendre le réseau (lot R7i, tour 2) : un rendez-vous est fini à `endsAt` pour l'heure
// d'Orasso (heure du serveur estimée, décalage mesuré et horloge simulée compris), quelle que soit la vue reçue. Le lieu, le mot, « Qui vient ? » et
// les réponses sont masqués à cet instant, une fiche restée ouverte ou passée hors ligne comprise. L'état est réévalué à
// l'instant exact de la fin et au retour au premier plan (un minuteur peut dormir en arrière-plan).
import { type SpotMeetupView, spotEnded } from "@orasso/shared";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { serverNowMs, serverSkewMs, subscribeClock, useClockOffset } from "@/lib/clock";

const MAX_WAIT_MS = 2 ** 31 - 1;

export function useSpotOver(meetup: Pick<SpotMeetupView, "phase" | "endsAt">): boolean {
  const offset = useClockOffset();
  const skew = useSyncExternalStore(subscribeClock, serverSkewMs, serverSkewMs);
  const [, setTick] = useState(0);
  const over = spotEnded(meetup, serverNowMs());
  // biome-ignore lint/correctness/useExhaustiveDependencies: le décalage d'horloge change la date de fin pour l'appareil.
  useEffect(() => {
    if (over) return undefined;
    const wait = Math.min(Math.max(Date.parse(meetup.endsAt) - serverNowMs(), 0) + 50, MAX_WAIT_MS);
    const timer = setTimeout(() => setTick((n) => n + 1), wait);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setTick((n) => n + 1);
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [over, meetup.endsAt, offset, skew]);
  return over;
}
