import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFollowTracker,
  createReadGate,
  createSingleTimer,
  nextPracticalRead,
  PRACTICAL_MIN_GAP_MS,
  PRACTICAL_STALE_MS,
  positionCalendarContinues,
  practicalFailureOutcome,
  practicalPendingDelay,
  practicalReadAllowed,
  practicalRefusedReadAllowed,
  practicalResumeDelay,
  practicalRetryDelay,
  shouldRetryPractical,
  weatherFollowKey,
} from "./practicalRetry";

describe("relances de Pratique (R8q, tour 3)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("espacées : 15 s, 30 s, 60 s, puis toutes les 2 minutes", () => {
    expect([0, 1, 2, 3, 4, 9].map(practicalRetryDelay)).toEqual([15_000, 30_000, 60_000, 120_000, 120_000, 120_000]);
    expect(practicalRetryDelay(-3)).toBe(15_000);
  });

  it("sur une erreur réseau seulement, écran affiché et appli au premier plan", () => {
    expect(shouldRetryPractical({ network: true, focused: true, foreground: true })).toBe(true);
    // Un 403 (compte suspendu), un 429 ou un 404 ne se relancent pas.
    expect(shouldRetryPractical({ network: false, focused: true, foreground: true })).toBe(false);
    expect(shouldRetryPractical({ network: true, focused: false, foreground: true })).toBe(false);
    expect(shouldRetryPractical({ network: true, focused: true, foreground: false })).toBe(false);
  });

  it("jamais deux lectures à moins de 15 s l'une de l'autre : moins de 240 lectures par heure et par écran", () => {
    expect(practicalReadAllowed(0, 1)).toBe(true);
    expect(practicalReadAllowed(1_000, 1_000 + PRACTICAL_MIN_GAP_MS - 1)).toBe(false);
    expect(practicalReadAllowed(1_000, 1_000 + PRACTICAL_MIN_GAP_MS)).toBe(true);
  });

  it("une seule minuterie : en programmer une autre annule la précédente, annuler arrête tout", () => {
    const timer = createSingleTimer();
    const calls: string[] = [];
    timer.schedule(() => calls.push("a"), 500);
    timer.schedule(() => calls.push("b"), 500);
    vi.advanceTimersByTime(600);
    expect(calls).toEqual(["b"]);
    // Une chaîne d'attente d'identité qui se reprogramme reste unique, et rien ne survit au démontage.
    let tries = 0;
    const wait = () => {
      tries += 1;
      timer.schedule(wait, 500);
    };
    wait();
    wait();
    vi.advanceTimersByTime(1_600);
    expect(tries).toBe(2 + 3);
    timer.cancel();
    vi.advanceTimersByTime(5_000);
    expect(tries).toBe(2 + 3);
    expect(timer.pending()).toBe(false);
  });

  it("suivi de la météo : une tentative par lieu, remise à zéro au changement de compte, écho d'un geste ignoré", () => {
    let t = 1_000;
    const tracker = createFollowTracker(() => t, 10_000);
    expect(tracker.shouldFollow(null)).toBe(false);
    expect(tracker.shouldFollow("Perpignan")).toBe(true);
    expect(tracker.shouldFollow("Perpignan")).toBe(false);
    // Un autre compte reprend le même lieu : la première position n'est pas ignorée.
    tracker.reset();
    expect(tracker.shouldFollow("Perpignan")).toBe(true);
    // Un geste dans « Pratique » donne sa case à la météo : le lieu qui en résulte n'est pas relu.
    tracker.echo();
    expect(tracker.shouldFollow("Canet-en-Roussillon")).toBe(false);
    t += 11_000;
    expect(tracker.shouldFollow("Argelès-sur-Mer")).toBe(true);
  });

  it("tour 5 : deux cases distinctes qui portent toutes deux « Ma position » : la seconde est suivie ; la même case rafraîchie, rien", () => {
    const tracker = createFollowTracker(() => 0, 0);
    const a = weatherFollowKey({ lat: 42.5, lng: 3.0 });
    const b = weatherFollowKey({ lat: 42.7, lng: 2.9 });
    expect(a).not.toBe(b);
    expect(tracker.shouldFollow(a)).toBe(true);
    // Un rafraîchissement de la météo (même case, autre heure de prévision, même libellé) ne relance rien.
    expect(tracker.shouldFollow(weatherFollowKey({ lat: 42.5, lng: 3.0 }))).toBe(false);
    expect(tracker.shouldFollow(b)).toBe(true);
    expect(weatherFollowKey(null)).toBeNull();
  });
});

describe("relectures tant que des chargements sont en cours (suite R8q, tour 2)", () => {
  it("3 s, 6 s, 12 s, 24 s, puis arrêt", () => {
    expect([0, 1, 2, 3, 4, 10].map(practicalPendingDelay)).toEqual([3_000, 6_000, 12_000, 24_000, null, null]);
  });
});

describe("une lecture à la fois sans en perdre (suite R8q, tour 3)", () => {
  it("une demande qui arrive pendant une lecture attend et repart à sa fin (changement de compte pendant la requête)", () => {
    const gate = createReadGate();
    expect(gate.enter()).toBe(true);
    // Le nouveau compte demande sa lecture pendant celle de l'ancien : elle est mise en attente, une seule fois.
    expect(gate.enter()).toBe(false);
    expect(gate.enter()).toBe(false);
    expect(gate.leave()).toBe(true);
    // La lecture relancée est seule : à sa fin, rien n'attend.
    expect(gate.enter()).toBe(true);
    expect(gate.leave()).toBe(false);
  });
});

describe("suite d'une lecture (suite R8q, tour 4)", () => {
  it("réseau : relance espacée et bornée ; 403 et 429 : aucune relance", () => {
    let step = nextPracticalRead("transient", 0, 0);
    expect(step).toEqual({ delay: 15_000, calendarStep: 0, networkAttempt: 1 });
    step = nextPracticalRead("transient", step.calendarStep, step.networkAttempt);
    expect(step.delay).toBe(30_000);
    // Un refus (4xx) n'est jamais relancé, quel que soit l'état.
    expect(nextPracticalRead("refused", 0, 0).delay).toBeNull();
    expect(nextPracticalRead("refused", 2, 3).delay).toBeNull();
  });

  it("partielle puis panne réseau : le calendrier continue ; au bout de la série il s'arrête", () => {
    let step = nextPracticalRead("partial", 0, 0);
    expect(step).toEqual({ delay: 3_000, calendarStep: 1, networkAttempt: 0 });
    step = nextPracticalRead("transient", step.calendarStep, step.networkAttempt);
    expect(step.delay).toBe(6_000);
    step = nextPracticalRead("partial", step.calendarStep, step.networkAttempt);
    expect(step.delay).toBe(12_000);
    step = nextPracticalRead("partial", step.calendarStep, step.networkAttempt);
    expect(step.delay).toBe(24_000);
    step = nextPracticalRead("partial", step.calendarStep, step.networkAttempt);
    expect(step.delay).toBeNull();
  });

  it("complète puis partielle : les compteurs repartent de 0", () => {
    const done = nextPracticalRead("complete", 3, 2);
    expect(done).toEqual({ delay: null, calendarStep: 0, networkAttempt: 0 });
    expect(nextPracticalRead("partial", done.calendarStep, done.networkAttempt).delay).toBe(3_000);
  });
});

describe("refus, transitoire, complète : une règle unique (suite R8q, tour 5)", () => {
  it("transitoire : réseau (0) et 5xx ; refus : tout 4xx", () => {
    expect(practicalFailureOutcome(0)).toBe("transient");
    expect(practicalFailureOutcome(502)).toBe("transient");
    expect(practicalFailureOutcome(503)).toBe("transient");
    for (const status of [400, 401, 403, 404, 429])
      expect(practicalFailureOutcome(status), String(status)).toBe("refused");
  });

  it("un 502 est relancé à 15 s ; un refus n'a aucune minuterie", () => {
    expect(nextPracticalRead(practicalFailureOutcome(502), 0, 0)).toEqual({
      delay: 15_000,
      calendarStep: 0,
      networkAttempt: 1,
    });
    expect(nextPracticalRead(practicalFailureOutcome(429), 0, 0).delay).toBeNull();
  });

  it("un refus : retour à 10 s, aucune lecture ; retour à 61 s, une lecture", () => {
    const refusedAt = 1_000_000;
    const lastStart = refusedAt - 100;
    expect(practicalRefusedReadAllowed(refusedAt, lastStart, refusedAt + 10_000)).toBe(false);
    expect(practicalRefusedReadAllowed(refusedAt, lastStart, refusedAt + PRACTICAL_STALE_MS - 1)).toBe(false);
    expect(practicalRefusedReadAllowed(refusedAt, lastStart, refusedAt + 61_000)).toBe(true);
    // Sans refus retenu, aucune relecture de refus.
    expect(practicalRefusedReadAllowed(0, 0, 9_999_999)).toBe(false);
    // `practicalReadAllowed` garde la main : une lecture partie il y a moins de 15 s l'empêche.
    expect(practicalRefusedReadAllowed(refusedAt, refusedAt + 61_000 - 5_000, refusedAt + 61_000)).toBe(false);
  });
});

describe("reprise hors focus et calendrier de position (suite R8q, tour 5, relecture Codex)", () => {
  it("perte de focus à 3 s, retour à 5 s : la lecture partie à 0 reprend à 15 s (10 s restantes)", () => {
    expect(practicalResumeDelay(0, 5_000)).toBe(0); // aucune lecture connue : tout de suite
    expect(practicalResumeDelay(1_000, 6_000)).toBe(10_000);
    expect(practicalResumeDelay(1_000, 16_000)).toBe(0);
    expect(practicalResumeDelay(1_000, 60_000)).toBe(0);
  });

  it("partielle puis 403 ou 429 : le calendrier de position s'arrête ; réseau, 5xx ou réponse : il continue", () => {
    expect(positionCalendarContinues(403)).toBe(false);
    expect(positionCalendarContinues(429)).toBe(false);
    expect(positionCalendarContinues(0)).toBe(true);
    expect(positionCalendarContinues(502)).toBe(true);
    expect(positionCalendarContinues(null)).toBe(true);
  });
});
