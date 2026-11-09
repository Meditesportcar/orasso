// Regrouper les relectures (lot R7l2, tour 3) : un canal temps réel qui envoie un message par seconde relance la lecture
// plus vite qu'elle ne répond (4G, 2 s de réponse). Jeter les réponses « dépassées » n'en applique alors jamais aucune.
// Ici : une lecture à la fois ; les demandes arrivées pendant qu'elle court n'en font qu'une, relancée à sa fin. Chaque
// réponse arrive donc dans l'ordre et s'applique, la dernière est toujours postérieure à la dernière demande. Pur, testé seul.
export function createCoalescedRun<T>(run: () => Promise<T>): () => Promise<T> {
  let running = false;
  let waiting: { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } | null = null;

  const launch = (): Promise<T> => {
    running = true;
    const p = (async () => run())();
    const done = () => {
      running = false;
      if (waiting) {
        const next = waiting;
        waiting = null;
        launch().then(next.resolve, next.reject);
      }
    };
    p.then(done, done);
    return p;
  };

  return () => {
    if (!running) return launch();
    if (!waiting) {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((a, b) => {
        resolve = a;
        reject = b;
      });
      waiting = { promise, resolve, reject };
    }
    return waiting.promise;
  };
}
