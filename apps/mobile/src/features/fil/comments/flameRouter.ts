// La flamme d'un commentaire appartient à la **personne**, pas à la casquette (R9n, tour 5, Codex 1). Modèle :
// 1. chaque toucher envoie `want = !étatAffichéAuGeste`, calculé dans le magasin où il a lieu : on n'inverse jamais l'intention en cours
//    d'une autre casquette (B qui voit la flamme éteinte l'allume, même si A vient de la rallumer ou de l'éteindre) ;
// 2. une seule file par **connexion**, compte et commentaire : elle n'exécute que la dernière intention, et son résultat (celui du serveur)
//    va à tous les magasins qui ont touché pendant la série ;
// 3. la clé contient la génération de connexion (`resetFlames`, appelé à la déconnexion) : une nouvelle session ne rejoint jamais une
//    ancienne file ; une file dont le `alive` du premier toucher est faux (publication disparue puis relue) n'est pas rejointe non plus.
import { reactionGuess } from "@orasso/shared";

export type FlameState = { reactionsCount: number; reactedByMe: boolean };
type Io = { send: (on: boolean) => Promise<FlameState>; apply: (s: FlameState) => void; alive?: () => boolean };
type Queue = { want: boolean; known: FlameState; appliers: Set<(s: FlameState) => void>; alive?: () => boolean };

/** La clé de la file : le compte (partie de la portée avant `|`), la publication et le commentaire. */
export const flameKey = (scope: string | null | undefined, postId: string, commentId: string): string =>
  `${(scope ?? "").split("|")[0]}|${postId}|${commentId}`;

export function createFlameRouter() {
  const queues = new Map<string, Queue>();
  let connection = 0;
  return {
    /** Déconnexion : les files en cours ne sont plus rejointes (une nouvelle session ouvre les siennes). */
    reset() {
      connection += 1;
      queues.clear();
    },
    fire(key: string, displayed: FlameState, io: Io): Promise<void> {
      const full = `${connection}|${key}`;
      let q = queues.get(full);
      if (q?.alive && !q.alive()) {
        queues.delete(full);
        q = undefined;
      }
      // L'intention de ce toucher : l'inverse de ce que SON écran montre, jamais l'inverse de l'intention d'une autre casquette.
      const want = !displayed.reactedByMe;
      io.apply(reactionGuess(displayed, want));
      if (q) {
        q.want = want;
        q.appliers.add(io.apply);
        return Promise.resolve();
      }
      const mine: Queue = { want, known: displayed, appliers: new Set([io.apply]), alive: io.alive };
      queues.set(full, mine);
      return (async () => {
        let last: FlameState = mine.known;
        try {
          for (;;) {
            if (io.alive && !io.alive()) return;
            const sent = mine.want;
            last = await io.send(sent);
            if (mine.want === sent) break;
          }
        } catch {
          // Panne : l'état connu de l'API (le dernier rendu, ou celui d'avant le premier toucher).
        } finally {
          if (queues.get(full) === mine) queues.delete(full);
        }
        if (io.alive && !io.alive()) return;
        for (const apply of mine.appliers) apply(last);
      })();
    },
  };
}

/** La file de flammes de l'appli (une par connexion). */
export const flames = createFlameRouter();
