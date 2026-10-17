import { useEffect, useState } from "react";
import { nowMs } from "../lib/clock";

import { formatRemaining } from "../lib/format";

/** Compte à rebours jusqu'à `until` (l'heure du navigateur ne sert qu'après l'hydratation : pas d'écart de rendu). */
export function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(nowMs());
    const timer = setInterval(() => setNow(nowMs()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <time className="acc__timer" dateTime={until} data-testid="countdown">
      {now === null ? "…" : formatRemaining(until, now)}
    </time>
  );
}
