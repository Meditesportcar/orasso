import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLOSING_RETRY_DELAYS_MS, rankingZoneState, runAtDeadline, watchClosing } from "./voteScreen";

describe("minuterie de la clôture du vote", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("relit une seule fois, à l'échéance, sans message du serveur", () => {
    vi.setSystemTime(new Date("2026-11-10T22:59:00Z"));
    const run = vi.fn();
    runAtDeadline(new Date("2026-11-10T23:00:00Z"), run, () => new Date());
    vi.advanceTimersByTime(59_000);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000); // l'échéance et la marge sont passées
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_600_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("une échéance déjà passée ne déclenche rien ; l'annulation arrête la minuterie", () => {
    vi.setSystemTime(new Date("2026-11-10T23:30:00Z"));
    const late = vi.fn();
    runAtDeadline(new Date("2026-11-10T23:00:00Z"), late, () => new Date());
    runAtDeadline(null, late, () => new Date());
    const early = vi.fn();
    const stop = runAtDeadline(new Date("2026-11-11T00:00:00Z"), early, () => new Date());
    stop();
    vi.advanceTimersByTime(3_600_000);
    expect(late).not.toHaveBeenCalled();
    expect(early).not.toHaveBeenCalled();
  });

  it("une échéance lointaine se ré-arme (le délai d'une minuterie est plafonné) et part à l'heure", () => {
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    const run = vi.fn();
    runAtDeadline(new Date("2026-11-10T23:00:00Z"), run, () => new Date());
    vi.advanceTimersByTime(9 * 24 * 3_600_000);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(13 * 3_600_000 + 5_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("clôture du vote : heure du serveur, relectures répétées (lot R7-0, tour 3)", () => {
  const deadline = new Date("2026-11-10T23:00:00Z");
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("téléphone en avance d'une minute : attend l'échéance du serveur, relit, et réessaie jusqu'à la confirmation", async () => {
    // Le téléphone lit 22:59:30 quand le serveur est à 22:58:30.
    vi.setSystemTime(new Date("2026-11-10T22:59:30Z"));
    const serverNow = () => new Date(Date.now() - 60_000);
    const answers = [false, false, true];
    const reload = vi.fn(async () => answers.shift() ?? true);
    watchClosing({ deadline, now: serverNow, reload });
    // Sur l'horloge du téléphone, l'échéance est passée depuis 30 s : rien ne part, le serveur n'y est pas.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reload).not.toHaveBeenCalled();
    // Le serveur passe 23:00:01 (téléphone 23:01:01) : première relecture, l'API dit encore « ouvert ».
    await vi.advanceTimersByTimeAsync(31_000);
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CLOSING_RETRY_DELAYS_MS[0] ?? 0);
    expect(reload).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(CLOSING_RETRY_DELAYS_MS[1] ?? 0);
    expect(reload).toHaveBeenCalledTimes(3); // l'API confirme la clôture
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(reload).toHaveBeenCalledTimes(3); // plus rien ensuite
  });

  it("sans confirmation, les essais sont bornés (délais croissants) puis s'arrêtent", async () => {
    vi.setSystemTime(new Date("2026-11-10T22:59:59Z"));
    const reload = vi.fn(async () => false);
    watchClosing({ deadline, now: () => new Date(), reload });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(reload).toHaveBeenCalledTimes(1 + CLOSING_RETRY_DELAYS_MS.length);
  });

  it("une réponse tardive (partie avant la clôture, arrivée après) relance les relectures, sans boucle", async () => {
    vi.setSystemTime(new Date("2026-11-10T22:59:00Z"));
    const reload = vi.fn(async () => false);
    const watch = watchClosing({ deadline, now: () => new Date(), reload });
    watch.check(); // avant l'échéance : rien
    expect(reload).not.toHaveBeenCalled();
    // Les essais s'épuisent sans confirmation (réseau défaillant) ; ils ne repartent pas en boucle sur chaque réponse.
    await vi.advanceTimersByTimeAsync(60_000 + 1_100 + 130_000);
    const used = 1 + CLOSING_RETRY_DELAYS_MS.length;
    expect(reload).toHaveBeenCalledTimes(used);
    watch.check();
    expect(reload).toHaveBeenCalledTimes(used);
    // Une réponse reçue bien après : l'API disait « ouvert » alors que le serveur a passé l'échéance, on relit.
    await vi.advanceTimersByTimeAsync(31_000);
    watch.check();
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(used + 1);
  });

  it("une réponse arrivée avant l'échéance du serveur ne relit pas ; l'arrêt annule tout", async () => {
    vi.setSystemTime(new Date("2026-11-10T22:50:00Z"));
    const reload = vi.fn(async () => false);
    const watch = watchClosing({ deadline, now: () => new Date(), reload });
    watch.check();
    watch.stop();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("une relecture qui échoue (réseau) compte comme « pas confirmé » : on réessaie", async () => {
    vi.setSystemTime(new Date("2026-11-10T22:59:59Z"));
    const reload = vi.fn().mockRejectedValueOnce(new Error("réseau")).mockResolvedValue(true);
    watchClosing({ deadline, now: () => new Date(), reload });
    await vi.advanceTimersByTimeAsync(2_100 + (CLOSING_RETRY_DELAYS_MS[0] ?? 0) + 10);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe("classement après le vote", () => {
  it("servi : on l'affiche", () => {
    expect(rankingZoneState({ voted: true, rankingHidden: false, loadFailed: false })).toBe("ready");
    expect(rankingZoneState({ voted: false, rankingHidden: false, loadFailed: false })).toBe("ready");
  });
  it("pas voté : « s'affiche après ton vote »", () => {
    expect(rankingZoneState({ voted: false, rankingHidden: true, loadFailed: false })).toBe("hidden");
  });
  it("vote réussi, relecture en cours ou échouée (HTTP, réseau) : jamais un écran vide sans explication", () => {
    expect(rankingZoneState({ voted: true, rankingHidden: true, loadFailed: false })).toBe("loading");
    expect(rankingZoneState({ voted: true, rankingHidden: true, loadFailed: true })).toBe("failed");
  });
  it("échec de lecture : « Réessayer » quel que soit l'état (vote ouvert, voté, clos)", () => {
    for (const voted of [false, true]) {
      for (const closed of [false, true]) {
        expect(rankingZoneState({ voted, closed, rankingHidden: true, loadFailed: true })).toBe("failed");
      }
    }
  });
  it("clos, classement pas encore relu : il charge (même sans avoir voté), jamais « après ton vote »", () => {
    expect(rankingZoneState({ voted: false, closed: true, rankingHidden: true, loadFailed: false })).toBe("loading");
    expect(rankingZoneState({ voted: false, closed: false, rankingHidden: true, loadFailed: false })).toBe("hidden");
  });
});
