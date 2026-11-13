import { describe, expect, it, vi } from "vitest";
import type { WeatherAt } from "../weather";

import {
  createPositionStore,
  POSITION_INFLIGHT_STALE_MS,
  POSITION_REFRESH_MS,
  POSITION_REQUEST_TIMEOUT_MS,
} from "./positionStore";

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

  it("tour 9 : un give dont la requête dépasse le délai : échec, inflight libéré, la relecture suivante part ; la réponse tardive est ignorée", async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const first = t.store.give(here);
      t.pending[0]?.resolve(at("A"));
      await vi.advanceTimersByTimeAsync(0);
      await first;
      const give = t.store.give({ lat: 42.7, lng: 2.9 });
      // Un refresh ne passe pas devant un give actif.
      t.advance(1);
      const blocked = t.store.refresh(true);
      expect(t.calls()).toBe(2);
      await blocked;
      // La requête ne répond jamais : abandonnée au bout du délai.
      await vi.advanceTimersByTimeAsync(POSITION_REQUEST_TIMEOUT_MS + 1);
      expect(await give).toBe(false);
      // L'état reste sur A ; une nouvelle relecture peut partir.
      expect(t.store.view().at?.label).toBe("A");
      const refresh = t.store.refresh(true);
      expect(t.calls()).toBe(3);
      t.pending[2]?.resolve(at("A, relue"));
      await vi.advanceTimersByTimeAsync(0);
      await refresh;
      expect(t.store.view().at?.label).toBe("A, relue");
      // La réponse tardive du geste abandonné ne fait rien.
      t.pending[1]?.resolve(at("B, très tard"));
      await vi.advanceTimersByTimeAsync(0);
      expect(t.store.view().at?.label).toBe("A, relue");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("suite R8q, tour 6 : chaque appel à refresh reçoit le résultat de la relecture rejointe", () => {
  it("deux appels concurrents : une seule requête, les deux reçoivent son échec (la cause comprise)", async () => {
    const t = setup();
    const first = t.store.give(here);
    t.pending[0]?.resolve(at("A"));
    await first;
    t.advance(POSITION_REFRESH_MS + 1);
    const one = t.store.refresh(true);
    const two = t.store.refresh(true);
    expect(t.calls()).toBe(2);
    const failure = new Error("403");
    t.pending[1]?.reject(failure);
    expect(await one).toEqual({ status: "failed", error: failure });
    expect(await two).toEqual({ status: "failed", error: failure });
    expect(t.store.view().at?.label).toBe("A");
  });

  it("sans position gardée, ou pendant un geste : rien ne part, résultat « skipped »", async () => {
    const t = setup();
    expect(await t.store.refresh(true)).toEqual({ status: "skipped" });
    expect(t.calls()).toBe(0);
  });

  it("une réponse : « ok »", async () => {
    const t = setup();
    const first = t.store.give(here);
    t.pending[0]?.resolve(at("A"));
    await first;
    const refresh = t.store.refresh(true);
    t.pending[1]?.resolve(at("A, relue"));
    expect(await refresh).toEqual({ status: "ok" });
  });
});

describe("suite R8q, tour 7 : les attentes sont rattachées à leur requête", () => {
  it("A en vol puis B : l'échec tardif de A ne résout pas les attentes de B, l'attente invalidée de A se termine en skipped", async () => {
    const t = setup();
    const a = t.store.give(here);
    t.pending[0]?.resolve(at("A"));
    await a;
    t.advance(POSITION_REFRESH_MS + 1);
    const a1 = t.store.refresh(true);
    const a2 = t.store.refresh(true);
    // Changement de compte : le module de position oublie aussitôt la position.
    t.setScope("B");
    t.store.forget();
    expect(await a2).toEqual({ status: "skipped" });
    const b = t.store.give(here);
    t.pending[2]?.resolve(at("B"));
    await b;
    t.advance(POSITION_REFRESH_MS + 1);
    const b1 = t.store.refresh(true);
    const b2 = t.store.refresh(true);
    expect(t.calls()).toBe(4);
    // Les réponses arrivent dans l'ordre inverse : l'échec de A d'abord.
    t.pending[1]?.reject(new Error("A, tardif"));
    expect(await a1).toEqual({ status: "skipped" });
    let settled = false;
    void b2.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    t.pending[3]?.resolve(at("B, relue"));
    expect(await b1).toEqual({ status: "ok" });
    expect(await b2).toEqual({ status: "ok" });
    expect(t.store.view().at?.label).toBe("B, relue");
  });
});
