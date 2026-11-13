// L'acteur de la casquette active (lot R9n), à passer à la liste blanche d'appels (`actor` des fonctions de `api`).
import { actorKeyOf } from "./actor";
import { usePersona } from "./persona";

export function useActor(): string | null {
  const { persona, entries } = usePersona();
  return actorKeyOf(persona, entries);
}
