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

  it("liens des notifications (Activité, Messages, ancienne Boîte) vers les écrans de l'appli", () => {
    const id = "8f8e2f0a-1c1c-4c4c-8a8a-0123456789ab";
    // Lot R7c2 : la Boîte a disparu (anciens liens gardés dans des notifications déjà envoyées).
    expect(appLinkOf(`/app/boite/${id}`)).toBe(`/messages/${id}`);
    expect(appLinkOf("/app/boite/demandes")).toBe("/activite/demandes");
    expect(appLinkOf("/app/boite")).toBe("/messages");
    expect(appLinkOf(`/app/messages/${id}`)).toBe(`/messages/${id}`);
    expect(appLinkOf("/app/messages/demandes")).toBe("/messages/demandes");
    expect(appLinkOf("/app/activite")).toBe("/activite");
    expect(appLinkOf(`/app/activite/${id}`)).toBeNull();
    expect(appLinkOf("/app/boite/../acces")).toBeNull();
    expect(appLinkOf("/u/Kenji_66")).toBe("/u/Kenji_66");
    expect(appLinkOf("https://exemple.com")).toBeNull();
  });

  it("liens du récap et du passeport (lot 50)", () => {
    const id = "8f8e2f0a-1c1c-4c4c-8a8a-0123456789ab";
    expect(appLinkOf(`/app/recap/${id}`)).toBe(`/recap/${id}`);
    expect(appLinkOf("/app/recap/abc")).toBeNull();
    // Lot R7j : la notification « Un souvenir pour toi ».
    expect(appLinkOf(`/app/souvenir/${id}`)).toBe(`/souvenir/${id}`);
    expect(appLinkOf("/app/souvenir/abc")).toBeNull();
    expect(appLinkOf("/app/passeport")).toBe("/mon-passeport");
    expect(appLinkOf("/app/passeport/../acces")).toBeNull();
  });

  it("lien d'avis d'un remerciement vers la feuille d'avis de l'onglet Accès (lot 27)", () => {
    const id = "8f8e2f0a-1c1c-4c4c-8a8a-0123456789ab";
    expect(appLinkOf(`/app/acces?avis=${id}`)).toBe(`/acces?avis=${id}`);
    expect(appLinkOf("/app/acces?avis=../../x")).toBeNull();
    expect(appLinkOf("/app/acces")).toBeNull();
  });
});
