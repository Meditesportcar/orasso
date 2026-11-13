// L'état ouvert/fermé de la feuille « Mes casquettes » (lot R9n) : un petit magasin partagé, parce que trois endroits l'ouvrent
// (la pastille de la barre du haut, « Changer » du Fil, la ligne « Mes casquettes » de la Page) et qu'une seule feuille existe,
// montée par le groupe d'onglets (`CasquettesSheetHost`, dans `PersonaTabs`) : elle couvre alors les deux bandes.
import { useSyncExternalStore } from "react";

let open = false;
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

export function openCasquettes() {
  open = true;
  emit();
}

export function closeCasquettes() {
  if (!open) return;
  open = false;
  emit();
}

export function useCasquettesOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}
