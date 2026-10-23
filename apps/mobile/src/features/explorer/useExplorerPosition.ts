// Position de l'Explorer v2 (lot 44, `s-explore`) : à la première ouverture, si l'appareil n'a encore rien répondu, une
// carte propose d'activer la position (« Trie par distance depuis là où tu es ») ; « Plus tard » est retenu sur
// l'appareil (on ne redemande qu'au bout de `ASK_AGAIN_DAYS` jours, ou d'un geste sur l'icône) ; déjà accordée, elle
// est lue tout de suite ; refusée, petite icône rouge et repli sur le département favori (le tri par distance de l'API
// part alors du secteur du profil) ; refusée pour de bon, l'icône ouvre les réglages du téléphone. La position est
// ramenée au dixième de degré (environ 11 km), gardée en mémoire de l'écran et envoyée seulement dans l'adresse de la
// requête de liste : jamais écrite sur l'appareil ni enregistrée par l'API.
import { coarsePosition, type LatLng } from "@orasso/shared";
import * as Location from "expo-location";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";

import { nowMs } from "@/lib/clock";
import { kvGet, kvSet } from "@/lib/kv";
import { shouldAsk } from "./queries";

/**
 * `checking` : on regarde la permission ; `ask` : carte « Activer / Plus tard » ; `later` : « Plus tard » ;
 * `asking` : demande en cours ; `on` : position utilisée ; `denied` : refusée ou indisponible.
 */
export type ExplorerPositionStatus = "checking" | "ask" | "later" | "asking" | "on" | "denied";

export type ExplorerPosition = {
  position: LatLng | null;
  status: ExplorerPositionStatus;
  /** Refus définitif : seule la page des réglages du téléphone peut rendre la position. */
  blocked: boolean;
  request: () => Promise<void>;
  later: () => void;
  clear: () => void;
};

const LATER_KEY = "explorer.positionLater";

async function read(): Promise<LatLng> {
  const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return coarsePosition({ lat: fix.coords.latitude, lng: fix.coords.longitude });
}

export function useExplorerPosition(): ExplorerPosition {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<ExplorerPositionStatus>("checking");
  const [blocked, setBlocked] = useState(false);

  // Lot M3, tour 2 : l'onglet est préchargé ; la position (GPS) n'est lue qu'au premier affichage de l'écran.
  const focused = useIsFocused();
  const [seen, setSeen] = useState(focused);
  if (focused && !seen) setSeen(true);

  useEffect(() => {
    if (!seen) return;
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
        } else if (current.status === "denied" && !current.canAskAgain) {
          setBlocked(true);
          setStatus("denied");
        } else {
          const later = Number(await kvGet(LATER_KEY)) || null;
          if (alive) setStatus(shouldAsk(later, nowMs()) ? "ask" : "later");
        }
      } catch {
        if (alive) setStatus("ask");
      }
    })();
    return () => {
      alive = false;
    };
  }, [seen]);

  const request = useCallback(async () => {
    if (blocked) {
      void Linking.openSettings();
      return;
    }
    setStatus("asking");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setBlocked(!permission.canAskAgain && permission.status === "denied");
        setStatus("denied");
        return;
      }
      setPosition(await read());
      setStatus("on");
    } catch {
      setPosition(null);
      setStatus("denied");
    }
  }, [blocked]);

  const later = useCallback(() => {
    setStatus("later");
    void kvSet(LATER_KEY, String(nowMs()));
  }, []);
  const clear = useCallback(() => {
    setPosition(null);
    setStatus("later");
  }, []);

  return { position, status, blocked, request, later, clear };
}
