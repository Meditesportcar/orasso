// Barre d'onglets et accès flottant masqués (lot C1, artefact DA v2 : `.app.is-flow .tabbar, .near { display: none }` ;
// feuilles `#sheets` au-dessus de la barre). Un écran de flux affiché (assistant de création, page masquée d'un
// groupe d'onglets) ou une feuille ouverte retirent la barre : la barre est rendue par le navigateur d'onglets, hors de
// l'écran, d'où ce petit magasin partagé (même principe que `GroundQuiet`, qui compte déjà les feuilles ouvertes).

import { useEffect, useSyncExternalStore } from "react";
import { useIsGroundQuiet } from "./olive/quiet";

let flows = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Un écran de flux demande le retrait de la barre d'onglets tant que `active` est vrai (écran affiché). */
export function useFlowChrome(active: boolean) {
  useEffect(() => {
    if (!active) return;
    flows++;
    emit();
    return () => {
      flows--;
      emit();
    };
  }, [active]);
}

/** Vrai tant qu'un écran de flux est affiché ou qu'une feuille est ouverte : la barre et l'accès flottant se retirent. */
export function useTabBarHidden(): boolean {
  const inFlow = useSyncExternalStore(
    subscribe,
    () => flows > 0,
    () => false,
  );
  const sheet = useIsGroundQuiet();
  return inFlow || sheet;
}
