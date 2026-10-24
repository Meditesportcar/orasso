// Lot R3d, tour 2 (relectures) : brouillon de l'arrivée sur un stockage retardé. Une suppression passe toujours après
// une sauvegarde en cours ; une connexion efface le brouillon et l'état en mémoire, même après un redémarrage de l'appli :
// la personne suivante sur le même téléphone ne retrouve rien de la précédente.
import { describe, expect, it } from "vitest";

import { createDraftPersistence, type DraftStorage } from "./draftQueue";
import { type ArriveeDraft, arriveeStore, emptyIdentity } from "./model";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Un trousseau lent (écritures de 30 ms), partagé entre deux « lancements » de l'appli. */
function slowDevice() {
  let stored: ArriveeDraft | null = null;
  const storage: DraftStorage = {
    get: async () => {
      await wait(5);
      return stored ? JSON.parse(JSON.stringify(stored)) : null;
    },
    set: async (d) => {
      await wait(30);
      stored = JSON.parse(JSON.stringify(d));
    },
    del: async () => {
      await wait(5);
      stored = null;
    },
  };
  return { storage, read: () => stored };
}

const personA = {
  pseudo: "Julien_66",
  firstName: "Julien",
  lastName: "Martí",
  email: "julien@exemple.fr",
  password: "secret-de-julien",
  terms: true,
};

describe("brouillon de l'arrivée, file d'écriture", () => {
  it("une fin d'inscription demandée pendant une sauvegarde lente passe après elle", async () => {
    arriveeStore.reset();
    const device = slowDevice();
    const p = createDraftPersistence(arriveeStore, device.storage, 0);
    await p.hydrated;
    arriveeStore.set({ profile: "organizer", departments: ["66"], identity: personA });
    await wait(5); // la sauvegarde (30 ms) est en cours
    await p.finish();
    expect(device.read()).toBeNull();
    arriveeStore.reset();
    await p.idle();
  });

  it("jamais le mot de passe sur l'appareil", async () => {
    arriveeStore.reset();
    const device = slowDevice();
    const p = createDraftPersistence(arriveeStore, device.storage, 0);
    await p.hydrated;
    arriveeStore.set({ identity: personA, step: "identite" });
    await wait(1);
    await p.idle();
    expect(JSON.stringify(device.read())).not.toContain("secret-de-julien");
    expect(device.read()?.identity.email).toBe("julien@exemple.fr");
    await p.forget();
  });

  it("deux personnes, un téléphone : A commence, se connecte à son compte ; B, après un redémarrage, ne retrouve rien", async () => {
    // Lancement 1 : A remplit l'arrivée, puis choisit « J'ai déjà un compte » et se connecte.
    arriveeStore.reset();
    const device = slowDevice();
    const first = createDraftPersistence(arriveeStore, device.storage, 0);
    await first.hydrated;
    arriveeStore.set({ profile: "visitor", departments: ["66", "11"], identity: personA, step: "identite" });
    await wait(1);
    await first.idle();
    expect(device.read()?.identity.pseudo).toBe("Julien_66");
    await first.forget(); // connexion réussie (session.tsx)
    expect(arriveeStore.get().identity).toEqual(emptyIdentity);
    expect(arriveeStore.get().departments).toEqual([]);
    expect(device.read()).toBeNull();

    // Lancement 2 (l'appli a été fermée) : B ouvre l'arrivée.
    arriveeStore.reset();
    const second = createDraftPersistence(arriveeStore, device.storage, 0);
    await second.hydrated;
    expect(second.takeResumeStep()).toBeNull();
    expect(arriveeStore.get().identity).toEqual(emptyIdentity);
    expect(arriveeStore.get().departments).toEqual([]);
  });

  it("une déconnexion pendant la relecture du brouillon n'applique pas ce brouillon", async () => {
    arriveeStore.reset();
    const device = slowDevice();
    const before = createDraftPersistence(arriveeStore, device.storage, 0);
    await before.hydrated;
    arriveeStore.set({ identity: personA });
    await wait(1);
    await before.idle();
    arriveeStore.reset();
    await before.idle();
    // Un brouillon est de nouveau là (autre personne), puis une relecture démarre et la session est effacée aussitôt.
    arriveeStore.set({ identity: personA });
    await wait(1);
    await before.idle();
    const p = createDraftPersistence(arriveeStore, device.storage, 0);
    arriveeStore.reset();
    await p.forget();
    await p.hydrated;
    expect(arriveeStore.get().identity).toEqual(emptyIdentity);
    await p.idle();
    expect(device.read()).toBeNull();
  });
});
