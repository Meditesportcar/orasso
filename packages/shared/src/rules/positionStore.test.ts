import { describe, expect, it } from "vitest";
import type { WeatherAt } from "../weather";

import { createPositionStore, POSITION_REFRESH_MS } from "./positionStore";

const at = (label: string): WeatherAt => ({ label, weather: null });
const here = { lat: 42.7, lng: 2.9 };

function setup() {
  let scope: string | null = "A";
  let now = 1_000_000;
  const pending: { resolve: (v: WeatherAt) => void; reject: (e: Error) => void }[] = [];
  let calls = 0;
  const store = createPositionStore({
    scope: () => scope,
    now: () => now,
    weatherAt: () => {
      calls += 1;
      return new Promise<WeatherAt>((resolve, reject) => pending.push({ resolve, reject }));
    },
  });
  return {
    store,
    pending,
    calls: () => calls,
    setScope: (s: string | null) => {
      scope = s;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("position en mémoire de « Ma météo »", () => {
  it("une position donnée est gardée pour son compte et invisible d'un autre", async () => {
    const t = setup();
    const p = t.store.give(here);
    t.pending[0]?.resolve(at("Canet"));
    expect(await p).toBe(true);
    expect(t.store.view().at?.label).toBe("Canet");
    t.setScope("B");
    expect(t.store.view().at).toBeNull();
    t.store.purgeForeign();
    expect(t.store.getState().coarse).toBeNull();
  });

  it("déconnexion pendant la requête : la réponse tardive n'est rangée sous aucun compte (ni sous B)", async () => {
    const t = setup();
    const p = t.store.give(here);
    t.setScope(null);
    t.setScope("B");
    t.pending[0]?.resolve(at("Canet"));
    expect(await p).toBe(false);
    expect(t.store.view().at).toBeNull();
    expect(t.store.getState().owner).toBeNull();
  });

  it("rafraîchissement tardif après déconnexion ou oubli : jeté", async () => {
    const t = setup();
    const g = t.store.give(here);
    t.pending[0]?.resolve(at("Canet"));
    await g;
    t.advance(POSITION_REFRESH_MS + 1);
    const r = t.store.refresh();
    t.setScope("B");
    t.pending[1]?.resolve(at("Autre"));
    await r;
    expect(t.store.view().at).toBeNull();
    // Même compte, mais la position a été oubliée entre-temps.
    t.setScope("A");
    const g2 = t.store.give(here);
    t.pending[2]?.resolve(at("Canet"));
    await g2;
    t.advance(POSITION_REFRESH_MS + 1);
    const r2 = t.store.refresh();
    t.store.forget();
    t.pending[3]?.resolve(at("Tardif"));
    await r2;
    expect(t.store.view().at).toBeNull();
  });

  it("la météo de la position se relit après le délai, pas avant, sauf geste manuel", async () => {
    const t = setup();
    const g = t.store.give(here);
    t.pending[0]?.resolve(at("Canet"));
    await g;
    await t.store.refresh();
    expect(t.calls()).toBe(1);
    t.advance(POSITION_REFRESH_MS - 1);
    await t.store.refresh();
    expect(t.calls()).toBe(1);
    t.advance(2);
    const r = t.store.refresh();
    t.pending[1]?.resolve(at("Canet 2"));
    await r;
    expect(t.calls()).toBe(2);
    expect(t.store.view().at?.label).toBe("Canet 2");
    const m = t.store.refresh(true);
    t.pending[2]?.resolve(at("Canet 3"));
    await m;
    expect(t.store.view().at?.label).toBe("Canet 3");
  });

  it("changement de compte pendant l'attente du GPS : rien n'est envoyé ni gardé sous B", async () => {
    const t = setup();
    const ticket = t.store.begin();
    // Le GPS répond après la connexion de B.
    t.setScope("B");
    expect(await t.store.give(here, ticket)).toBe(false);
    expect(t.calls()).toBe(0);
    expect(t.store.view().at).toBeNull();
    expect(t.store.getState().owner).toBeNull();
    // Même compte mais position oubliée entre-temps : rien non plus.
    t.setScope("A");
    const second = t.store.begin();
    t.store.forget();
    expect(await t.store.give(here, second)).toBe(false);
    expect(t.calls()).toBe(0);
  });

  it("A → déconnexion → A pendant l'attente du GPS puis du réseau : l'ancien ticket est invalidé", async () => {
    const t = setup();
    // Attente du GPS : la session passe par « aucune » puis revient sur A ; la transition invalide les tickets.
    const gps = t.store.begin();
    t.setScope(null);
    t.store.forget();
    t.setScope("A");
    expect(gps && t.store.valid(gps)).toBe(false);
    expect(await t.store.give(here, gps)).toBe(false);
    expect(t.calls()).toBe(0);
    // Attente du réseau.
    const net = t.store.begin();
    const p = t.store.give(here, net);
    t.setScope(null);
    t.store.forget();
    t.setScope("A");
    t.pending[0]?.resolve(at("Canet"));
    expect(await p).toBe(false);
    expect(t.store.view().at).toBeNull();
  });

  it("une relecture en échec garde la dernière météo", async () => {
    const t = setup();
    const g = t.store.give(here);
    t.pending[0]?.resolve(at("Canet"));
    await g;
    t.advance(POSITION_REFRESH_MS + 1);
    const r = t.store.refresh();
    t.pending[1]?.reject(new Error("hors ligne"));
    await r;
    expect(t.store.view().at?.label).toBe("Canet");
  });
});
