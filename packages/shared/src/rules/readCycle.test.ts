import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRACTICAL_STALE_MS } from "./practicalRetry";
import { createPositionCalendar, createReadCycle, type PositionOutcome } from "./readCycle";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

function setup() {
  const env = { visible: true };
  const run = vi.fn();
  const cycle = createReadCycle({ run, visible: () => env.visible });
  return { env, run, cycle };
}

describe("le cycle de lecture : une issue remplace les échéances (suite R8q, tour 6)", () => {
  it("un 502 à 0 s, onglet quitté à 3 s, repris à 5 s : la lecture part à 15 s, pas avant, et les relances ne repartent pas à 0", () => {
    const { run, cycle } = setup();
    cycle.begin();
    cycle.settled("transient");
    expect(cycle.state().networkAttempt).toBe(1);
    vi.advanceTimersByTime(5_000);
    expect(cycle.resume()).toBe("scheduled");
    vi.advanceTimersByTime(9_999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(cycle.state().networkAttempt).toBe(1);
  });

  it("un 502 puis un retour tardif (plus de 15 s) : la lecture part tout de suite, une seule fois", () => {
    const { run, cycle } = setup();
    cycle.begin();
    cycle.settled("transient");
    vi.advanceTimersByTime(14_999);
    expect(cycle.resume()).toBe("scheduled");
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("502, retour, puis un 403 : aucune requête à l'échéance initiale ni à celle de la reprise", () => {
    const { run, cycle } = setup();
    cycle.begin();
    cycle.settled("transient");
    vi.advanceTimersByTime(5_000);
    cycle.resume();
    cycle.begin();
    cycle.settled("refused");
    vi.advanceTimersByTime(PRACTICAL_STALE_MS - 1);
    expect(run).not.toHaveBeenCalled();
    expect(cycle.state().scheduled).toBe(false);
  });

  it("partielle (relecture à 3 s programmée), « Réessayer » à 1 s qui reçoit un 403 : la relecture de 3 s ne part pas", () => {
    const { run, cycle } = setup();
    cycle.begin();
    cycle.settled("partial");
    vi.advanceTimersByTime(1_000);
    cycle.manual();
    cycle.begin();
    cycle.settled("refused");
    vi.advanceTimersByTime(10_000);
    expect(run).not.toHaveBeenCalled();
  });

  it("une réponse complète annule toute échéance et remet les compteurs à 0", () => {
    const { run, cycle } = setup();
    cycle.begin();
    cycle.settled("partial");
    cycle.settled("complete");
    vi.advanceTimersByTime(120_000);
    expect(run).not.toHaveBeenCalled();
    expect(cycle.state()).toMatchObject({ calendarStep: 0, networkAttempt: 0, scheduled: false, pending: false });
  });

  it("un refus : retour à 10 s, aucune lecture ; retour à 61 s, une lecture ; jamais de minuterie", () => {
    const { run, cycle } = setup();
    cycle.begin();
    cycle.settled("refused");
    expect(cycle.state().scheduled).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(cycle.resume()).toBe("idle");
    vi.advanceTimersByTime(51_000);
    expect(cycle.resume()).toBe("started");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("une échéance tombée onglet masqué ne part pas : elle reprend au retour", () => {
    const { env, run, cycle } = setup();
    cycle.begin();
    cycle.settled("partial");
    env.visible = false;
    vi.advanceTimersByTime(3_000);
    expect(run).not.toHaveBeenCalled();
    env.visible = true;
    vi.advanceTimersByTime(20_000);
    expect(cycle.resume()).toBe("started");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("une erreur inconnue (TypeError) : aucune relance, aucune reprise automatique, jusqu'à « Réessayer »", () => {
    const { run, cycle } = setup();
    cycle.begin();
    cycle.settled("unknown");
    expect(cycle.blocked()).toBe(true);
    vi.advanceTimersByTime(10 * 60_000);
    expect(cycle.resume()).toBe("idle");
    expect(run).not.toHaveBeenCalled();
    cycle.manual();
    expect(cycle.blocked()).toBe(false);
  });
});

function position() {
  const env = { visible: true };
  const pending: Array<(outcome: PositionOutcome) => void> = [];
  const refresh = vi.fn(
    () =>
      new Promise<PositionOutcome>((resolve) => {
        pending.push(resolve);
      }),
  );
  const calendar = createPositionCalendar({ refresh, visible: () => env.visible });
  return { env, pending, refresh, calendar };
}

describe("le calendrier unique de la position (suite R8q, tour 6)", () => {
  it("deux écrans montés, un 403 retardé : une seule relecture, aucune relance après le refus", async () => {
    const { pending, refresh, calendar } = position();
    const first = calendar.retain();
    const second = calendar.retain();
    calendar.setPartial(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    // Le second écran démarre pendant la requête du premier : rien ne repart.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    pending[0]?.("refused");
    await vi.advanceTimersByTimeAsync(10 * 60_000 - 5_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    first();
    second();
  });

  it("partielle puis 429 : retour à 10 s, rien ; retour à 61 s, une lecture", async () => {
    const { pending, refresh, calendar } = position();
    calendar.retain();
    calendar.setPartial(true);
    await vi.advanceTimersByTimeAsync(3_000);
    pending[0]?.("refused");
    await vi.advanceTimersByTimeAsync(10_000);
    calendar.resume();
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(51_000);
    calendar.resume();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("une panne transitoire poursuit le calendrier ; une réponse complète l'arrête", async () => {
    const { pending, refresh, calendar } = position();
    calendar.retain();
    calendar.setPartial(true);
    await vi.advanceTimersByTimeAsync(3_000);
    pending[0]?.("transient");
    await vi.advanceTimersByTimeAsync(6_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    calendar.setPartial(false);
    pending[1]?.("ok");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("suspendu appli en arrière-plan : la relecture due part au retour, une seule", async () => {
    const { env, refresh, calendar } = position();
    calendar.retain();
    calendar.setPartial(true);
    env.visible = false;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(refresh).not.toHaveBeenCalled();
    env.visible = true;
    calendar.resume();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("aucun écran monté : rien ne part ; un écran qui part libère le calendrier", async () => {
    const { refresh, calendar } = position();
    calendar.setPartial(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).not.toHaveBeenCalled();
    const release = calendar.retain();
    release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
