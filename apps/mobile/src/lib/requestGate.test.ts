import { describe, expect, it } from "vitest";
import { createRequestGate } from "./requestGate";

describe("garde des lectures (lot M3, tour 3)", () => {
  it("seule la dernière lecture compte : une ancienne réponse arrivée après coup est ignorée", () => {
    const gate = createRequestGate(() => "a");
    const first = gate.start(); // lecture initiale
    const second = gate.start(); // relecture après une suppression
    expect(second.current()).toBe(true);
    expect(first.current()).toBe(false); // l'ancienne réponse (avant la suppression) n'écrase rien
  });

  it("vie privée : une page tardive demandée par A est jetée quand B s'est connecté", () => {
    let account: string | null = "a";
    const gate = createRequestGate(() => account);
    const more = gate.follow(); // A demande la page suivante
    account = "b";
    gate.invalidate(); // changement de compte : liste vidée, lectures invalidées
    expect(more.current()).toBe(false);
    expect(gate.start().current()).toBe(true);
  });

  it("une page suivante reste valable tant qu'aucune autre lecture n'est partie, et sous le même compte", () => {
    let account: string | null = "a";
    const gate = createRequestGate(() => account);
    gate.start();
    const more = gate.follow();
    expect(more.current()).toBe(true);
    account = null; // déconnexion sans autre lecture
    expect(more.current()).toBe(false);
    account = "a";
    gate.start();
    expect(more.current()).toBe(false);
  });
});
