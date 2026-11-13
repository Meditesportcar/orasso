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
    const slow: { release: (() => void) | null } = { release: null };
    const send = (on: boolean) => {
      sent.push(on);
      return new Promise<FlameState>((resolve) => {
        slow.release = () => resolve({ reactionsCount: on ? 9 : 4, reactedByMe: on });
      });
    };
    const base: FlameState = { reactionsCount: 4, reactedByMe: false };
    // A ajoute (la requête part, lente), puis A retire, puis B (autre casquette, même compte) ajoute.
    const run = router.fire(key, base, { send, apply: (s) => stores.A.push(s) });
    await tick();
    void router.fire(key, base, { send, apply: (s) => stores.A.push(s) });
    void router.fire(key, base, { send, apply: (s) => stores.B.push(s) });
    // On libère chaque requête lente tant que la série n'est pas finie (une deuxième part si l'intention a changé).
    for (let i = 0; i < 5 && slow.release; i++) {
      const r = slow.release;
      slow.release = null;
      r();
      await tick();
    }
    await run;
    // Une seule file : les requêtes sont en série, la dernière intention est l'ajout (A ajoute, retire, B ajoute).
    expect(sent[sent.length - 1]).toBe(true);
    // Le serveur rend 9 au dernier envoi (jamais le 5 d'un essai local) : tous les magasins de la file le reçoivent.
    const serverFinal = { reactionsCount: 9, reactedByMe: true };
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

  it("file morte (compte u1 → u2 → u1) : un nouvel appui ouvre une nouvelle file, le nouveau magasin finit sur l'état du serveur", async () => {
    const router = createFlameRouter(createFlameGate());
    const key = flameKey("u1|s:a", "p", "c");
    const state = { alive: true };
    const old: FlameState[] = [];
    const fresh: FlameState[] = [];
    const slow: { release: (() => void) | null } = { release: null };
    const base: FlameState = { reactionsCount: 4, reactedByMe: false };
    // Première file : lente, puis son compte est quitté (alive faux).
    const first = router.fire(key, base, {
      send: () =>
        new Promise<FlameState>((resolve) => {
          slow.release = () => resolve({ reactionsCount: 5, reactedByMe: true });
        }),
      apply: (s) => old.push(s),
      alive: () => state.alive,
    });
    await tick();
    state.alive = false;
    // Retour sur u1 : un nouvel appui (autre vie du compte) ne rejoint pas la file morte.
    const second = router.fire(key, base, {
      send: async (on) => ({ reactionsCount: on ? 7 : 4, reactedByMe: on }),
      apply: (s) => fresh.push(s),
      alive: () => true,
    });
    await second;
    expect(fresh[fresh.length - 1]).toEqual({ reactionsCount: 7, reactedByMe: true });
    slow.release?.();
    await first;
    // La file morte n'écrit plus rien après sa mort : seule son intention de départ (le geste local) a été appliquée, pas son résultat.
    expect(old).toHaveLength(1);
  });
});
