import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPositionStore } from "./positionStore";
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

  it("« Réessayer » pendant une lecture en vol : l'issue de la plus ancienne est ignorée", () => {
    const { cycle } = setup();
    const old = cycle.begin();
    cycle.manual();
    const fresh = cycle.begin();
    expect(cycle.current(old)).toBe(false);
    expect(cycle.current(fresh)).toBe(true);
    cycle.reset();
    expect(cycle.current(fresh)).toBe(false);
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

describe("l'issue est gardée par le calendrier de position (suite R8q, tour 7)", () => {
  it("démontage puis remontage après un refus : aucune lecture avant 60 s, une après", async () => {
    const { pending, refresh, calendar } = position();
    const release = calendar.retain();
    calendar.setPartial(true, "A");
    await vi.advanceTimersByTimeAsync(3_000);
    pending[0]?.("refused");
    await vi.advanceTimersByTimeAsync(0);
    release();
    await vi.advanceTimersByTimeAsync(3_000);
    calendar.retain();
    await vi.advanceTimersByTimeAsync(10_000);
    calendar.resume();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calendar.failed()).toBe(true);
    await vi.advanceTimersByTimeAsync(55_000);
    calendar.resume();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("démontage puis remontage après une erreur inconnue : aucune relance automatique", async () => {
    const { pending, refresh, calendar } = position();
    const release = calendar.retain();
    calendar.setPartial(true, "A");
    await vi.advanceTimersByTimeAsync(3_000);
    pending[0]?.("unknown");
    await vi.advanceTimersByTimeAsync(0);
    release();
    calendar.retain();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    calendar.resume();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calendar.failed()).toBe(true);
  });

  it("erreur inconnue puis une nouvelle position partielle : un nouveau calendrier, les relectures reprennent", async () => {
    const { pending, refresh, calendar } = position();
    calendar.retain();
    calendar.setPartial(true, "A");
    await vi.advanceTimersByTimeAsync(3_000);
    pending[0]?.("unknown");
    await vi.advanceTimersByTimeAsync(0);
    expect(calendar.failed()).toBe(true);
    calendar.setPartial(true, "B");
    expect(calendar.failed()).toBe(false);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("l'erreur tardive de l'ancienne position est sans effet sur la nouvelle", async () => {
    const { pending, refresh, calendar } = position();
    calendar.retain();
    calendar.setPartial(true, "A");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    // L'ancienne relecture est toujours en vol quand la position change.
    calendar.setPartial(true, "B");
    pending[0]?.("unknown");
    await vi.advanceTimersByTimeAsync(0);
    expect(calendar.failed()).toBe(false);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("partielle, erreur inconnue, « Réessayer » : « Réessayer » est proposé, la reprise manuelle relit tout de suite", async () => {
    const { pending, refresh, calendar } = position();
    calendar.retain();
    calendar.setPartial(true, "A");
    await vi.advanceTimersByTimeAsync(3_000);
    pending[0]?.("unknown");
    await vi.advanceTimersByTimeAsync(0);
    expect(calendar.failed()).toBe(true);
    calendar.retry();
    expect(refresh).toHaveBeenCalledTimes(2);
    // Pendant sa lecture, « Réessayer » reste visible (désactivé) : l'état d'échec n'est remplacé que par le résultat.
    expect(calendar.failed()).toBe(true);
    expect(calendar.busy()).toBe(true);
    pending[1]?.("ok");
    await vi.advanceTimersByTimeAsync(0);
    expect(calendar.failed()).toBe(false);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});

describe("un remontage ne consomme jamais une étape (suite R8q, tour 8)", () => {
  it("retain puis 4 fois release/retain avant la première échéance : les relectures ont lieu à 3, 6, 12 et 24 s", async () => {
    const { pending, refresh, calendar } = position();
    let release = calendar.retain();
    calendar.setPartial(true, "A");
    for (let i = 0; i < 4; i += 1) {
      release();
      release = calendar.retain();
    }
    expect(calendar.state().calendarStep).toBe(1);
    expect(refresh).not.toHaveBeenCalled();
    for (const [index, delay] of [3_000, 6_000, 12_000, 24_000].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(refresh).toHaveBeenCalledTimes(index);
      await vi.advanceTimersByTimeAsync(1);
      expect(refresh).toHaveBeenCalledTimes(index + 1);
      pending[index]?.("ok");
      await vi.advanceTimersByTimeAsync(0);
    }
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("le magasin et le calendrier branchés ensemble : quatre remontages, une lecture à l'échéance ; plusieurs écrans, une réponse comptée une fois", async () => {
    const pending: Array<(value: { partial: boolean }) => void> = [];
    const store = createPositionStore<{ partial: boolean }>({
      scope: () => "A",
      now: () => Date.now(),
      weatherAt: () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    });
    const calendar = createPositionCalendar({
      visible: () => true,
      refresh: async (): Promise<PositionOutcome> =>
        (await store.refresh(true)).status === "failed" ? "transient" : "ok",
    });
    store.subscribe(() => calendar.setPartial(store.view().at?.partial === true, store.view().coarse));
    const given = store.give({ lat: 42.7, lng: 2.9 });
    pending[0]?.({ partial: true });
    await given;
    let release = calendar.retain();
    for (let i = 0; i < 4; i += 1) {
      release();
      release = calendar.retain();
    }
    const second = calendar.retain();
    const third = calendar.retain();
    await vi.advanceTimersByTimeAsync(3_000);
    // Une seule requête de relecture, quel que soit le nombre d'écrans.
    expect(pending.length).toBe(2);
    // Un écran part et un autre arrive pendant la requête : elle est conservée, sa réponse compte une fois.
    second();
    const fourth = calendar.retain();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(pending.length).toBe(2);
    pending[1]?.({ partial: true });
    await vi.advanceTimersByTimeAsync(5_999);
    expect(pending.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    // La deuxième étape (6 s) a eu lieu une fois : trois requêtes en tout.
    expect(pending.length).toBe(3);
    release();
    third();
    fourth();
  });

  it("« Réessayer » : appuis répétés pendant une réponse lente, une seule requête ; le calendrier se sait en lecture", async () => {
    const { pending, refresh, calendar } = position();
    calendar.retain();
    calendar.setPartial(true, "A");
    await vi.advanceTimersByTimeAsync(3_000);
    pending[0]?.("unknown");
    await vi.advanceTimersByTimeAsync(0);
    expect(calendar.failed()).toBe(true);
    expect(calendar.busy()).toBe(false);
    calendar.retry();
    calendar.retry();
    calendar.retry();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(calendar.busy()).toBe(true);
    pending[1]?.("ok");
    await vi.advanceTimersByTimeAsync(0);
    expect(calendar.busy()).toBe(false);
    expect(calendar.failed()).toBe(false);
  });

  it("le retour sur l'écran après un refus avertit les abonnés (« Réessayer » se met à jour)", async () => {
    const { pending, calendar } = position();
    const seen = vi.fn();
    calendar.subscribe(seen);
    calendar.retain();
    calendar.setPartial(true, "A");
    await vi.advanceTimersByTimeAsync(3_000);
    pending[0]?.("refused");
    await vi.advanceTimersByTimeAsync(61_000);
    seen.mockClear();
    calendar.resume();
    expect(seen).toHaveBeenCalled();
    expect(calendar.busy()).toBe(true);
  });
});

describe("un calendrier commencé se réarme, il ne se recommence pas (suite R8q, tour 9)", () => {
  it("« Réessayer », panne transitoire, démontage puis remontage : la relance garde son espacement de 15 s, le compteur n'est pas remis à 0", async () => {
    const { pending, refresh, calendar } = position();
    let release = calendar.retain();
    calendar.setPartial(true, "A");
    await vi.advanceTimersByTimeAsync(3_000);
    pending[0]?.("unknown");
    await vi.advanceTimersByTimeAsync(0);
    calendar.retry();
    pending[1]?.("transient");
    await vi.advanceTimersByTimeAsync(0);
    expect(calendar.state().networkAttempt).toBe(1);
    for (let i = 0; i < 3; i += 1) {
      release();
      release = calendar.retain();
    }
    expect(calendar.state().networkAttempt).toBe(1);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("une lecture qui lève une exception : erreur inconnue, jamais bloquée en lecture", async () => {
    const env = { visible: true };
    const refresh = vi.fn(() => Promise.reject<PositionOutcome>(new TypeError("bogue")));
    const calendar = createPositionCalendar({ refresh, visible: () => env.visible });
    calendar.retain();
    calendar.setPartial(true, "A");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(calendar.busy()).toBe(false);
    expect(calendar.failed()).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("des allers-retours rapides ne repoussent pas la relecture : `rearm` ne reprogramme que le reste de l'échéance", () => {
    vi.setSystemTime(2_000_000);
    const run = vi.fn();
    const cycle = createReadCycle({ run, visible: () => true });
    cycle.begin();
    cycle.settled("partial");
    vi.advanceTimersByTime(1_000);
    cycle.dispose();
    vi.advanceTimersByTime(1_000);
    cycle.rearm();
    vi.advanceTimersByTime(999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reprise différée puis remontage avant l'échéance : la lecture reste à 18 s, pas à 12 s", () => {
    vi.setSystemTime(3_000_000);
    const env = { visible: true };
    const run = vi.fn();
    const cycle = createReadCycle({ run, visible: () => env.visible });
    cycle.begin();
    cycle.settled("partial");
    // Lecture à 3 s ; la suivante est due à 9 s, écran masqué.
    vi.advanceTimersByTime(3_000);
    expect(run).toHaveBeenCalledTimes(1);
    run.mockClear();
    cycle.begin();
    cycle.settled("partial");
    env.visible = false;
    vi.advanceTimersByTime(6_000);
    // L'échéance est tombée masquée (t = 9 s) ; retour à 10 s : l'écart de 15 s depuis la lecture de 3 s la reporte à 18 s.
    env.visible = true;
    vi.advanceTimersByTime(1_000);
    expect(cycle.resume()).toBe("scheduled");
    // Démontage puis remontage à 12 s : toujours 18 s.
    vi.advanceTimersByTime(2_000);
    cycle.dispose();
    cycle.rearm();
    vi.advanceTimersByTime(5_999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("une panne transitoire après la fin du calendrier reste due (petit lot de fin, partie A)", () => {
  /** Le calendrier de 3, 9, 21 puis 45 s est consommé (quatre lectures partielles), la quatrième lecture tombe en panne transitoire. */
  async function stalledCalendar() {
    const ctx = position();
    const release = ctx.calendar.retain();
    ctx.calendar.setPartial(true, "A");
    for (const [index, wait] of [3_000, 6_000, 12_000, 24_000].entries()) {
      await vi.advanceTimersByTimeAsync(wait);
      expect(ctx.refresh).toHaveBeenCalledTimes(index + 1);
      ctx.pending[index]?.(index < 3 ? "ok" : "transient");
      await vi.advanceTimersByTimeAsync(0);
    }
    return { ...ctx, release };
  }

  it("la règle pure : plus de relance programmée, la lecture reste due après `dispose`, « Réessayer » est proposé", async () => {
    const { calendar, refresh, release } = await stalledCalendar();
    expect(calendar.state().scheduled).toBe(false);
    expect(calendar.failed()).toBe(true);
    release();
    // Aucune minuterie ne reste écran démonté, mais la panne n'est pas oubliée.
    expect(calendar.state().scheduled).toBe(false);
    expect(calendar.state().pending).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("le remontage relit la panne restée en suspens, jamais avant 15 s après la lecture précédente", async () => {
    const { calendar, refresh, pending, release } = await stalledCalendar();
    release();
    await vi.advanceTimersByTimeAsync(5_000);
    calendar.retain();
    expect(refresh).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(refresh).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(5);
    // Une réponse complète arrête tout ; « Réessayer » disparaît.
    pending[4]?.("ok");
    await vi.advanceTimersByTimeAsync(0);
    calendar.setPartial(false);
    expect(calendar.failed()).toBe(false);
  });

  it("deux démontages/remontages avant les 15 s : la lecture part à son heure, une seule fois", async () => {
    const { calendar, refresh, release } = await stalledCalendar();
    release();
    await vi.advanceTimersByTimeAsync(5_000);
    let again = calendar.retain();
    // La reprise a programmé la lecture à +15 s ; deux allers-retours avant l'échéance ne la perdent pas.
    await vi.advanceTimersByTimeAsync(2_000);
    again();
    await vi.advanceTimersByTimeAsync(1_000);
    again = calendar.retain();
    await vi.advanceTimersByTimeAsync(1_000);
    again();
    again = calendar.retain();
    await vi.advanceTimersByTimeAsync(5_999);
    expect(refresh).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(5);
  });

  it("« Réessayer » reste visible puis désactivé pendant la relecture, puis disparaît avec le résultat", async () => {
    const { calendar, refresh, pending } = await stalledCalendar();
    expect(calendar.failed()).toBe(true);
    expect(calendar.busy()).toBe(false);
    calendar.retry();
    expect(refresh).toHaveBeenCalledTimes(5);
    expect(calendar.busy()).toBe(true);
    expect(calendar.failed()).toBe(true);
    pending[4]?.("ok");
    await vi.advanceTimersByTimeAsync(0);
    expect(calendar.busy()).toBe(false);
    expect(calendar.failed()).toBe(false);
  });

  it("une panne encore relancée par le calendrier n'est pas proposée en « Réessayer » ; un refus reste un refus", async () => {
    const { calendar, pending } = position();
    calendar.retain();
    calendar.setPartial(true, "A");
    await vi.advanceTimersByTimeAsync(3_000);
    pending[0]?.("transient");
    await vi.advanceTimersByTimeAsync(0);
    expect(calendar.failed()).toBe(false);
    expect(calendar.state().scheduled).toBe(true);
  });
});
