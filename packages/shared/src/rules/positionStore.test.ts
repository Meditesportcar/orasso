import { describe, expect, it } from "vitest";
import type { WeatherAt } from "../weather";

import { createPositionStore, POSITION_INFLIGHT_STALE_MS, POSITION_REFRESH_MS } from "./positionStore";

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

  it("tour 5 : deux relocalisations A puis B, la réponse de A arrive après celle de B : B reste", async () => {
    const t = setup();
    const a = t.store.give({ lat: 42.5, lng: 3.0 });
    const b = t.store.give({ lat: 42.7, lng: 2.9 });
    // B répond d'abord, A (plus lente) ensuite.
    t.pending[1]?.resolve(at("B"));
    expect(await b).toBe(true);
    t.pending[0]?.resolve(at("A"));
    expect(await a).toBe(false);
    expect(t.store.view().at?.label).toBe("B");
    expect(t.store.view().coarse).toEqual({ lat: 42.7, lng: 2.9 });
  });

  it("tour 5 : une relecture partie avant un nouveau geste et revenue après ne réécrit pas la nouvelle position", async () => {
    const t = setup();
    const first = t.store.give({ lat: 42.5, lng: 3.0 });
    t.pending[0]?.resolve(at("A"));
    await first;
    t.advance(POSITION_REFRESH_MS + 1);
    const refresh = t.store.refresh(true);
    const give = t.store.give({ lat: 42.7, lng: 2.9 });
    t.pending[2]?.resolve(at("B"));
    expect(await give).toBe(true);
    // La relecture de l'ancienne case revient en retard : elle n'écrase pas la météo de B.
    t.pending[1]?.resolve(at("A, relue"));
    await refresh;
    expect(t.store.view().at?.label).toBe("B");
  });

  it("tour 6 : un give(B) en vol, puis un refresh : le refresh ne part pas, B reste avec sa météo", async () => {
    const t = setup();
    const first = t.store.give({ lat: 42.5, lng: 3.0 });
    t.pending[0]?.resolve(at("A"));
    await first;
    t.advance(POSITION_REFRESH_MS + 1);
    const give = t.store.give({ lat: 42.7, lng: 2.9 });
    const refresh = t.store.refresh(true);
    // Aucune relecture de l'ancienne position n'est partie pendant le geste.
    expect(t.calls()).toBe(2);
    t.pending[1]?.resolve(at("B"));
    expect(await give).toBe(true);
    await refresh;
    expect(t.store.view().at?.label).toBe("B");
    expect(t.store.view().coarse).toEqual({ lat: 42.7, lng: 2.9 });
  });

  it("tour 6 : relecture lente, puis give(B) : dans les deux ordres de réponse, B reste", async () => {
    for (const refreshFirst of [true, false]) {
      const t = setup();
      const first = t.store.give({ lat: 42.5, lng: 3.0 });
      t.pending[0]?.resolve(at("A"));
      await first;
      t.advance(POSITION_REFRESH_MS + 1);
      const refresh = t.store.refresh(true);
      const give = t.store.give({ lat: 42.7, lng: 2.9 });
      if (refreshFirst) {
        t.pending[1]?.resolve(at("A, relue"));
        t.pending[2]?.resolve(at("B"));
      } else {
        t.pending[2]?.resolve(at("B"));
        t.pending[1]?.resolve(at("A, relue"));
      }
      await Promise.all([refresh, give]);
      expect(t.store.view().at?.label).toBe("B");
    }
  });

  it("tour 6 : une relecture sans geste concurrent s'applique toujours", async () => {
    const t = setup();
    const first = t.store.give(here);
    t.pending[0]?.resolve(at("A"));
    await first;
    t.advance(POSITION_REFRESH_MS + 1);
    const refresh = t.store.refresh();
    t.pending[1]?.resolve(at("A, relue"));
    await refresh;
    expect(t.store.view().at?.label).toBe("A, relue");
  });

  it("tour 7 : deux relectures concurrentes : la seconde ne part pas, la première s'applique", async () => {
    const t = setup();
    const first = t.store.give(here);
    t.pending[0]?.resolve(at("A"));
    await first;
    t.advance(POSITION_REFRESH_MS + 1);
    const one = t.store.refresh(true);
    const two = t.store.refresh(true);
    expect(t.calls()).toBe(2);
    t.pending[1]?.resolve(at("A, relue"));
    await Promise.all([one, two]);
    expect(t.store.view().at?.label).toBe("A, relue");
  });

  it("tour 7 : une ancienne demande suspendue, l'oubli, une nouvelle position réussie : la relecture suivante part et s'applique", async () => {
    const t = setup();
    // La demande d'avant ne répondra jamais.
    void t.store.give({ lat: 42.5, lng: 3.0 });
    t.store.forget();
    const b = t.store.give({ lat: 42.7, lng: 2.9 });
    t.pending[1]?.resolve(at("B"));
    expect(await b).toBe(true);
    t.advance(POSITION_REFRESH_MS + 1);
    const refresh = t.store.refresh(true);
    expect(t.calls()).toBe(3);
    t.pending[2]?.resolve(at("B, relue"));
    await refresh;
    expect(t.store.view().at?.label).toBe("B, relue");
  });

  it("tour 7 : un autre compte : la demande suspendue du premier ne bloque pas la relecture du second", async () => {
    const t = setup();
    const a = t.store.give(here);
    t.pending[0]?.resolve(at("A"));
    await a;
    void t.store.give({ lat: 42.6, lng: 2.8 });
    t.setScope("B");
    t.store.invalidate();
    t.store.forget();
    const b = t.store.give(here);
    t.pending[2]?.resolve(at("B"));
    await b;
    t.advance(POSITION_REFRESH_MS + 1);
    const refresh = t.store.refresh(true);
    expect(t.calls()).toBe(4);
    t.pending[3]?.resolve(at("B, relue"));
    await refresh;
    expect(t.store.view().at?.label).toBe("B, relue");
  });

  it("tour 7 : une relecture suspendue depuis plus de 30 s ne bloque plus : la relecture suivante part", async () => {
    const t = setup();
    const first = t.store.give(here);
    t.pending[0]?.resolve(at("A"));
    await first;
    // Une relecture ne répond jamais.
    const stuck = t.store.refresh(true);
    const skipped = t.store.refresh(true);
    expect(t.calls()).toBe(2);
    t.advance(POSITION_INFLIGHT_STALE_MS + 1);
    const later = t.store.refresh(true);
    expect(t.calls()).toBe(3);
    t.pending[2]?.resolve(at("A, relue"));
    await Promise.all([later, skipped]);
    expect(t.store.view().at?.label).toBe("A, relue");
    void stuck;
  });

  it("tour 8 : un give(B) en vol depuis plus de 30 s : un refresh ne part pas, B répond et reste avec sa météo", async () => {
    const t = setup();
    const first = t.store.give(here);
    t.pending[0]?.resolve(at("A"));
    await first;
    const give = t.store.give({ lat: 42.7, lng: 2.9 });
    t.advance(POSITION_INFLIGHT_STALE_MS + 1);
    const refresh = t.store.refresh(true);
    expect(t.calls()).toBe(2);
    t.pending[1]?.resolve(at("B"));
    expect(await give).toBe(true);
    await refresh;
    expect(t.store.view().at?.label).toBe("B");
    expect(t.store.view().coarse).toEqual({ lat: 42.7, lng: 2.9 });
  });

  it("tour 8 : un refresh suspendu depuis plus de 30 s : un nouveau refresh part et s'applique ; l'ancien, revenu ensuite, est jeté", async () => {
    const t = setup();
    const first = t.store.give(here);
    t.pending[0]?.resolve(at("A"));
    await first;
    const stuck = t.store.refresh(true);
    expect(t.calls()).toBe(2);
    t.advance(POSITION_INFLIGHT_STALE_MS + 1);
    const again = t.store.refresh(true);
    expect(t.calls()).toBe(3);
    t.pending[2]?.resolve(at("A, relue"));
    await again;
    expect(t.store.view().at?.label).toBe("A, relue");
    t.pending[1]?.resolve(at("A, très ancienne"));
    await stuck;
    expect(t.store.view().at?.label).toBe("A, relue");
  });
});
