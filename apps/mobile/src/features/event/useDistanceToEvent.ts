// Lot R5d (maquette R5.11) : la distance de la fiche de l'événement. La fiche ne demande JAMAIS la position toute
// seule : si l'appareil l'a déjà accordée, on la lit sans rien afficher ; sinon un bouton « Voir la distance » la demande
// une fois ; refusée, plus rien et on ne relance pas (le refus est retenu jusqu'au prochain lancement de l'appli, car
// Android laisse `canAskAgain` vrai après un refus). La position reste dans l'état de l'écran : ni envoyée, ni écrite
// sur l'appareil. Seule la distance à vol d'oiseau est gardée (calculée ici, sur le téléphone).
import type { LatLng } from "@orasso/shared";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";

/** `checking` : lecture de la permission ; `ask` : bouton « Voir la distance » ; `on` : distance connue ; `none` : rien. */
export type DistanceStatus = "checking" | "ask" | "asking" | "on" | "none";

/** Refus du geste explicite « Voir la distance » : retenu pour la session de l'appli (mémoire, jamais écrit). */
let refusedThisSession = false;
/** Une position qui ne vient pas : retour au bouton plutôt qu'une attente sans fin. */
export const POSITION_TIMEOUT_MS = 10_000;

async function read(): Promise<LatLng> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("position timeout")), POSITION_TIMEOUT_MS);
      }),
    ]);
    return { lat: fix.coords.latitude, lng: fix.coords.longitude };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function useDistanceToEvent(enabled: boolean): {
  position: LatLng | null;
  status: DistanceStatus;
  request: () => Promise<void>;
} {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<DistanceStatus>("checking");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("none");
      return;
    }
    (async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        if (!mounted.current) return;
        if (current.status === "granted") {
          const p = await read();
          if (!mounted.current) return;
          setPosition(p);
          setStatus("on");
        } else {
          setStatus(current.canAskAgain && !refusedThisSession ? "ask" : "none");
        }
      } catch {
        // Lecture sans réponse : le bouton reste possible, sauf refus déjà essuyé.
        if (mounted.current) setStatus(refusedThisSession ? "none" : "ask");
      }
    })();
  }, [enabled]);

  const request = useCallback(async () => {
    setStatus("asking");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!mounted.current) return;
      if (permission.status !== "granted") {
        refusedThisSession = true;
        setStatus("none");
        return;
      }
      const p = await read();
      if (!mounted.current) return;
      setPosition(p);
      setStatus("on");
    } catch {
      if (mounted.current) setStatus("ask");
    }
  }, []);

  return { position, status, request };
}
