// « Écrire à » (lot M4, tour 2) : une réponse perdue ne publie jamais de doublon.
import { describe, expect, it } from "vitest";

import { type Draft, sendOnce } from "./sendOnce";

class Failure extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}
const statusOf = (e: unknown) => (e instanceof Failure ? e.status : 0);

/** Une API qui dédoublonne par `clientId`, comme `POST /conversations/:id/messages`. */
function fakeApi() {
  const saved = new Map<string, string>();
  let loseNext = false;
  let refuseNext = false;
  return {
    saved,
    loseNextResponse: () => {
      loseNext = true;
    },
    refuseNext: () => {
      refuseNext = true;
    },
    send: async (d: Draft) => {
      if (refuseNext) {
        refuseNext = false;
        throw new Failure(400);
      }
      if (!saved.has(d.clientId)) saved.set(d.clientId, d.body);
      if (loseNext) {
        loseNext = false;
        // Enregistré, mais la réponse n'arrive jamais.
        throw new Failure(0);
      }
    },
  };
}

let n = 0;
const makeId = () => `id-${++n}`;

describe("envoi d'un message depuis la fiche", () => {
  it("réponse perdue après l'enregistrement : le nouvel essai repart à l'identique, un seul message publié", async () => {
    const api = fakeApi();
    const state = { draft: null as Draft | null };
    api.loseNextResponse();
    await expect(sendOnce(state, "Je peux venir avec une remorque ?", makeId, api.send, statusOf)).rejects.toThrow();
    expect(state.draft?.body).toBe("Je peux venir avec une remorque ?");
    const first = state.draft?.clientId;
    // Le texte du champ a pu changer : c'est le brouillon en attente qui repart.
    await sendOnce(state, "Autre chose", makeId, api.send, statusOf);
    expect(state.draft).toBeNull();
    expect([...api.saved.entries()]).toEqual([[first, "Je peux venir avec une remorque ?"]]);
  });

  it("refus clair de l'API : rien n'est gardé, le message suivant a un nouvel identifiant", async () => {
    const api = fakeApi();
    const state = { draft: null as Draft | null };
    api.refuseNext();
    await expect(sendOnce(state, "Trop long…", makeId, api.send, statusOf)).rejects.toThrow();
    expect(state.draft).toBeNull();
    await sendOnce(state, "Corrigé", makeId, api.send, statusOf);
    expect([...api.saved.values()]).toEqual(["Corrigé"]);
  });

  it("deux messages confirmés : deux identifiants", async () => {
    const api = fakeApi();
    const state = { draft: null as Draft | null };
    await sendOnce(state, "Un", makeId, api.send, statusOf);
    await sendOnce(state, "Deux", makeId, api.send, statusOf);
    expect([...api.saved.values()]).toEqual(["Un", "Deux"]);
    expect(api.saved.size).toBe(2);
  });
});
