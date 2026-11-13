// La flamme d'un commentaire appartient à la **personne**, pas à la casquette (R9n, tour 5, Codex 1) : une seule file par compte et par
// commentaire (`createFlameGate`), quelle que soit la casquette qui touche. Le résultat de la file va à **tous** les magasins qui ont
// touché pendant la série (A, puis B) : aucun magasin ne contredit le serveur.
export type FlameState = { reactionsCount: number; reactedByMe: boolean };

type Gate = {
  fire(
    id: string,
    current: FlameState,
    io: { send: (on: boolean) => Promise<FlameState>; apply: (s: FlameState) => void; alive?: () => boolean },
  ): Promise<void>;
};

/** La clé de la file : le compte (partie de la portée avant `|`), la publication et le commentaire. */
export const flameKey = (scope: string | null | undefined, postId: string, commentId: string): string =>
  `${(scope ?? "").split("|")[0]}|${postId}|${commentId}`;

export function createFlameRouter(gate: Gate) {
  const appliers = new Map<string, Set<(s: FlameState) => void>>();
  return {
    fire(
      key: string,
      current: FlameState,
      io: { send: (on: boolean) => Promise<FlameState>; apply: (s: FlameState) => void; alive?: () => boolean },
    ): Promise<void> {
      const first = !appliers.has(key);
      const set = appliers.get(key) ?? new Set<(s: FlameState) => void>();
      appliers.set(key, set);
      set.add(io.apply);
      const run = gate.fire(key, current, {
        send: io.send,
        // Le premier toucher porte la file : ses `apply` (intention, puis résultat) vont à tous ceux qui ont touché.
        apply: first
          ? (state) => {
              for (const apply of set) apply(state);
            }
          : io.apply,
        alive: io.alive,
      });
      return first ? run.finally(() => appliers.delete(key)) : run;
    },
  };
}
