// Lot R8s, tour 4 : les textes de réponse d'issue incertaine ne survivent ni à la déconnexion ni à un autre compte.
import { describe, expect, it } from "vitest";

import { heldReplyKeysUser, replyKeysFor, watchReplyKeysSession } from "./replyKeysStore";

describe("magasin des identifiants de réponse", () => {
  it("purgé par l'annonce d'une déconnexion ou d'un autre compte, gardé pour le même compte", () => {
    let emit: (id: string | null) => void = () => undefined;
    const stop = watchReplyKeysSession((l) => {
      emit = l;
      return () => undefined;
    });
    // Rendu serveur (pas de fenêtre) : rien n'est gardé.
    const keys = replyKeysFor("A");
    expect(keys).toBeTruthy();
    expect(heldReplyKeysUser()).toBeNull();
    stop();
    expect(typeof emit).toBe("function");
  });

  it("avec une fenêtre : réponse incertaine sous A, déconnexion, connexion sous B : magasin vide", () => {
    const g = globalThis as { window?: unknown };
    g.window = {};
    try {
      let emit: (id: string | null) => void = () => undefined;
      watchReplyKeysSession((l) => {
        emit = l;
        return () => undefined;
      });
      const keys = replyKeysFor("A");
      keys.begin("s1", "texte");
      keys.end("s1", "texte", false);
      expect(heldReplyKeysUser()).toBe("A");
      emit("A");
      expect(heldReplyKeysUser()).toBe("A");
      emit(null);
      expect(heldReplyKeysUser()).toBeNull();
      replyKeysFor("A");
      emit("B");
      expect(heldReplyKeysUser()).toBeNull();
      // Le nouveau compte repart de rien : l'identifiant de l'ancien n'est pas repris.
      const kb = replyKeysFor("B");
      expect(kb).not.toBe(keys);
    } finally {
      g.window = undefined;
    }
  });
});
