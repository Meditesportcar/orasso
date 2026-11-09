// Ce que montre la page d'un souvenir selon l'état de la lecture (lot R7j, tour 3). `useApi` garde la dernière valeur en cas
// d'erreur : c'est voulu pour une panne réseau (la copie du téléphone, annoncée « hors ligne »), mais pas après un refus
// définitif de l'API (404 : plus mon tampon, événement passé sur invitation ou retiré ; 403) : la page et sa copie
// disparaissent, il ne reste que « Ce souvenir n'est pas disponible ».
import { cacheSetJson } from "../../lib/kv";

export const memoryCacheKey = (eventId: string) => `memory.${eventId}`;

type State = { data: unknown; error: { status: number } | null; offline: boolean };

/** Refus définitif de l'API : la page n'existe pas (ou plus) pour moi. */
export const isRefusal = (error: { status: number } | null): boolean =>
  error !== null && (error.status === 404 || error.status === 403);

export type MemoryView =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "ready"; offline: boolean };

export function memoryView({ data, error, offline }: State): MemoryView {
  if (isRefusal(error)) return { kind: "unavailable" };
  if (data) return { kind: "ready", offline };
  return error ? { kind: "error" } : { kind: "loading" };
}

/** Efface la copie gardée sur le téléphone (le cache n'a pas de suppression : une valeur nulle ne se lit jamais). */
export const forgetMemory = (eventId: string) => cacheSetJson(memoryCacheKey(eventId), null);
