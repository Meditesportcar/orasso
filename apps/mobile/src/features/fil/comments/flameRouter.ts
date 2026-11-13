// La flamme d'un commentaire appartient à la **personne**, pas à la casquette (R9n, tour 5, Codex 1) : une seule file par compte et par
// commentaire (`createFlameGate`), quelle que soit la casquette qui touche. Le résultat de la file va à **tous** les magasins qui ont
// touché pendant la série (A, puis B) : aucun magasin ne contredit le serveur. Si la file en cours est morte (son `alive` du premier
// appui est faux : compte u1 → u2 → u1, publication disparue puis relue), un nouvel appui ouvre une **nouvelle** file (suffixe de génération).
export type FlameState = { reactionsCount: number; reactedByMe: boolean };

type Io = { send: (on: boolean) => Promise<FlameState>; apply: (s: FlameState) => void; alive?: () => boolean };
type Gate = { fire(id: string, current: FlameState, io: Io): Promise<void> };

/** La clé de la file : le compte (partie de la portée avant `|`), la publication et le commentaire. */
export const flameKey = (scope: string | null | undefined, postId: string, commentId: string): string =>
  `${(scope ?? "").split("|")[0]}|${postId}|${commentId}`;

export function createFlameRouter(gate: Gate) {
  const queues = new Map<string, { set: Set<(s: FlameState) => void>; alive?: () => boolean }>();
  const generation = new Map<string, number>();
  return {
    fire(key: string, current: FlameState, io: Io): Promise<void> {
      let queue = queues.get(key);
      if (queue?.alive && !queue.alive()) {
        // La file en cours est morte : on la laisse finir seule et on en ouvre une nouvelle.
        queues.delete(key);
        generation.set(key, (generation.get(key) ?? 0) + 1);
        queue = undefined;
      }
      const first = !queue;
      const q = queue ?? { set: new Set<(s: FlameState) => void>(), alive: io.alive };
      queues.set(key, q);
      q.set.add(io.apply);
      const gateKey = `${key}#${generation.get(key) ?? 0}`;
      const run = gate.fire(gateKey, current, {
        send: io.send,
        // Le premier toucher porte la file : ses `apply` (intention, puis résultat) vont à tous ceux qui ont touché.
        apply: first
          ? (state) => {
              for (const apply of q.set) apply(state);
            }
          : io.apply,
        alive: io.alive,
      });
      return first
        ? run.finally(() => {
            if (queues.get(key) === q) queues.delete(key);
          })
        : run;
    },
  };
}
