// « Utiliser ma position » (ARCHITECTURE-SUITE § 13.2) : facultatif, au premier plan seulement. La position est lue au
// toucher, ramenée au dixième de degré (environ 11 km) et gardée en mémoire de l'écran : jamais écrite sur l'appareil ni
// envoyée ailleurs que dans la requête de liste en cours. Refusée ou indisponible : on garde le secteur du profil.
import { coarsePosition, type LatLng } from "@orasso/shared";
import * as Location from "expo-location";
import { useCallback, useState } from "react";

export type PositionState = {
  position: LatLng | null;
  /** `denied` : permission refusée ou position indisponible. */
  status: "idle" | "asking" | "on" | "denied";
  request: () => Promise<void>;
  clear: () => void;
};

export function useMyPosition(): PositionState {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<PositionState["status"]>("idle");

  const request = useCallback(async () => {
    setStatus("asking");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setStatus("denied");
        return;
      }
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPosition(coarsePosition({ lat: fix.coords.latitude, lng: fix.coords.longitude }));
      setStatus("on");
    } catch {
      setStatus("denied");
    }
  }, []);

  const clear = useCallback(() => {
    setPosition(null);
    setStatus("idle");
  }, []);

  return { position, status, request, clear };
}
