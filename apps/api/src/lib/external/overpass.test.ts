// File d'appels d'Overpass : jamais plus de deux appels actifs, la place passe directement à la demande qui attend, une remise à zéro
// abandonne les attentes sans leur donner de place.
import { describe, expect, it } from "vitest";

import { OVERPASS_PARALLEL, resetOverpassQueue, withOverpassSlot } from "./overpass";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("file d'appels d'Overpass", () => {
  it("une demande qui arrive entre la libération d'une place et la reprise de la demande qui attend ne s'intercale pas : jamais plus de deux actives", async () => {
    resetOverpassQueue();
    let active = 0;
    let peak = 0;
    const started: string[] = [];
    const run = (name: string, gate: Promise<void>) =>
      withOverpassSlot(async () => {
        active += 1;
        peak = Math.max(peak, active);
        started.push(name);
        await gate;
        active -= 1;
      });
    const a = deferred();
    const b = deferred();
    const c = deferred();
    const d = deferred();
    const pa = run("A", a.promise);
    const pb = run("B", b.promise);
    const pc = run("C", c.promise);
    await tick();
    expect(started).toEqual(["A", "B"]);
    // A finit ; dans le même instant, D arrive avant que C ait repris.
    a.resolve();
    const pd = run("D", d.promise);
    await tick();
    expect(started).toEqual(["A", "B", "C"]);
    expect(peak).toBe(OVERPASS_PARALLEL);
    // B finit : D prend sa place à son tour.
    b.resolve();
    await tick();
    expect(started).toEqual(["A", "B", "C", "D"]);
    c.resolve();
    d.resolve();
    await Promise.all([pa, pb, pc, pd]);
    expect(peak).toBe(2);
    expect(active).toBe(0);
  });

  it("une remise à zéro abandonne les attentes de l'ancienne génération sans leur donner de place", async () => {
    resetOverpassQueue();
    const gate = deferred();
    const started: string[] = [];
    const hold = (name: string) =>
      withOverpassSlot(async () => {
        started.push(name);
        await gate.promise;
      });
    const p1 = hold("1");
    const p2 = hold("2");
    const p3 = hold("3").catch((e) => (e as Error).message);
    await tick();
    expect(started).toEqual(["1", "2"]);
    resetOverpassQueue();
    expect(await p3).toMatch(/réinitialisée/);
    expect(started).toEqual(["1", "2"]);
    // Les deux places de la nouvelle génération sont libres, malgré les appels de l'ancienne qui finissent après.
    const fresh = deferred();
    const ran: string[] = [];
    const f1 = withOverpassSlot(async () => {
      ran.push("x");
      await fresh.promise;
    });
    const f2 = withOverpassSlot(async () => {
      ran.push("y");
      await fresh.promise;
    });
    await tick();
    expect(ran).toEqual(["x", "y"]);
    gate.resolve();
    await Promise.all([p1, p2]);
    fresh.resolve();
    await Promise.all([f1, f2]);
  });
});
