// Lot R8n2, tour 3 : écritures d'un interrupteur sérialisées, dernier choix gardé, réponses périmées ignorées.
import { describe, expect, it } from "vitest";

import { createSerialWriter } from "./serialWriter";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createSerialWriter", () => {
  it("deux bascules rapprochées : les envois ne se chevauchent pas, le dernier choix est enregistré", async () => {
    const sent: boolean[] = [];
    const calls: ReturnType<typeof deferred<boolean>>[] = [];
    const settled: boolean[] = [];
    const w = createSerialWriter<boolean>({
      initial: true,
      write: (v) => {
        sent.push(v);
        const d = deferred<boolean>();
        calls.push(d);
        return d.promise;
      },
      onSettled: (v) => settled.push(v),
      onError: () => undefined,
    });
    w.set(false); // premier envoi en cours
    w.set(true); // le choix change avant sa réponse : rien ne part en même temps
    await tick();
    expect(sent).toEqual([false]);
    calls[0]?.resolve(false);
    await tick();
    // La réponse du premier n'est pas affichée : le dernier choix (true) revient à l'état confirmé sans nouvel envoi
    // inutile (il rejoint la valeur déjà confirmée avant, donc un envoi la rétablit).
    expect(sent).toEqual([false, true]);
    calls[1]?.resolve(true);
    expect(await w.whenIdle()).toBe(true);
    expect(settled).toEqual([true]);
    expect(w.confirmed()).toBe(true);
  });

  it("réponses désordonnées : seule la réponse du dernier envoi, jamais une réponse périmée, est affichée", async () => {
    const calls: ReturnType<typeof deferred<boolean>>[] = [];
    const settled: boolean[] = [];
    const w = createSerialWriter<boolean>({
      initial: true,
      write: () => {
        const d = deferred<boolean>();
        calls.push(d);
        return d.promise;
      },
      onSettled: (v) => settled.push(v),
      onError: () => undefined,
    });
    w.set(false);
    w.set(true);
    w.set(false);
    await tick();
    expect(calls).toHaveLength(1);
    calls[0]?.resolve(false);
    expect(await w.whenIdle()).toBe(true);
    expect(settled).toEqual([false]);
    expect(w.confirmed()).toBe(false);
  });

  it("un échec rend la dernière valeur confirmée ; whenIdle le dit (fermeture immédiate puis échec réseau)", async () => {
    const errors: boolean[] = [];
    const call = deferred<boolean>();
    const w = createSerialWriter<boolean>({
      initial: true,
      write: () => call.promise,
      onSettled: () => undefined,
      onError: (confirmed) => errors.push(confirmed),
    });
    w.set(false);
    const idle = w.whenIdle(); // « C'est noté » attend la fin de l'écriture
    call.reject(new Error("réseau"));
    expect(await idle).toBe(false);
    expect(errors).toEqual([true]);
    expect(w.confirmed()).toBe(true);
  });

  it("rien n'est envoyé quand le choix revient à la valeur confirmée", async () => {
    let n = 0;
    const w = createSerialWriter<boolean>({
      initial: true,
      write: async (v) => {
        n += 1;
        return v;
      },
      onSettled: () => undefined,
      onError: () => undefined,
    });
    w.set(true);
    expect(await w.whenIdle()).toBe(true);
    expect(n).toBe(0);
  });
});

describe("createSerialWriter : compte et réponses perdues (tour 5)", () => {
  it("changement de compte pendant le premier envoi : aucun second envoi, rien d'affiché", async () => {
    let account = "A";
    const sent: boolean[] = [];
    const settled: boolean[] = [];
    const call = deferred<boolean>();
    const w = createSerialWriter<boolean>({
      initial: true,
      alive: () => account === "A",
      write: (v) => {
        sent.push(v);
        return call.promise;
      },
      onSettled: (v) => settled.push(v),
      onError: () => settled.push(false),
    });
    w.set(false);
    w.set(true);
    await tick();
    account = "B"; // A se déconnecte, B se connecte avant la première réponse
    call.resolve(false);
    expect(await w.whenIdle()).toBe(true);
    expect(sent).toEqual([false]);
    expect(settled).toEqual([]);
  });

  it("réponse perdue puis choix plus récent égal à l'ancienne valeur : il est quand même envoyé", async () => {
    const sent: boolean[] = [];
    const calls: ReturnType<typeof deferred<boolean>>[] = [];
    const settled: boolean[] = [];
    const w = createSerialWriter<boolean>({
      initial: true,
      write: (v) => {
        sent.push(v);
        const d = deferred<boolean>();
        calls.push(d);
        return d.promise;
      },
      onSettled: (v) => settled.push(v),
      onError: () => settled.push(false),
    });
    w.set(false); // le serveur l'enregistre, la réponse se perd
    w.set(true); // choix plus récent : égale la valeur confirmée d'avant
    await tick();
    calls[0]?.reject(new Error("réponse perdue"));
    await tick();
    expect(sent).toEqual([false, true]);
    calls[1]?.resolve(true);
    expect(await w.whenIdle()).toBe(true);
    expect(settled).toEqual([true]);
    expect(w.confirmed()).toBe(true);
  });

  it("échec sans choix plus récent : l'erreur, comme avant", async () => {
    const errors: boolean[] = [];
    const w = createSerialWriter<boolean>({
      initial: true,
      write: async () => {
        throw new Error("réseau");
      },
      onSettled: () => undefined,
      onError: (confirmed) => errors.push(confirmed),
    });
    w.set(false);
    expect(await w.whenIdle()).toBe(false);
    expect(errors).toEqual([true]);
  });
});
