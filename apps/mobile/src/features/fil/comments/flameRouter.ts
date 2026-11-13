// La flamme d'un commentaire appartient à la **personne**, pas à la casquette (R9n, tour 5, Codex 1). Modèle :
// 1. chaque toucher envoie `want = !étatAffichéAuGeste`, calculé dans le magasin où il a lieu : on n'inverse jamais l'intention en cours
//    d'une autre casquette (B qui voit la flamme éteinte l'allume, même si A vient de la rallumer ou de l'éteindre) ;
// 2. une seule file par **connexion**, compte et commentaire : elle n'exécute que la dernière intention, et son résultat (celui du serveur)
//    va à tous les magasins qui ont touché pendant la série ;
// 3. la clé contient la génération de connexion (`reset`, appelé à la déconnexion) : une nouvelle session ne rejoint jamais une ancienne
//    file ; une file dont plus aucun magasin n'est vivant n'est pas rejointe non plus ;
// 4. jamais deux envois à la fois pour un commentaire : une file remplacée (morte ou remise à zéro) **attend** la fin de l'ancienne avant
//    son premier envoi ; la garde `alive` porte sur **tous** les magasins de la file (si le premier meurt, l'intention de B part et B
//    reçoit l'état ; seuls les magasins vivants reçoivent le résultat).
import { reactionGuess } from "@orasso/shared";

export type FlameState = { reactionsCount: number; reactedByMe: boolean };
type Io = { send: (on: boolean) => Promise<FlameState>; apply: (s: FlameState) => void; alive?: () => boolean };
type Queue = { want: boolean; known: FlameState; members: Io[] };

/** La clé de la file : le compte (partie de la portée avant `|`), la publication et le commentaire. */
export const flameKey = (scope: string | null | undefined, postId: string, commentId: string): string =>
  `${(scope ?? "").split("|")[0]}|${postId}|${commentId}`;

const isAlive = (m: Io): boolean => !m.alive || m.alive();

export function createFlameRouter() {
  const queues = new Map<string, Queue>();
  /** La dernière série lancée par commentaire (toutes connexions confondues) : la suivante attend sa fin. */
  const inflight = new Map<string, Promise<void>>();
  let connection = 0;
  return {
    /** Déconnexion : les files en cours ne sont plus rejointes (une nouvelle session ouvre les siennes, après la fin de l'ancienne). */
    reset() {
      connection += 1;
      queues.clear();
    },
    fire(key: string, displayed: FlameState, io: Io): Promise<void> {
      const full = `${connection}|${key}`;
      let q = queues.get(full);
      if (q && !q.members.some(isAlive)) {
        queues.delete(full);
        q = undefined;
      }
      // L'intention de ce toucher : l'inverse de ce que SON écran montre, jamais l'inverse de l'intention d'une autre casquette.
      const want = !displayed.reactedByMe;
      io.apply(reactionGuess(displayed, want));
      if (q) {
        q.want = want;
        q.members.push(io);
        return Promise.resolve();
      }
      const mine: Queue = { want, known: displayed, members: [io] };
      queues.set(full, mine);
      const previous = inflight.get(key);
      const run = (async () => {
        // Jamais deux envois simultanés pour un commentaire : on attend l'ancienne série (qui s'arrête à son prochain tour de boucle).
        if (previous) await previous.catch(() => undefined);
        let last: FlameState = mine.known;
        try {
          for (;;) {
            if (!mine.members.some(isAlive)) return;
            const sent = mine.want;
            last = await io.send(sent);
            if (mine.want === sent) break;
          }
        } catch {
          // Panne : l'état connu de l'API (le dernier rendu, ou celui d'avant le premier toucher).
        } finally {
          if (queues.get(full) === mine) queues.delete(full);
        }
        for (const member of mine.members) if (isAlive(member)) member.apply(last);
      })();
      inflight.set(key, run);
      return run.finally(() => {
        if (inflight.get(key) === run) inflight.delete(key);
      });
    },
  };
}

/** La file de flammes de l'appli (une par connexion). */
export const flames = createFlameRouter();
