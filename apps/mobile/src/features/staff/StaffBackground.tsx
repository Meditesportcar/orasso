// Envoi de la file du staff en arrière-plan de l'appli (ARCHITECTURE.md § 4.4) : à l'ouverture, au retour du réseau,
// puis toutes les 30 s tant qu'il reste quelque chose à envoyer ; synchro différentielle des listes toutes les minutes ;
// purge des événements fermés (J+1). Monté une fois
// à la racine, compte ouvert : les scans partent même si le staff a quitté le mode staff.
import { useNetworkState } from "expo-network";
import { useEffect, useRef } from "react";

import { useSession } from "@/lib/session";
import { flush, flushNow, purgeExpired, refreshOpenEvents } from "@/lib/staff/runtime";

const EVERY_MS = 30_000;
const SYNC_EVERY_MS = 60_000;

export function StaffBackground() {
  const { me } = useSession();
  const userId = me?.user.id ?? null;
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const wasOnline = useRef(online);

  useEffect(() => {
    if (!userId) return;
    void purgeExpired()
      .then(() => flush(userId))
      .catch(() => undefined);
    const timer = setInterval(() => {
      void purgeExpired()
        .then(() => flush(userId))
        .catch(() => undefined);
    }, EVERY_MS);
    // Liste tenue à jour en ligne (différentielle, vérifiée) : ré-acceptations, révocations, entrées des collègues.
    const sync = setInterval(() => void refreshOpenEvents(userId).catch(() => undefined), SYNC_EVERY_MS);
    return () => {
      clearInterval(timer);
      clearInterval(sync);
    };
  }, [userId]);

  // Le réseau revient : tout repart tout de suite, sans attendre le délai des essais précédents.
  useEffect(() => {
    if (userId && online && !wasOnline.current) void flushNow(userId).catch(() => undefined);
    wasOnline.current = online;
  }, [online, userId]);

  return null;
}
