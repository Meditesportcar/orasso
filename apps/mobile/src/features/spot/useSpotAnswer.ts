// « Je viens » / « Peut-être » : toucher la réponse choisie la retire. La vue à jour revient de l'API (jamais calculée ici).
import type { SpotAnswer, SpotGuard, SpotMeetupView } from "@orasso/shared";
import { useRef, useState } from "react";

import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";

export function useSpotAnswer(
  meetup: SpotMeetupView,
  onChange?: (view: SpotMeetupView) => void,
  /** Refus définitif (annulé, plus invité) : l'écran qui porte le rendez-vous le vide. */
  onRefused?: () => void,
  /** Tour 4 : une réponse arrivée après un refus appris ailleurs n'est pas appliquée. */
  guard?: SpotGuard,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(meetup);
  latest.current = meetup;

  async function send(answer: SpotAnswer) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const current = latest.current;
    const op = guard?.start();
    try {
      const view =
        current.myAnswer === answer ? await api.unreplySpot(current.id) : await api.replySpot(current.id, answer);
      if (guard && op !== undefined && !guard.valid(op)) return;
      onChange?.(view);
    } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 404 || e.status === 403)) onRefused?.();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, send };
}
