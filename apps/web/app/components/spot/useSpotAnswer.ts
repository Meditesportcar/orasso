// « Je viens » / « Peut-être » sur le site : toucher la réponse choisie la retire. La vue à jour revient de l'API.
import type { SpotAnswer, SpotMeetupView } from "@orasso/shared";
import { useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";

export function useSpotAnswer(
  meetup: SpotMeetupView,
  onChange?: (view: SpotMeetupView) => void,
  /** Refus définitif (annulé, plus invité) : la page qui porte le rendez-vous le vide. */
  onRefused?: () => void,
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
    const res =
      current.myAnswer === answer
        ? await apiFetch<SpotMeetupView>(`/spot-meetups/${current.id}/reply`, { method: "DELETE" })
        : await apiFetch<SpotMeetupView>(`/spot-meetups/${current.id}/reply`, { method: "PUT", json: { answer } });
    if (res.ok) onChange?.(res.data);
    else {
      if (res.status === 404 || res.status === 403) onRefused?.();
      setError(res.error.message);
    }
    setBusy(false);
  }

  return { busy, error, send };
}
