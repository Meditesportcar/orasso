import { pendingFail, pendingStart } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { commentsScope } from "./scope";
import { createPostLiveSet } from "./storeSet";

const A = commentsScope("u1", "s:a");
const B = commentsScope("u1", "s:b");

describe("un magasin de commentaires par compte et par casquette", () => {
  it("échec sous A → B → retour à A : le brouillon et le commentaire en échec sont toujours là", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const t = set.ticket("post-1");
    set.updateSheet("post-1", (s) => pendingStart(s, { clientId: "c1", text: "salut", parentId: null }), t);
    set.updateSheet("post-1", (s) => pendingFail(s, "c1", "Pas envoyé"), t);
    set.setDraft("post-1", { text: "brouillon d'A" });
    expect(set.sheetOf("post-1").pending).toHaveLength(1);

    set.setAccount(B, true);
    // B ne voit rien d'A.
    expect(set.sheetOf("post-1").pending).toHaveLength(0);
    expect(set.draftOf("post-1").text).toBe("");

    set.setAccount(A, true);
    expect(set.sheetOf("post-1").pending).toHaveLength(1);
    expect(set.draftOf("post-1").text).toBe("brouillon d'A");
  });

  it("un autre compte vide tous les magasins ; la déconnexion aussi", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    set.updateSheet("p", (s) => pendingStart(s, { clientId: "c", text: "x", parentId: null }), set.ticket("p"));
    set.setAccount(commentsScope("u2", "s:a"), true);
    set.setAccount(A, true);
    expect(set.sheetOf("p").pending).toHaveLength(0);
    set.updateSheet("p", (s) => pendingStart(s, { clientId: "c", text: "x", parentId: null }), set.ticket("p"));
    set.clear(true);
    set.setAccount(A, true);
    expect(set.sheetOf("p").pending).toHaveLength(0);
  });

  it("la version change au changement de magasin, et les abonnés sont prévenus", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const v = set.version();
    let n = 0;
    set.subscribe(() => {
      n += 1;
    });
    set.setAccount(B);
    expect(set.version()).not.toBe(v);
    expect(n).toBe(1);
  });
});
