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
    // Lot R7m1 : « Ton partenariat est terminé » mène à la fiche du pro.
    expect(appLinkOf("/p/garage-du-port")).toBe("/p/garage-du-port");
    expect(appLinkOf("/p/garage-du-port/../x")).toBeNull();
    expect(appLinkOf("https://exemple.com")).toBeNull();
  });

  it("liens du récap et du passeport (lot 50)", () => {
    const id = "8f8e2f0a-1c1c-4c4c-8a8a-0123456789ab";
    expect(appLinkOf(`/app/recap/${id}`)).toBe(`/recap/${id}`);
    expect(appLinkOf("/app/recap/abc")).toBeNull();
    expect(appLinkOf("/app/passeport")).toBe("/mon-passeport");
    expect(appLinkOf("/app/passeport/../acces")).toBeNull();
  });

  it("notifications des votes (lot R7l3) : « vote lancé » ouvre la liste, « tu gagnes » ouvre le résultat du vote", () => {
    const vote = "8f8e2f0a-1c1c-4c4c-8a8a-0123456789ab";
    expect(appLinkOf("/app/votes/rassemblement-du-lydia")).toBe("/votes/rassemblement-du-lydia");
    expect(appLinkOf(`/app/vote/rassemblement-du-lydia?vote=${vote}`)).toBe(
      `/vote/rassemblement-du-lydia?vote=${vote}`,
    );
    // Rien d'autre que des adresses d'événement et des identifiants de vote : pas de chemin glissé.
    expect(appLinkOf("/app/votes/../acces")).toBeNull();
    expect(appLinkOf("/app/votes/a/b")).toBeNull();
    expect(appLinkOf("/app/vote/lydia?vote=pas-un-identifiant")).toBeNull();
    expect(appLinkOf("/app/vote/lydia?vote=" + vote + "&x=1")).toBeNull();
  });

  it("lien d'avis d'un remerciement vers la feuille d'avis de l'onglet Accès (lot 27)", () => {
    const id = "8f8e2f0a-1c1c-4c4c-8a8a-0123456789ab";
    expect(appLinkOf(`/app/acces?avis=${id}`)).toBe(`/acces?avis=${id}`);
    expect(appLinkOf("/app/acces?avis=../../x")).toBeNull();
    expect(appLinkOf("/app/acces")).toBeNull();
  });
});
