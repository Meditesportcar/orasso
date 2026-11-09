// Le son des vidéos de story (lot R7g) : avec le son au départ (sur le site elle est muette : un navigateur l'exige), et ce qu'on a choisi est gardé **pendant la
// session** (en mémoire : l'appli relancée repart muette). Un petit magasin lu par la barre de la vidéo (bouton son) et par
// le lecteur.
import { useSyncExternalStore } from "react";

let muted = false;
const listeners = new Set<() => void>();

export const isVideoMuted = () => muted;
export function setVideoMuted(next: boolean) {
  if (next === muted) return;
  muted = next;
  for (const l of listeners) l();
}
export const toggleVideoMuted = () => setVideoMuted(!muted);

export function useVideoMuted(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => muted,
    () => false,
  );
}
