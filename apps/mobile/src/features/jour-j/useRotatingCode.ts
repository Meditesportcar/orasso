// Code tournant `OR2` du jour J (lot 48, prototype `s-qr`) : recalculé chaque seconde à l'heure du serveur estimée
// (`serverNow`, lib/clock.ts : décalage mesuré par l'en-tête `Date` de l'API),
// le QR ne se redessine qu'au changement de créneau (toutes les 20 s). Tout se passe sur le téléphone, sans réseau.
import {
  base64UrlDecode,
  ROTATING_STEP_SECONDS,
  rotatingCodeForSlot,
  rotatingNumber,
  rotatingSlot,
  secondsLeft,
} from "@orasso/shared";
import { useEffect, useMemo, useState } from "react";

import { serverNowMs } from "@/lib/clock";

export type RotatingCode = {
  /** Charge utile du QR ; `null` sans secret (kit d'avant le lot 48 pas encore rafraîchi). */
  code: string | null;
  slot: number;
  /** Secondes avant le prochain code (20 → 1). */
  secondsLeft: number;
  /** « n° 4 821 » : le créneau modulo 10 000. */
  number: number;
};

export function useRotatingCode(secret: string | null, eventNo: number | undefined, passId: string): RotatingCode {
  const [at, setAt] = useState(serverNowMs);
  useEffect(() => {
    const timer = setInterval(() => setAt(serverNowMs()), 1000);
    return () => clearInterval(timer);
  }, []);
  const now = new Date(at);
  const slot = rotatingSlot(now);
  const code = useMemo(() => {
    const key = secret ? base64UrlDecode(secret) : null;
    if (!key || eventNo === undefined) return null;
    return rotatingCodeForSlot(key, { eventNo, passId, slot });
  }, [secret, eventNo, passId, slot]);
  return { code, slot, secondsLeft: secondsLeft(now), number: rotatingNumber(slot) };
}

/** « 4 821 » (espace fine insécable des milliers). */
export const formatCodeNumber = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const STEP_SECONDS = ROTATING_STEP_SECONDS;
