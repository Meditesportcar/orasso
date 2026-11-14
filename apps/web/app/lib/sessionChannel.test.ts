// Partie B1, tour 6 : chaque annonce porte l'identifiant de sa fenêtre ; un abonné sait si l'annonce vient de CETTE fenêtre
// (`self`), y compris quand BroadcastChannel la livre à un autre objet du même onglet.
import { afterEach, describe, expect, it, vi } from "vitest";

import { announceSession, listenSession } from "./sessionChannel";

/** Un BroadcastChannel minimal : le message part vers tous les AUTRES objets du même nom, comme le vrai (même onglet compris). */
class FakeChannel {
  static all = new Set<FakeChannel>();
  private listeners = new Set<(e: MessageEvent) => void>();
  constructor(public name: string) {
    FakeChannel.all.add(this);
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.all) {
      if (c === this || c.name !== this.name) continue;
      for (const l of c.listeners) l({ data } as MessageEvent);
    }
  }
  addEventListener(_: string, l: (e: MessageEvent) => void) {
    this.listeners.add(l);
  }
  removeEventListener(_: string, l: (e: MessageEvent) => void) {
    this.listeners.delete(l);
  }
  close() {
    FakeChannel.all.delete(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeChannel.all.clear();
});

describe("annonces de session marquées par fenêtre", () => {
  it("l'annonce de cette fenêtre arrive avec self = true, celle d'une autre fenêtre avec self = false", () => {
    vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const seen: Array<[string | null, boolean]> = [];
    const stop = listenSession((id, self) => seen.push([id, self]));
    try {
      announceSession("A");
      // Une autre fenêtre : un message sans notre identifiant (ou avec un autre).
      const other = new FakeChannel("orasso-session");
      other.postMessage({ userId: "B", from: "une-autre-fenetre" });
      other.postMessage({ userId: null });
      expect(seen).toEqual([
        ["A", true],
        ["B", false],
        [null, false],
      ]);
    } finally {
      stop();
    }
  });

  it("sans BroadcastChannel : la fenêtre qui annonce est prévenue avec self = true", () => {
    vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.stubGlobal("BroadcastChannel", undefined);
    const seen: Array<[string | null, boolean]> = [];
    const stop = listenSession((id, self) => seen.push([id, self]));
    try {
      announceSession("A");
      expect(seen).toEqual([["A", true]]);
    } finally {
      stop();
    }
  });

  it("un abonné qui ne lit que l'identifiant garde son comportement", () => {
    vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const ids: Array<string | null> = [];
    const stop = listenSession((id) => ids.push(id));
    try {
      announceSession("A");
      new FakeChannel("orasso-session").postMessage({ userId: "B", from: "autre" });
      expect(ids).toEqual(["A", "B"]);
    } finally {
      stop();
    }
  });
});
