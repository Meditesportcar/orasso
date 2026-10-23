// Lot M6, tour 2 : chiffres de l'affiche (espaces du format fr-FR) et file de rendu (deux à la fois au plus).
import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors";
import { createRenderQueue, MAX_RENDERS, storyStats } from "./share-image";

const stats = (weightKg: number) => storyStats({ powerHp: null, weightKg, year: null });

describe("poids de l'affiche", () => {
  it("l'espace des milliers devient une espace simple, les « 2 » du nombre ne bougent pas", () => {
    expect(stats(1250)[0]).toMatchObject({ label: "Poids", value: "1 250", unit: "kg" });
    expect(stats(2120)[0]?.value).toBe("2 120");
    expect(stats(1222)[0]?.value).toBe("1 222");
    expect(stats(1250)[0]?.value).not.toMatch(/[  ]/);
  });
});

describe("file de rendu des affiches", () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("deux rendus à la fois au plus, les suivants attendent leur tour dans l'ordre", async () => {
    expect(MAX_RENDERS).toBe(2);
    const q = createRenderQueue(2, 10);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    let live = 0;
    let peak = 0;
    const jobs = gates.map((g, i) =>
      q.run(async () => {
        started.push(i);
        peak = Math.max(peak, ++live);
        await g.promise;
        live--;
        return i;
      }),
    );
    await tick();
    expect(started).toEqual([0, 1]);
    expect(q.waiting).toBe(2);
    gates[0]?.resolve();
    await tick();
    expect(started).toEqual([0, 1, 2]);
    gates[1]?.resolve();
    gates[2]?.resolve();
    gates[3]?.resolve();
    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
    expect(q.running).toBe(0);
    expect(q.waiting).toBe(0);
  });

  it("un rendu qui échoue libère sa place ; au-delà de la file courte, 429", async () => {
    const q = createRenderQueue(1, 1);
    await expect(q.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(q.running).toBe(0);
    const gate = deferred();
    const first = q.run(() => gate.promise);
    const second = q.run(async () => "ok");
    await tick();
    const third = q.run(async () => "trop").catch((e) => e);
    const err = await third;
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(429);
    gate.resolve();
    await first;
    expect(await second).toBe("ok");
    expect(q.running).toBe(0);
  });
});
