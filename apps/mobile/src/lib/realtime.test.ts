// Lot 18 : client temps réel (calculs purs) et liens des notifications de la Boîte.
import { describe, expect, it } from "vitest";

import { appLinkOf } from "./links";
import { reconnectDelay, tokenProtocol, wsUrlOf } from "./realtimeModel";

describe("temps réel de l'appli", () => {
  it("reconnexion de 1 s à 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(reconnectDelay)).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });

  it("jeton porté par un sous-protocole valide (hexadécimal)", () => {
    const protocol = tokenProtocol("abc.D/e+f=");
    expect(protocol).toBe(`orasso.bearer.${Buffer.from("abc.D/e+f=").toString("hex")}`);
    expect(protocol).toMatch(/^orasso\.bearer\.[0-9a-f]+$/);
  });

  it("adresse WebSocket de l'API", () => {
    expect(wsUrlOf("http://localhost:3181")).toBe("ws://localhost:3181/api/ws");
    expect(wsUrlOf("https://dev.orasso.fr/")).toBe("wss://dev.orasso.fr/api/ws");
  });

  it("liens des notifications de la Boîte vers les écrans de l'appli", () => {
    const id = "8f8e2f0a-1c1c-4c4c-8a8a-0123456789ab";
    expect(appLinkOf(`/app/boite/${id}`)).toBe(`/boite/${id}`);
    expect(appLinkOf("/app/boite/demandes")).toBe("/(tabs)/boite");
    expect(appLinkOf("/app/boite")).toBe("/(tabs)/boite");
    expect(appLinkOf("/app/boite/../acces")).toBeNull();
    expect(appLinkOf("/u/Kenji_66")).toBe("/u/Kenji_66");
    expect(appLinkOf("https://exemple.com")).toBeNull();
  });

  it("lien d'avis d'un remerciement vers la feuille d'avis de l'onglet Accès (lot 27)", () => {
    const id = "8f8e2f0a-1c1c-4c4c-8a8a-0123456789ab";
    expect(appLinkOf(`/app/acces?avis=${id}`)).toBe(`/(tabs)/acces?avis=${id}`);
    expect(appLinkOf("/app/acces?avis=../../x")).toBeNull();
    expect(appLinkOf("/app/acces")).toBeNull();
  });
});
