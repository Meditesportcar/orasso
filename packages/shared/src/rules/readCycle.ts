// Lot R8q, suite tour 6 : le cycle de lecture de « Pratique », le même sur le site et dans l'appli (et pour la position). Sans
// dépendance native : l'horloge, la visibilité et le départ d'une lecture sont injectés, pour que les règles se testent.
//
// Règle : une lecture a une issue (`settled`) ; toute issue **remplace** les échéances précédentes (une minuterie, jamais deux) ;
//  - transitoire (réseau, 5xx) ou partielle : relance espacée (`nextPracticalRead`), jamais d'un écran masqué (reprise au retour) ;
//  - refus (4xx) : aucune minuterie, l'heure est retenue, relu au retour seulement après `PRACTICAL_STALE_MS` ;
//  - complète : tout repart à 0 ;
//  - inconnue (une exception qui n'est pas une réponse du serveur) : aucune relance automatique, jamais relue avant « Réessayer ».
import {
  createSingleTimer,
  nextPracticalRead,
  type PracticalReadOutcome,
  practicalRefusedReadAllowed,
  practicalResumeDelay,
} from "./practicalRetry";

export type ReadCycleOutcome = PracticalReadOutcome | "unknown";

export type ReadCycleDeps = {
  /** Lance une lecture maintenant (le hook la rattache à sa lecture, `begin` est appelé quand elle part). */
  run: () => void;
  /** L'écran est-il visible (onglet visible, appli au premier plan, écran au focus) ? */
  visible: () => boolean;
  now?: () => number;
};

export function createReadCycle(deps: ReadCycleDeps) {
  const now = deps.now ?? Date.now;
  const timer = createSingleTimer();
  let calendarStep = 0;
  let networkAttempt = 0;
  let lastStart = 0;
  let refusedAt = 0;
  let halted = false;
  // Une lecture est due mais attend le retour sur l'écran (échéance tombée masquée, ou échec transitoire).
  let pending = false;

  const fire = () => {
    if (!deps.visible()) {
      pending = true;
      return;
    }
    pending = false;
    deps.run();
  };

  const manual = () => {
    timer.cancel();
    calendarStep = 0;
    networkAttempt = 0;
    refusedAt = 0;
    halted = false;
    pending = false;
  };

  return {
    /** Une lecture part : l'écart minimal de 15 s se compte depuis ici. */
    begin() {
      lastStart = now();
    },
    /** L'issue de la lecture : elle remplace toute échéance en attente. */
    settled(outcome: ReadCycleOutcome) {
      timer.cancel();
      pending = false;
      if (outcome === "unknown") {
        halted = true;
        refusedAt = 0;
        return;
      }
      halted = false;
      refusedAt = outcome === "refused" ? now() : 0;
      const step = nextPracticalRead(outcome, calendarStep, networkAttempt);
      calendarStep = step.calendarStep;
      networkAttempt = step.networkAttempt;
      if (step.delay !== null) timer.schedule(fire, step.delay);
      // Un échec transitoire reprend au retour sur l'écran même quand la série de relances est finie.
      if (outcome === "transient") pending = true;
    },
    /**
     * Retour sur l'écran (onglet visible, appli au premier plan, retour en ligne). Une reprise due part à l'écart de 15 s (tout de
     * suite, ou au délai restant, en remplaçant l'échéance précédente) ; un refus n'est relu qu'après `PRACTICAL_STALE_MS`.
     * `"idle"` : rien n'était dû.
     */
    resume(): "started" | "scheduled" | "idle" {
      if (!deps.visible()) return "idle";
      if (pending) {
        pending = false;
        const wait = practicalResumeDelay(lastStart, now());
        if (wait <= 0) {
          timer.cancel();
          deps.run();
          return "started";
        }
        timer.schedule(fire, wait);
        return "scheduled";
      }
      if (refusedAt > 0) {
        if (!practicalRefusedReadAllowed(refusedAt, lastStart, now())) return "idle";
        refusedAt = 0;
        timer.cancel();
        deps.run();
        return "started";
      }
      return "idle";
    },
    /** Un refus ou une erreur inconnue : aucune relecture automatique d'ici là (sauf le retour après `PRACTICAL_STALE_MS` d'un refus). */
    blocked(): boolean {
      return halted || refusedAt > 0;
    },
    /** « Réessayer » : tout repart à 0 (le hook lance la lecture). */
    manual,
    /** Nouvelles entrées ou autre compte : plus rien d'avant. */
    reset() {
      manual();
      lastStart = 0;
    },
    dispose() {
      timer.cancel();
      pending = false;
    },
    /** Pour les tests. */
    state: () => ({ calendarStep, networkAttempt, refusedAt, halted, pending, scheduled: timer.pending() }),
  };
}

/** Ce que la relecture d'une position a donné : réponse (même partielle), panne transitoire, refus ou erreur inconnue. */
export type PositionOutcome = "ok" | "transient" | "refused" | "unknown";

/**
 * Le calendrier unique des relectures de position (3, 6, 12, 24 s tant que les lieux sont partiels), porté par le magasin et partagé par
 * tous les écrans montés (`retain`) : une seule chaîne, un seul résultat par relecture. Un refus retient son heure (relu au retour
 * après `PRACTICAL_STALE_MS`) ; une erreur inconnue l'arrête ; une réponse complète (`setPartial(false)`) annule tout.
 */
export function createPositionCalendar(deps: {
  refresh: () => Promise<PositionOutcome>;
  visible: () => boolean;
  now?: () => number;
}) {
  let users = 0;
  let partial = false;
  let started = false;
  let generation = 0;
  const active = () => users > 0 && partial;
  const cycle: ReturnType<typeof createReadCycle> = createReadCycle({
    visible: deps.visible,
    now: deps.now,
    run: () => {
      const gen = generation;
      cycle.begin();
      void deps.refresh().then((outcome) => {
        // Complète, démontée ou autre compte entre-temps : cette réponse n'a plus de suite.
        if (gen !== generation || !active()) return;
        cycle.settled(outcome === "ok" ? "partial" : outcome);
      });
    },
  });
  const sync = () => {
    if (active()) {
      if (!started) {
        started = true;
        cycle.settled("partial");
      }
    } else if (started) {
      started = false;
      generation += 1;
      cycle.reset();
    }
  };
  return {
    /** Les lieux de la position sont-ils partiels ? (à chaque changement du magasin) */
    setPartial(next: boolean) {
      partial = next;
      sync();
    },
    /** Un écran monté demande le calendrier ; la fonction rendue le libère. */
    retain(): () => void {
      users += 1;
      sync();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        users -= 1;
        sync();
      };
    },
    /** Retour sur l'écran : onglet visible, appli au premier plan. */
    resume() {
      if (active()) cycle.resume();
    },
    state: () => cycle.state(),
  };
}
