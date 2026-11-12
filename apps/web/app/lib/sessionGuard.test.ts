import { createSerialWriter } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { createSessionGuard, guardFor, type Listen } from "./sessionGuard";

function bus() {
  const listeners = new Set<(id: string | null) => void>();
  const listen: Listen = (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return {
    listen,
    say: (id: string | null) => {
      for (const l of listeners) l(id);
    },
    count: () => listeners.size,
  };
}

describe("garde de compte (P24)", () => {
  it("l'annonce de l'autre compte refuse, celle du compte de la page accorde", () => {
    const b = bus();
    const g = createSessionGuard("A", b.listen);
    g.attach();
    expect(g.alive()).toBe(true);
    b.say("A"); // hydratation de la page
    expect(g.alive()).toBe(true);
    b.say("B");
    expect(g.alive()).toBe(false);
    b.say("A"); // retour au compte de la page
    expect(g.alive()).toBe(true);
  });

  it("la première annonce n'est pas le compte de la page : B annoncé d'abord refuse", () => {
    const b = bus();
    const g = createSessionGuard("A", b.listen);
    g.attach();
    b.say("B");
    expect(g.alive()).toBe(false);
    b.say(null);
    expect(g.alive()).toBe(false);
  });

  it("une écriture en cours au démontage retient l'écoute : l'annonce de B empêche l'envoi suivant", async () => {
    const b = bus();
    const g = createSessionGuard("A", b.listen);
    const detach = g.attach();
    const sent: boolean[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const writer = createSerialWriter<boolean>({
      initial: false,
      alive: g.alive,
      write: async (v) => {
        sent.push(v);
        await gate;
        return v;
      },
      onSettled: () => {},
      onError: () => {},
    });
    g.watch(writer);
    writer.set(true); // part
    writer.set(false); // attend la fin du premier
    detach(); // démontage
    expect(b.count()).toBe(1); // toujours à l'écoute
    b.say("B");
    release();
    await writer.whenIdle();
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toEqual([true]); // le second envoi n'est jamais parti
    expect(b.count()).toBe(0); // l'écriture finie, l'écoute est coupée
  });

  it("sans écriture en cours, le démontage coupe l'écoute", async () => {
    const b = bus();
    const g = createSessionGuard("A", b.listen);
    g.attach()();
    await Promise.resolve();
    await Promise.resolve();
    expect(b.count()).toBe(0);
  });
});

describe("garde d'une page dont le compte change (tour 3)", () => {
  it("même compte : la même garde ; autre compte : une garde neuve qui refuse l'annonce de l'ancien", () => {
    const b = bus();
    const a1 = guardFor(null, "A", b.listen);
    expect(guardFor(a1, "A", b.listen)).toBe(a1);
    const b1 = guardFor(a1, "B", b.listen);
    expect(b1).not.toBe(a1);
    expect(b1.guard).not.toBe(a1.guard);
    b1.guard.attach();
    b.say("A");
    expect(b1.guard.alive()).toBe(false); // une annonce de A n'accorde rien à une page de B
    b.say("B");
    expect(b1.guard.alive()).toBe(true);
  });
});
