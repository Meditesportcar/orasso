// Lot R5d (maquette R5.11) : la distance de la fiche de l'événement. La fiche ne demande JAMAIS la position toute
// seule : si l'appareil l'a déjà accordée, on la lit sans rien afficher ; sinon un bouton « Voir la distance » la demande
// une fois ; refusée, plus rien et on ne relance pas. La position reste dans l'état de l'écran : ni envoyée, ni écrite
// sur l'appareil. Seule la distance à vol d'oiseau est gardée (calculée ici, sur le téléphone).
import type { LatLng } from "@orasso/shared";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";

/** `checking` : lecture de la permission ; `ask` : bouton « Voir la distance » ; `on` : distance connue ; `none` : rien. */
export type DistanceStatus = "checking" | "ask" | "asking" | "on" | "none";

async function read(): Promise<LatLng> {
  const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: fix.coords.latitude, lng: fix.coords.longitude };
}

export function useDistanceToEvent(enabled: boolean): {
  position: LatLng | null;
  status: DistanceStatus;
  request: () => Promise<void>;
} {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<DistanceStatus>("checking");

  useEffect(() => {
    if (!enabled) {
      setStatus("none");
      return;
    }
    let alive = true;
    (async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        if (!alive) return;
        if (current.status === "granted") {
          const p = await read();
          if (!alive) return;
          setPosition(p);
          setStatus("on");
        } else {
          setStatus(current.canAskAgain ? "ask" : "none");
        }
      } catch {
        if (alive) setStatus("none");
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  const request = useCallback(async () => {
    setStatus("asking");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setStatus("none");
        return;
      }
      setPosition(await read());
      setStatus("on");
    } catch {
      setStatus("none");
    }
  }, []);

  return { position, status, request };
}
