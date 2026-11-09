import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sponsoredSessionKey, sponsoredSessionKeyForDay } from "./sponsored";
import {
  CLICK_WAIT_MS,
  countsAsSeen,
  createDayWatcher,
  createImpressionSession,
  createImpressionWatcher,
  msUntilParisMidnight,
  nextRetryDelay,
  type SendOutcome,
} from "./sponsoredImpressions";

describe("visibilité réelle d'une carte (50 % / 30 %)", () => {
  // Zone utile : de 100 à 700 (600 px).
  it("carte normale : 49 % ne compte pas, 50 % compte", () => {
    // Carte de 400 px : 196 px visibles (49 %) puis 200 px (50 %), en bas de la zone.
    expect(countsAsSeen(504, 400, 100, 700)).toBe(false);
    expect(countsAsSeen(500, 400, 100, 700)).toBe(true);
    // Entrée par le haut, sous la bande : 196 px visibles puis 200.
    expect(countsAsSeen(-104, 400, 100, 700)).toBe(false);
    expect(countsAsSeen(-100, 400, 100, 700)).toBe(true);
  });

  it("carte de 1 800 px dans 600 px : comptée à partir de 540 px visibles (30 %)", () => {
    // Le bas de la carte entre par le haut de la zone : visible = top + 1800 - 100.
    expect(countsAsSeen(-1161, 1800, 100, 700)).toBe(false); // 539 px
    expect(countsAsSeen(-1160, 1800, 100, 700)).toBe(true); // 540 px
    // Le haut de la carte entre par le bas de la zone : visible = 700 - top.
    expect(countsAsSeen(161, 1800, 100, 700)).toBe(false); // 539 px
    expect(countsAsSeen(160, 1800, 100, 700)).toBe(true); // 540 px
  });

  it("carte de trois hauteurs d'écran, ou plus : 30 % de sa hauteur, jamais plus que la zone", () => {
    // 3 zones = 1 800 px : 30 % = 540 px (déjà vu ci-dessus), carte au milieu : la zone est pleine.
    expect(countsAsSeen(-600, 1800, 100, 700)).toBe(true);
    // Carte de 4 zones (2 400 px) : 30 % = 720 > 600, il suffit de remplir la zone.
    expect(countsAsSeen(-500, 2400, 100, 700)).toBe(true);
    expect(countsAsSeen(200, 2400, 100, 700)).toBe(false);
  });

  it("une carte hors de la zone, ou une mesure absurde, ne compte pas", () => {
    expect(countsAsSeen(900, 300, 100, 700)).toBe(false);
    expect(countsAsSeen(0, 0, 100, 700)).toBe(false);
    expect(countsAsSeen(300, 200, 700, 100)).toBe(false);
  });
});

const ok = (): Promise<SendOutcome> => Promise.resolve({ ok: true });
const down = (): Promise<SendOutcome> => Promise.resolve({ ok: false });

describe("impression et clic", () => {
  it("une seule impression pour une clé, même appelée deux fois pendant l'envoi", async () => {
    const s = createImpressionSession();
    const send = vi.fn(ok);
    const [a, b] = await Promise.all([s.impress("k", send), s.impress("k", send)]);
    expect([a, b]).toEqual(["recorded", "recorded"]);
    expect(await s.impress("k", send)).toBe("recorded");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("un échec réseau libère la clé, un refus (404/409) est définitif", async () => {
    const s = createImpressionSession();
    expect(await s.impress("k", down)).toBe("failed");
    expect(await s.impress("k", ok)).toBe("recorded");
    expect(await s.impress("r", () => Promise.resolve({ ok: false, status: 409 }))).toBe("refused");
    expect(s.isRefused("r")).toBe(true);
    expect(await s.impress("r", ok)).toBe("refused");
    expect(await s.impress("n", () => Promise.resolve({ ok: false, status: 404 }))).toBe("refused");
    expect(await s.impress("e", () => Promise.resolve({ ok: false, status: 503 }))).toBe("failed");
  });

  describe("avec des minuteries simulées", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("impression retardée puis clic immédiat : le clic attend l'impression, un de chaque", async () => {
      const s = createImpressionSession();
      const events: string[] = [];
      let finish: () => void = () => undefined;
      const slow = vi.fn(
        () =>
          new Promise<SendOutcome>((resolve) => {
            events.push("impression");
            finish = () => resolve({ ok: true });
          }),
      );
      // La carte est vue : l'impression part, lentement.
      void s.impress("k", slow);
      // Clic immédiat : il attend l'impression en cours (pas de deuxième impression).
      const click = s.beforeClick("k", slow).then((r) => {
        events.push(`clic:${r}`);
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(events).toEqual(["impression"]);
      finish();
      await click;
      expect(events).toEqual(["impression", "clic:recorded"]);
      expect(slow).toHaveBeenCalledTimes(1);
    });

    it("clic avant toute impression : l'impression part d'abord (keepalive), puis le clic", async () => {
      const s = createImpressionSession();
      const send = vi.fn((_keepalive?: boolean) => ok());
      expect(await s.beforeClick("k", send)).toBe("recorded");
      expect(send).toHaveBeenCalledWith(true);
      expect(send).toHaveBeenCalledTimes(1);
      // Plus d'attente ensuite.
      expect(await s.beforeClick("k", send)).toBe("recorded");
      expect(send).toHaveBeenCalledTimes(1);
    });

    it("le clic n'attend pas plus de 3 s", async () => {
      const s = createImpressionSession();
      const never = () => new Promise<SendOutcome>(() => undefined);
      const out = s.beforeClick("k", never);
      await vi.advanceTimersByTimeAsync(CLICK_WAIT_MS);
      expect(await out).toBe("timeout");
    });

    it("clic sur un emplacement refusé : rien à envoyer", async () => {
      const s = createImpressionSession();
      s.refuse("k");
      expect(await s.beforeClick("k", ok)).toBe("refused");
    });

    it("échec réseau, retour du réseau : reprise après 30 s, une seule impression enregistrée", async () => {
      const s = createImpressionSession();
      let network = false;
      const send = vi.fn(() => (network ? ok() : down()));
      const rearm = vi.fn();
      const w = createImpressionWatcher({ session: s, key: "k", send, onRefused: vi.fn(), rearm });
      w.onSeen();
      await vi.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(1);
      expect(rearm).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(29_999);
      expect(rearm).not.toHaveBeenCalled();
      network = true;
      await vi.advanceTimersByTimeAsync(1);
      expect(rearm).toHaveBeenCalledTimes(1);
      // La surveillance revérifie la visibilité : la carte est toujours vue.
      w.onSeen();
      await vi.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(2);
      expect(s.isRecorded("k")).toBe(true);
      // Plus aucune reprise ensuite, et une autre vue ne renvoie rien.
      w.onSeen();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(rearm).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(2);
    });

    it("trois essais au plus : 30 s, puis 60 s, puis plus rien", async () => {
      expect(nextRetryDelay(1)).toBe(30_000);
      expect(nextRetryDelay(2)).toBe(60_000);
      expect(nextRetryDelay(3)).toBeNull();
      const s = createImpressionSession();
      const send = vi.fn(down);
      const rearm = vi.fn();
      const w = createImpressionWatcher({ session: s, key: "k", send, onRefused: vi.fn(), rearm });
      for (let i = 0; i < 5; i += 1) {
        w.onSeen();
        await vi.advanceTimersByTimeAsync(61_000);
      }
      expect(send).toHaveBeenCalledTimes(5);
      expect(rearm).toHaveBeenCalledTimes(2);
    });

    it("un refus 404/409 retire la carte et ne se réarme pas", async () => {
      const onRefused = vi.fn();
      const rearm = vi.fn();
      const w = createImpressionWatcher({
        session: createImpressionSession(),
        key: "k",
        send: () => Promise.resolve({ ok: false, status: 409 }),
        onRefused,
        rearm,
      });
      w.onSeen();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(onRefused).toHaveBeenCalledTimes(1);
      expect(rearm).not.toHaveBeenCalled();
    });

    it("une surveillance abandonnée (démontage) ne se réarme pas", async () => {
      const rearm = vi.fn();
      const w = createImpressionWatcher({
        session: createImpressionSession(),
        key: "k",
        send: down,
        onRefused: vi.fn(),
        rearm,
      });
      w.onSeen();
      await vi.advanceTimersByTimeAsync(0);
      w.dispose();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(rearm).not.toHaveBeenCalled();
    });
  });
});

describe("changement de jour de Paris", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("passage de minuit sans remonter la carte : le jour change, la clé aussi", async () => {
    // 22 h 59 min 30 s à Paris (UTC+1 en novembre) = 21 h 59 min 30 s UTC.
    vi.setSystemTime(new Date("2026-11-09T22:59:30Z"));
    const days: string[] = [];
    const w = createDayWatcher({ onChange: (d) => days.push(d) });
    expect(w.current()).toBe("2026-11-09");
    const before = sponsoredSessionKey("u1", "p1");
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(days).toEqual(["2026-11-10"]);
    expect(sponsoredSessionKey("u1", "p1")).not.toBe(before);
    expect(sponsoredSessionKeyForDay("u1", "p1", days[0] as string)).toBe(sponsoredSessionKey("u1", "p1"));
    w.stop();
  });

  it("retour au premier plan après minuit : refresh() relit le jour", () => {
    vi.setSystemTime(new Date("2026-11-09T20:00:00Z"));
    const onChange = vi.fn();
    // Minuterie neutralisée : seul le retour au premier plan avertit.
    const w = createDayWatcher({ onChange, setTimer: () => 1, clearTimer: () => undefined });
    w.refresh();
    expect(onChange).not.toHaveBeenCalled();
    vi.setSystemTime(new Date("2026-11-09T23:30:00Z"));
    w.refresh();
    expect(onChange).toHaveBeenCalledWith("2026-11-10");
    w.refresh();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("horloge injectable", () => {
    let t = new Date("2026-11-09T22:30:00Z");
    const onChange = vi.fn();
    const w = createDayWatcher({ onChange, now: () => t, setTimer: () => 1, clearTimer: () => undefined });
    t = new Date("2026-11-09T23:00:01Z");
    w.refresh();
    expect(onChange).toHaveBeenCalledWith("2026-11-10");
  });

  it("minuit à Paris dans moins de 30 min, jamais négatif", () => {
    expect(msUntilParisMidnight(new Date("2026-11-09T22:59:00Z"))).toBe(60_000);
    expect(msUntilParisMidnight(new Date("2026-11-09T12:00:00Z"))).toBe(30 * 60_000);
  });
});
