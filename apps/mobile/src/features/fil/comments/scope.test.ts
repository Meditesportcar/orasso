import { createPostLiveStore, pendingFail, pendingStart } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { commentsScope } from "./scope";

describe("commentsScope : compte et acteur", () => {
  it("un acteur différent = une portée différente ; personne = personne", () => {
    expect(commentsScope("u1", "s:a")).not.toBe(commentsScope("u1", "s:b"));
    expect(commentsScope("u1", null)).not.toBe(commentsScope("u1", "s:a"));
    expect(commentsScope("u1", "s:a")).toBe(commentsScope("u1", "s:a"));
    expect(commentsScope(null, "s:a")).toBeNull();
  });

  it("échec sous A → passage à B : l'envoi en échec ne reste pas, la réponse tardive d'A est jetée, rien ne part au nom de B", () => {
    const store = createPostLiveStore();
    store.setAccount(commentsScope("u1", "s:a"), true);
    const t = store.ticket("post-1");
    store.updateSheet("post-1", (s) => pendingStart(s, { clientId: "c1", text: "salut", parentId: null }), t);
    store.updateSheet("post-1", (s) => pendingFail(s, "c1", "Pas envoyé"), t);
    expect(store.sheetOf("post-1").pending).toHaveLength(1);
    // Passage à B : magasin neuf, le ticket d'A ne vaut plus.
    store.setAccount(commentsScope("u1", "s:b"), true);
    expect(store.alive(t)).toBe(false);
    expect(store.sheetOf("post-1").pending).toHaveLength(0);
    // Et l'inverse : retour à A, rien ne ressort de B.
    store.setAccount(commentsScope("u1", "s:a"), true);
    expect(store.sheetOf("post-1").pending).toHaveLength(0);
  });
});
