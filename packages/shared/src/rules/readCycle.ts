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
  // Le délai de la prochaine lecture programmée (gardé quand les minuteries sont suspendues : `rearm` le reprogramme tel quel).
  let scheduledDelay: number | null = null;
  // L'heure de cette échéance : une reprise ne reprogramme que le reste (des allers-retours rapides ne repoussent rien).
  let dueAt = 0;
  // Un numéro par reprise manuelle ou remise à zéro : l'issue d'une lecture partie avant est ignorée (pas de double lecture).
  let epoch = 0;

  const fire = () => {
    if (!deps.visible()) {
      pending = true;
      return;
    }
    pending = false;
    scheduledDelay = null;
    deps.run();
  };

  const manual = () => {
    epoch += 1;
    scheduledDelay = null;
    timer.cancel();
    calendarStep = 0;
    networkAttempt = 0;
    refusedAt = 0;
    halted = false;
    pending = false;
  };

  return {
    /** Une lecture part : l'écart minimal de 15 s se compte depuis ici. Rend le numéro de la lecture (voir `current`). */
    begin(): number {
      lastStart = now();
      return epoch;
    },
    /** Cette lecture est-elle toujours la dernière ? Faux après « Réessayer » ou une remise à zéro : son issue est ignorée. */
    current(token: number): boolean {
      return token === epoch;
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
      scheduledDelay = step.delay;
      dueAt = now() + (step.delay ?? 0);
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
    /**
     * Reprend après une suspension (`dispose`) SANS rien avancer : l'échéance en attente est reprogrammée pour son heure (le reste du
     * délai, jamais un délai neuf), jamais une nouvelle issue. Sans échéance en attente, un refus ou une erreur inconnue, rien ne change.
     */
    rearm() {
      if (halted || refusedAt > 0 || scheduledDelay === null) return;
      timer.schedule(fire, Math.max(0, dueAt - now()));
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
 * Le calendrier unique des relectures de position (3, 6, 12, 24 s tant que les lieux sont partiels), partagé par tous les écrans montés
 * (`retain`) : une seule chaîne, un seul résultat par relecture. L'issue (refus et son heure, erreur inconnue, nombre de relances) est
 * GARDÉE : démonter puis remonter un écran suspend les minuteries sans l'effacer. La remise à zéro n'a lieu qu'au changement de session
 * (lieux plus partiels : `setPartial(false)`), de position (la clé change : un nouveau calendrier, les suites de l'ancienne sont jetées)
 * ou sur `retry` (« Réessayer »). Un refus retient son heure (relu au retour après `PRACTICAL_STALE_MS`) ; une erreur inconnue l'arrête.
 */
export function createPositionCalendar(deps: {
  refresh: () => Promise<PositionOutcome>;
  visible: () => boolean;
  now?: () => number;
}) {
  let users = 0;
  let partial = false;
  let key: unknown = null;
  // Le calendrier est en cours : au moins un écran monté pour des lieux partiels.
  let running = false;
  let generation = 0;
  // Une lecture est en vol (une seule, partagée par tous les écrans montés) : « Réessayer » la rejoint au lieu d'en lancer une autre.
  let reading = false;
  // Le calendrier est commencé (vrai dès le premier départ, faux seulement au changement de session ou de position) : un remontage le
  // réarme, il ne le recommence jamais (`calendarStep === 0` ne dit pas « premier départ » : « Réessayer » puis une panne le laisse à 0).
  let started = false;
  // « Réessayer » est proposé : vrai tant qu'un refus ou une erreur inconnue n'a pas été remplacé par le résultat d'une lecture.
  let failedShown = false;
  const bump = () => {
    generation += 1;
    reading = false;
    started = false;
    failedShown = false;
  };
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const active = () => users > 0 && partial;
  const cycle: ReturnType<typeof createReadCycle> = createReadCycle({
    visible: deps.visible,
    now: deps.now,
    run: () => start(),
  });
  const start = () => {
    // Une lecture est déjà en vol : sa réponse compte une fois, aucune requête concurrente.
    if (reading) return;
    const gen = generation;
    reading = true;
    cycle.begin();
    notify();
    void deps
      .refresh()
      // Une lecture qui échoue autrement (exception) ne laisse jamais `reading` bloqué : erreur inconnue.
      .catch((): PositionOutcome => "unknown")
      .then((outcome) => {
        // Une autre position (ou une autre session, ou les lieux complets) entre-temps : cette réponse n'a plus de suite ni d'effet.
        if (gen !== generation) return;
        reading = false;
        cycle.settled(outcome === "ok" ? "partial" : outcome);
        failedShown = cycle.blocked();
        // Plus aucun écran monté : l'issue est gardée, aucune minuterie ne reste.
        if (!active()) cycle.dispose();
        notify();
      });
  };
  const sync = () => {
    if (!partial) {
      // Lieux complets ou autre session : tout repart à 0.
      const changed = running || cycle.blocked();
      bump();
      cycle.reset();
      running = false;
      key = null;
      if (changed) notify();
      return;
    }
    if (active()) {
      if (!running) {
        running = true;
        // Remontage : jamais une nouvelle issue. Une issue gardée (refus, erreur inconnue) n'est pas effacée (un refus ancien est relu
        // s'il a plus de 60 s) ; une lecture en vol garde sa réponse ; l'échéance en attente est reprogrammée sans avancer l'étape ;
        // seul le tout premier départ d'un calendrier programme la première relecture.
        if (cycle.blocked()) cycle.resume();
        else if (!reading) {
          if (started) cycle.rearm();
          else {
            started = true;
            cycle.settled("partial");
          }
        }
      }
    } else if (running) {
      running = false;
      cycle.dispose();
    }
  };
  return {
    /** Les lieux de la position sont-ils partiels ? `positionKey` change à chaque nouvelle position donnée (nouveau calendrier). */
    setPartial(next: boolean, positionKey: unknown = null) {
      if (next && positionKey !== key && key !== null) {
        // Une nouvelle position : les suites de l'ancienne sont jetées, l'issue gardée ne la concerne pas.
        bump();
        cycle.reset();
        running = false;
        notify();
      }
      partial = next;
      if (next) key = positionKey;
      sync();
    },
    /** Un écran monté demande le calendrier ; la fonction rendue le libère (suspend sans effacer l'issue). */
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
      if (!active()) return;
      cycle.resume();
      notify();
    },
    /** « Réessayer » : tout repart à 0 et une relecture part tout de suite. */
    retry() {
      if (!partial) return;
      // Une lecture est en vol : elle est rejointe (un double appui ne fait pas de seconde requête et ne perd aucune étape).
      if (reading) return;
      cycle.manual();
      running = active();
      // L'état d'échec reste affiché jusqu'au résultat (le bouton est visible et désactivé pendant la lecture).
      const shown = failedShown;
      bump();
      failedShown = shown;
      started = true;
      start();
    },
    /** Une lecture de la position est en vol : « Réessayer » est désactivé (avec son libellé, sans indicateur qui tourne). */
    busy: () => reading,
    /** Le calendrier est arrêté par un refus ou une erreur inconnue : « Réessayer » est proposé. */
    failed: () => partial && failedShown,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    state: () => cycle.state(),
  };
}
