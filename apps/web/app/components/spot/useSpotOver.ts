// « Ce rendez-vous est terminé » sans attendre le réseau (lot R7i, tour 2) : un rendez-vous est fini à `endsAt` pour l'heure
// du site (horloge simulée comprise), quelle que soit la vue reçue. Lieu, mot, « Qui vient ? » et réponses sont masqués à cet
// instant, une page restée ouverte ou passée hors ligne comprise. Réévalué à l'instant exact de la fin, au retour sur
// l'onglet et à la reprise du réseau. Au rendu serveur, seule la phase reçue compte (pas d'écart à l'hydratation).
import type { SpotMeetupView } from "@orasso/shared";
import { useEffect, useState } from "react";

import { now } from "../../lib/clock";

const MAX_WAIT_MS = 2 ** 31 - 1;

export function useSpotOver(meetup: Pick<SpotMeetupView, "phase" | "endsAt">): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const end = Date.parse(meetup.endsAt);
    const check = () => setLate(now().getTime() >= end);
    check();
    const timer = window.setTimeout(check, Math.min(Math.max(end - now().getTime(), 0) + 50, MAX_WAIT_MS));
    const visible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, [meetup.endsAt]);
  return meetup.phase === "ended" || late;
}
