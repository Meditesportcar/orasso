// Garde sur l'appareil le dernier décalage de l'horloge simulée (lot 34a) : hors ligne, le mode staff reprend l'heure
// qu'il connaissait. Sans simulation, la valeur gardée est 0 : rien ne change.
// Relecture du lot 48 : garde aussi le décalage mesuré avec l'heure du serveur (en-tête `Date`) et l'heure de la mesure,
// pour le code tournant et sa vérification hors ligne.
import {
  clockOffsetMs,
  restoreClockOffset,
  restoreServerSkew,
  serverSkewAt,
  serverSkewMs,
  subscribeClock,
} from "./clock";
import { kvGet, kvGetJson, kvSet, kvSetJson } from "./kv";

const KEY = "clock.offset";
const SKEW_KEY = "clock.skew";
let started = false;

export async function initClock() {
  if (started) return;
  started = true;
  const saved = Number(await kvGet(KEY));
  if (Number.isFinite(saved) && saved > 0) restoreClockOffset(saved);
  const skew = await kvGetJson<{ ms: number; at: number | null }>(SKEW_KEY);
  if (skew) restoreServerSkew(skew.ms, skew.at);
  subscribeClock(() => {
    void kvSet(KEY, String(clockOffsetMs()));
    void kvSetJson(SKEW_KEY, { ms: serverSkewMs(), at: serverSkewAt() });
  });
}
