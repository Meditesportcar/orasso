// Position de l'Explorer v2 (lot 44, `s-explore`) : à la première ouverture, si l'appareil n'a encore rien répondu, une
// carte propose d'activer la position (« Trie par distance depuis là où tu es ») ; déjà accordée, elle est lue tout de
// suite ; refusée, petite icône rouge et repli sur le département favori (le tri par distance de l'API part alors du
// secteur du profil). La position est ramenée au dixième de degré (environ 11 km), gardée en mémoire de l'écran et
// envoyée seulement avec la requête de liste : jamais écrite sur l'appareil ni enregistrée par l'API.
import { coarsePosition, type LatLng } from "@orasso/shared";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";

/**
 * `checking` : on regarde la permission ; `ask` : carte « Activer / Plus tard » ; `later` : « Plus tard » ;
 * `asking` : demande en cours ; `on` : position utilisée ; `denied` : refusée ou indisponible.
 */
export type ExplorerPositionStatus = "checking" | "ask" | "later" | "asking" | "on" | "denied";

export type ExplorerPosition = {
  position: LatLng | null;
  status: ExplorerPositionStatus;
  request: () => Promise<void>;
  later: () => void;
  clear: () => void;
};

async function read(): Promise<LatLng> {
  const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return coarsePosition({ lat: fix.coords.latitude, lng: fix.coords.longitude });
}

export function useExplorerPosition(): ExplorerPosition {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<ExplorerPositionStatus>("checking");

  useEffect(() => {
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
        } else setStatus(current.status === "denied" && !current.canAskAgain ? "denied" : "ask");
      } catch {
        if (alive) setStatus("ask");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const request = useCallback(async () => {
    setStatus("asking");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setStatus("denied");
        return;
      }
      setPosition(await read());
      setStatus("on");
    } catch {
      setPosition(null);
      setStatus("denied");
    }
  }, []);

  const later = useCallback(() => setStatus("later"), []);
  const clear = useCallback(() => {
    setPosition(null);
    setStatus("later");
  }, []);

  return { position, status, request, later, clear };
}
