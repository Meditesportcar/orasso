// Le tampon est tombé (lot 50, relecture) : `StampArrival`, monté une seule fois à la racine de l'appli, écoute le canal
// `user:{id}` et joue la chute ; quand elle est finie il le dit ici, et les écrans (le passeport, qui remet le tampon sur sa
// page) s'abonnent. Un seul écouteur du canal : jamais deux chutes ni deux retours haptiques.
import type { PassportStamp } from "@orasso/shared";
import { useEffect, useRef } from "react";

type Listener = (stamp: PassportStamp) => void;
const listeners = new Set<Listener>();

export function emitStamped(stamp: PassportStamp): void {
  for (const listener of [...listeners]) listener(stamp);
}

export function onStamped(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pour un écran : appelé quand le tampon qui vient de tomber a fini sa chute. */
export function useStampedListener(listener: Listener): void {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => onStamped((stamp) => ref.current(stamp)), []);
}
