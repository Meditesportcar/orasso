// Lot R8s, tours 4 et 5 : les textes de réponse d'issue incertaine ne survivent ni à la déconnexion ni à un autre compte, même
// sans BroadcastChannel (repli `storage`, qui ne prévient pas la fenêtre émettrice) : `announceSession` est appelé pour de vrai.
import { afterEach, describe, expect, it, vi } from "vitest";

import { heldReplyKeysUser, replyKeysFor, watchReplyKeysSession } from "./replyKeysStore";
import { announceSession } from "./sessionChannel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("magasin des identifiants de réponse", () => {
  it("rendu serveur (pas de fenêtre) : rien n'est gardé", () => {
    expect(replyKeysFor("A")).toBeTruthy();
    expect(heldReplyKeysUser()).toBeNull();
  });

  it("sans BroadcastChannel : réponse incertaine sous A, déconnexion, connexion sous B : magasin vide", () => {
    vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.stubGlobal("BroadcastChannel", undefined);
    const stop = watchReplyKeysSession();
    try {
      const keys = replyKeysFor("A");
      keys.begin("s1", "texte");
      keys.end("s1", "texte", false);
      expect(heldReplyKeysUser()).toBe("A");
      // Le même compte annoncé : gardé.
      announceSession("A");
      expect(heldReplyKeysUser()).toBe("A");
      // Déconnexion : vidé.
      announceSession(null);
      expect(heldReplyKeysUser()).toBeNull();
      // Connexion sous B sans ouvrir de story : rien de A ne revient.
      replyKeysFor("A");
      announceSession("B");
      expect(heldReplyKeysUser()).toBeNull();
      expect(replyKeysFor("B")).not.toBe(keys);
    } finally {
      stop();
    }
  });

  it("avec BroadcastChannel : l'annonce de la même fenêtre purge aussi (message reçu par l'autre instance)", async () => {
    vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
    const stop = watchReplyKeysSession();
    try {
      replyKeysFor("A");
      announceSession(null);
      await new Promise((r) => setTimeout(r, 50));
      expect(heldReplyKeysUser()).toBeNull();
    } finally {
      stop();
    }
  });
});
