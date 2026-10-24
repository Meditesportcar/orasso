import { describe, expect, it } from "vitest";

import { createNetworkLoader } from "./networkLoad";

/** Une promesse résolue à la main. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("lectures de « Ton réseau » (lot R4c, tour 2)", () => {
  it("réponses inversées : la recherche lente « a » n'écrase pas « al »", async () => {
    const pending = new Map<string, ReturnType<typeof deferred<string[]>>>();
    const applied: string[][] = [];
    const loader = createNetworkLoader<string, string[]>({
      scope: () => "moi",
      fetch: (q) => {
        const d = deferred<string[]>();
        pending.set(q, d);
        return d.promise;
      },
      apply: (r) => applied.push(r),
      onError: () => undefined,
    });
    const slow = loader.load("a");
    const fast = loader.load("al");
    pending.get("al")?.resolve(["Alpha"]);
    await fast;
    pending.get("a")?.resolve(["Alpha", "Ana"]);
    await slow;
    expect(applied).toEqual([["Alpha"]]);
  });

  it("une réponse lue sous un autre compte est jetée ; la page suivante d'une ancienne lecture aussi", async () => {
    let account = "moi";
    const applied: string[] = [];
    const d = deferred<string>();
    const loader = createNetworkLoader<string, string>({
      scope: () => account,
      fetch: () => d.promise,
      apply: (r) => applied.push(r),
      onError: () => undefined,
    });
    const run = loader.load("x");
    account = "autre";
    d.resolve("liste");
    await run;
    expect(applied).toEqual([]);

    account = "moi";
    const next = deferred<string>();
    const more = loader.more(
      () => next.promise,
      (p) => applied.push(p),
    );
    void loader.load("y");
    next.resolve("page 2");
    await more;
    expect(applied).not.toContain("page 2");
  });
});
