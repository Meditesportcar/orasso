// GroundQuiet (lot 39) : quand une feuille est ouverte, le fond animé « battle » se tait (plus de nouvelle meute, la
// meute en cours disparaît). Une feuille est rendue sous l'écran, pas au-dessus du fond : un contexte React ne remonte
// pas jusqu'au Ground, d'où ce petit magasin partagé (un compteur des feuilles ouvertes). Pur React : sert au natif
// (Sheet de Motion.tsx) et au site.

import { useEffect, useSyncExternalStore } from "react";

let open = 0;
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

/** Une feuille (ou tout calque modal) demande le silence du fond tant que `active` est vrai. */
export function useGroundQuiet(active: boolean) {
  useEffect(() => {
    if (!active) return;
    open++;
    emit();
    return () => {
      open--;
      emit();
    };
  }, [active]);
}

/** Vrai tant qu'au moins une feuille est ouverte : le fond animé ne lance plus de meute. */
export function useIsGroundQuiet(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open > 0,
    () => false,
  );
}

/** Version composant de useGroundQuiet : `<GroundQuiet active={visible} />` à côté d'un calque modal. */
export function GroundQuiet({ active = true }: { active?: boolean }) {
  useGroundQuiet(active);
  return null;
}
