// Lot R8m, tour 6 : le branchement réel `sessionChannel` → magasin de la position du site. Déconnexion : la position de A est
// effacée et aucune coordonnée ne repart (ni relecture forcée) ; un autre compte ne la voit pas.
import { afterEach, describe, expect, it, vi } from "vitest";

// Réchauffe le graphe de modules (transformation de `@orasso/shared`, du canal de session et de la position) à la COLLECTE, qui n'a pas
// de délai par test : sans cela, le premier test paie seul ces imports à froid, et dans la suite complète du site (45 fichiers qui se
// disputent le processeur) il dépassait les 5 s alloués (reproduit avec le processeur saturé : « Test timed out in 5000ms »,
// jamais une assertion fausse). Les doubles posés dans `setup` ne changent pas : les imports de `setup` repartent d'un registre vide.
vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
vi.stubGlobal("BroadcastChannel", undefined);
await import("../../lib/sessionChannel");
await import("./position");
vi.unstubAllGlobals();
vi.resetModules();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function setup() {
  vi.resetModules();
  vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 42.704937, longitude: 2.895412 } }),
    },
  });
  // `api.client` est un module « client » du site : remplacé ici par un appel qui note les corps envoyés.
  const bodies: string[] = [];
  vi.doMock("../../lib/api.client", () => ({
    apiFetch: async (_path: string, init: { json?: unknown }) => {
      bodies.push(JSON.stringify(init.json));
      return { ok: true, status: 200, data: { label: "Canet-en-Roussillon", weather: null } };
    },
  }));
  const channel = await import("../../lib/sessionChannel");
  const position = await import("./position");
  return { channel, position, bodies };
}

describe("position du site et session", () => {
  it("déconnexion : la position de A est effacée, aucune coordonnée ne repart, B ne la voit pas", async () => {
    const { channel, position, bodies } = await setup();
    channel.announceSession("A");
    expect(await position.askMyPosition()).toBe(true);
    expect(position.peekWeatherPosition().at?.label).toBe("Canet-en-Roussillon");
    // Seule la case de 0,1° est partie.
    expect(bodies).toEqual([JSON.stringify({ lat: 42.7, lng: 2.9 })]);
    channel.announceSession(null);
    expect(position.peekWeatherPosition().at).toBeNull();
    await position.refreshMyPosition(true);
    expect(bodies).toHaveLength(1);
    channel.announceSession("B");
    expect(position.peekWeatherPosition().at).toBeNull();
    await position.refreshMyPosition(true);
    expect(bodies).toHaveLength(1);
  });

  it("un autre compte annoncé sans déconnexion : la position de A est effacée", async () => {
    const { channel, position, bodies } = await setup();
    channel.announceSession("A");
    await position.askMyPosition();
    channel.announceSession("B");
    expect(position.peekWeatherPosition().at).toBeNull();
    await position.refreshMyPosition(true);
    expect(bodies).toHaveLength(1);
  });

  it("le même compte ré-annoncé : la position reste", async () => {
    const { channel, position } = await setup();
    channel.announceSession("A");
    await position.askMyPosition();
    channel.announceSession("A");
    expect(position.peekWeatherPosition().at).not.toBeNull();
  });
});
