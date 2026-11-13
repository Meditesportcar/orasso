import { createFlameGate } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { createFlameRouter, type FlameState, flameKey } from "./flameRouter";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("flameRouter : une file par compte et par commentaire", () => {
  it("la clé ne dépend pas de la casquette, seulement du compte", () => {
    expect(flameKey("u1|s:a", "p", "c")).toBe(flameKey("u1|s:b", "p", "c"));
    expect(flameKey("u1|s:a", "p", "c")).not.toBe(flameKey("u2|s:a", "p", "c"));
  });

  it("A ajoute puis retire pendant une requête lente, B ajoute ensuite : l'intention finale gagne, aucun magasin ne contredit le serveur", async () => {
    const router = createFlameRouter(createFlameGate());
    const stores: Record<"A" | "B", FlameState[]> = { A: [], B: [] };
    const key = flameKey("u1|s:a", "p", "c");
    const sent: boolean[] = [];
    let release: (() => void) | null = null;
    const send = (on: boolean) => {
      sent.push(on);
      return new Promise<FlameState>((resolve) => {
        release = () => resolve({ reactionsCount: on ? 5 : 4, reactedByMe: on });
      });
    };
    const base: FlameState = { reactionsCount: 4, reactedByMe: false };
    // A ajoute (la requête part, lente), puis A retire, puis B (autre casquette, même compte) ajoute.
    const run = router.fire(key, base, { send, apply: (s) => stores.A.push(s) });
    await tick();
    void router.fire(key, base, { send, apply: (s) => stores.A.push(s) });
    void router.fire(key, base, { send, apply: (s) => stores.B.push(s) });
    release?.();
    await tick();
    // Une deuxième requête part si l'intention a changé depuis la première.
    while (release && sent.length < 3) {
      const r = release;
      release = null;
      r();
      await tick();
      if (!release) break;
    }
    release?.();
    await run;
    // Une seule file : les requêtes sont en série, la dernière intention est l'ajout (A ajoute, retire, B ajoute).
    expect(sent[sent.length - 1]).toBe(true);
    const serverFinal = { reactionsCount: 5, reactedByMe: true };
    // Aucun magasin ne finit sur autre chose que le serveur.
    expect(stores.A[stores.A.length - 1]).toEqual(serverFinal);
    expect(stores.B[stores.B.length - 1]).toEqual(serverFinal);
  });

  it("deux commentaires ou deux comptes : des files séparées", async () => {
    const router = createFlameRouter(createFlameGate());
    const calls: string[] = [];
    const io = (name: string) => ({
      send: async (on: boolean) => {
        calls.push(name);
        return { reactionsCount: 1, reactedByMe: on };
      },
      apply: () => undefined,
    });
    await Promise.all([
      router.fire(flameKey("u1|x", "p", "c1"), { reactionsCount: 0, reactedByMe: false }, io("c1")),
      router.fire(flameKey("u1|x", "p", "c2"), { reactionsCount: 0, reactedByMe: false }, io("c2")),
      router.fire(flameKey("u2|x", "p", "c1"), { reactionsCount: 0, reactedByMe: false }, io("u2c1")),
    ]);
    expect(calls.sort()).toEqual(["c1", "c2", "u2c1"]);
  });
});
