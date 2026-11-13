import { describe, expect, it } from "vitest";

import { createFlameRouter, type FlameState, flameKey } from "./flameRouter";

const tick = () => new Promise((r) => setTimeout(r, 0));
const off: FlameState = { reactionsCount: 4, reactedByMe: false };
const on: FlameState = { reactionsCount: 5, reactedByMe: true };

/** Un serveur lent : chaque envoi attend `release()`, et rend un compteur propre au serveur (9 pour une flamme allumée). */
function slowServer() {
  const sent: boolean[] = [];
  const waiting: (() => void)[] = [];
  return {
    sent,
    send: (want: boolean) => {
      sent.push(want);
      return new Promise<FlameState>((resolve) => {
        waiting.push(() => resolve({ reactionsCount: want ? 9 : 4, reactedByMe: want }));
      });
    },
    async releaseAll() {
      for (let i = 0; i < 6; i++) {
        const next = waiting.shift();
        if (next) next();
        await tick();
      }
    },
  };
}

describe("flameRouter : une file par connexion, compte et commentaire", () => {
  it("la clé ne dépend pas de la casquette, seulement du compte", () => {
    expect(flameKey("u1|s:a", "p", "c")).toBe(flameKey("u1|s:b", "p", "c"));
    expect(flameKey("u1|s:a", "p", "c")).not.toBe(flameKey("u2|s:a", "p", "c"));
  });

  it("A ajoute (requête lente), puis B touche une flamme encore éteinte pour elle → allumée à la fin (jamais l'inverse de l'intention d'A)", async () => {
    const router = createFlameRouter();
    const key = flameKey("u1|s:a", "p", "c");
    const server = slowServer();
    const a: FlameState[] = [];
    const b: FlameState[] = [];
    const run = router.fire(key, off, { send: server.send, apply: (s) => a.push(s) });
    await tick();
    // B voit encore la flamme éteinte : son toucher veut l'allumer.
    void router.fire(key, off, { send: server.send, apply: (s) => b.push(s) });
    await server.releaseAll();
    await run;
    expect(server.sent[server.sent.length - 1]).toBe(true);
    // Le serveur rend 9 : les deux magasins finissent dessus.
    expect(a[a.length - 1]).toEqual({ reactionsCount: 9, reactedByMe: true });
    expect(b[b.length - 1]).toEqual({ reactionsCount: 9, reactedByMe: true });
  });

  it("A ajoute puis retire pendant une requête lente, B ajoute ensuite : l'intention finale gagne, aucun magasin ne contredit le serveur", async () => {
    const router = createFlameRouter();
    const key = flameKey("u1|s:a", "p", "c");
    const server = slowServer();
    const a: FlameState[] = [];
    const b: FlameState[] = [];
    const run = router.fire(key, off, { send: server.send, apply: (s) => a.push(s) });
    await tick();
    void router.fire(key, on, { send: server.send, apply: (s) => a.push(s) }); // A retire (elle voit allumée)
    void router.fire(key, off, { send: server.send, apply: (s) => b.push(s) }); // B ajoute (elle voit éteinte)
    await server.releaseAll();
    await run;
    expect(server.sent[server.sent.length - 1]).toBe(true);
    expect(a[a.length - 1]).toEqual({ reactionsCount: 9, reactedByMe: true });
    expect(b[b.length - 1]).toEqual({ reactionsCount: 9, reactedByMe: true });
  });

  it("déconnexion puis reconnexion pendant une réponse retardée : le retrait ouvre une nouvelle file et le DELETE part", async () => {
    const router = createFlameRouter();
    const key = flameKey("u1|s:a", "p", "c");
    const old = slowServer();
    // Ajout enregistré, réponse retardée.
    const first = router.fire(key, off, { send: old.send, apply: () => undefined, alive: () => true });
    await tick();
    // Déconnexion puis reconnexion (même compte) : les files sont remises à zéro.
    router.reset();
    const fresh = slowServer();
    const seen: FlameState[] = [];
    // L'utilisateur retire (il voit la flamme allumée) : une nouvelle file, qui envoie sa propre requête.
    const second = router.fire(key, on, { send: fresh.send, apply: (s) => seen.push(s), alive: () => true });
    await fresh.releaseAll();
    await second;
    expect(fresh.sent).toEqual([false]);
    expect(seen[seen.length - 1]).toEqual({ reactionsCount: 4, reactedByMe: false });
    await old.releaseAll();
    await first;
  });

  it("file morte (alive du premier toucher faux) : un nouvel appui ouvre une nouvelle file", async () => {
    const router = createFlameRouter();
    const key = flameKey("u1|s:a", "p", "c");
    const state = { alive: true };
    const dead = slowServer();
    const first = router.fire(key, off, { send: dead.send, apply: () => undefined, alive: () => state.alive });
    await tick();
    state.alive = false;
    const fresh = slowServer();
    const seen: FlameState[] = [];
    const second = router.fire(key, off, { send: fresh.send, apply: (s) => seen.push(s), alive: () => true });
    await fresh.releaseAll();
    await second;
    expect(fresh.sent).toEqual([true]);
    expect(seen[seen.length - 1]).toEqual({ reactionsCount: 9, reactedByMe: true });
    await dead.releaseAll();
    await first;
  });

  it("deux commentaires ou deux comptes : des files séparées", async () => {
    const router = createFlameRouter();
    const calls: string[] = [];
    const io = (name: string) => ({
      send: async (want: boolean) => {
        calls.push(name);
        return { reactionsCount: 1, reactedByMe: want };
      },
      apply: () => undefined,
    });
    await Promise.all([
      router.fire(flameKey("u1|x", "p", "c1"), off, io("c1")),
      router.fire(flameKey("u1|x", "p", "c2"), off, io("c2")),
      router.fire(flameKey("u2|x", "p", "c1"), off, io("u2c1")),
    ]);
    expect(calls.sort()).toEqual(["c1", "c2", "u2c1"]);
  });
});
