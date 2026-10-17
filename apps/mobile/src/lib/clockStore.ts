// Garde sur l'appareil le dernier décalage de l'horloge simulée (lot 34a) : hors ligne, le mode staff reprend l'heure
// qu'il connaissait. Sans simulation, la valeur gardée est 0 : rien ne change.
import { clockOffsetMs, restoreClockOffset, subscribeClock } from "./clock";
import { kvGet, kvSet } from "./kv";

const KEY = "clock.offset";
let started = false;

export async function initClock() {
  if (started) return;
  started = true;
  const saved = Number(await kvGet(KEY));
  if (Number.isFinite(saved) && saved > 0) restoreClockOffset(saved);
  subscribeClock(() => {
    void kvSet(KEY, String(clockOffsetMs()));
  });
}
