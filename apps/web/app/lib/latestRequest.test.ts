import { describe, expect, it } from "vitest";

import { createLatestGate } from "./latestRequest";

/** Une lecture qui répond quand le test le décide. */
function read<T>(gate: ReturnType<typeof createLatestGate>, apply: (v: T) => void) {
  const ticket = gate.start();
  let answer!: (v: T) => void;
  const promise = new Promise<T>((resolve) => {
    answer = resolve;
  }).then((v) => {
    if (ticket.latest()) apply(v);
  });
  return { answer, promise };
}

describe("createLatestGate", () => {
  it("une réponse ancienne arrivée après la lecture actualisée (clôture) est ignorée", async () => {
    const gate = createLatestGate();
    let shown = "";
    const before = read<string>(gate, (v) => {
      shown = v;
    }); // partie avant la clôture
    const after = read<string>(gate, (v) => {
      shown = v;
    }); // relecture après la clôture
    after.answer("clos");
    await after.promise;
    before.answer("ouvert");
    await before.promise;
    expect(shown).toBe("clos");
  });

  it("dans l'ordre normal, chaque réponse s'applique tant qu'une plus récente n'est pas partie", async () => {
    const gate = createLatestGate();
    let shown = "";
    const first = read<string>(gate, (v) => {
      shown = v;
    });
    first.answer("a");
    await first.promise;
    const second = read<string>(gate, (v) => {
      shown = v;
    });
    second.answer("b");
    await second.promise;
    expect(shown).toBe("b");
  });

  it("recherche vidée avant la réponse : la réponse tardive ne repeuple rien", async () => {
    const gate = createLatestGate();
    let hits: string[] = [];
    const search = read<string[]>(gate, (v) => {
      hits = v;
    });
    gate.invalidate(); // le champ est vidé
    search.answer(["Honda S2000"]);
    await search.promise;
    expect(hits).toEqual([]);
  });
});
