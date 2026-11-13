import { pendingFail, pendingStart } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { commentsScope } from "./scope";
import { createPostLiveSet } from "./storeSet";

const A = commentsScope("u1", "s:a");
const B = commentsScope("u1", "s:b");
const start = (c: string) => (s: Parameters<typeof pendingStart>[0]) =>
  pendingStart(s, { clientId: c, text: "salut", parentId: null });

describe("un magasin de commentaires par compte et par casquette", () => {
  it("échec sous A → B → retour à A : le brouillon et le commentaire en échec sont toujours là", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const t = set.ticket("post-1");
    set.updateSheet("post-1", start("c1"), t);
    set.updateSheet("post-1", (s) => pendingFail(s, "c1", "Pas envoyé"), t);
    set.setDraft("post-1", { text: "brouillon d'A" });
    set.setAccount(B, true);
    expect(set.sheetOf("post-1").pending).toHaveLength(0);
    expect(set.draftOf("post-1").text).toBe("");
    set.setAccount(A, true);
    expect(set.sheetOf("post-1").pending).toHaveLength(1);
    expect(set.draftOf("post-1").text).toBe("brouillon d'A");
  });

  it("un ticket pris sous A, passage à B, réponse : B intact, A confirmé (plus de « en cours » sans fin, pas de doublon au retour)", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const t = set.ticket("post-1");
    set.updateSheet("post-1", start("c1"), t);
    set.setAccount(B, true);
    // Le ticket d'A n'est pas celui de la casquette active, mais sa réponse peut s'écrire (chez A).
    expect(set.isCurrent(t as never)).toBe(false);
    expect(set.alive(t as never)).toBe(true);
    // La confirmation (l'envoi quitte « en attente ») arrive pendant que B est active.
    set.updateSheet("post-1", (s) => ({ ...s, pending: s.pending.filter((p) => p.clientId !== "c1") }), t);
    // B n'a rien reçu.
    expect(set.sheetOf("post-1").pending).toHaveLength(0);
    expect(set.sheetOf("post-1").items).toHaveLength(0);
    // Retour sur A : l'envoi est confirmé (plus en attente), sans doublon.
    set.setAccount(A, true);
    expect(set.sheetOf("post-1").pending).toHaveLength(0);
  });

  it("un ticket d'A n'écrit jamais dans le magasin de B ; alive est faux quand le compte change", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const tA = set.ticket("p");
    set.setAccount(B, true);
    const tB = set.ticket("p");
    set.updateSheet("p", start("cB"), tB);
    set.updateSheet("p", start("cA"), tA);
    expect(set.sheetOf("p").pending.map((p) => p.clientId)).toEqual(["cB"]);
    // Un autre compte : les tickets d'avant ne valent plus nulle part.
    set.setAccount(commentsScope("u2", "s:a"), true);
    expect(set.alive(tA as never)).toBe(false);
    expect(set.alive(tB as never)).toBe(false);
  });

  it("échec reçu pendant que B est active : appliqué chez A, « Réessayer » visible au retour (jamais « Envoi… » sans fin)", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const t = set.ticket("p");
    set.updateSheet("p", start("c1"), t);
    set.setAccount(B, true);
    // L'échec arrive APRÈS le changement de casquette.
    set.updateSheet("p", (s) => pendingFail(s, "c1", "Pas envoyé"), t);
    expect(set.sheetOf("p").pending).toHaveLength(0);
    set.setAccount(A, true);
    const pending = set.sheetOf("p").pending;
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).not.toBe("sending");
    expect(pending[0]?.error).toBe("Pas envoyé");
  });

  it("réponse tardive après changement de compte : le ticket du compte quitté ne vaut plus, même si l'on se reconnecte au même compte", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const t = set.ticket("p");
    set.updateSheet("p", start("c1"), t);
    // Déconnexion puis reconnexion au même compte (portée identique, magasin neuf).
    set.clear(true);
    set.setAccount(A, true);
    expect(set.alive(t as never)).toBe(false);
    set.updateSheet("p", (s) => pendingFail(s, "c1", "x"), t);
    expect(set.sheetOf("p").pending).toHaveLength(0);
    // Un autre compte.
    const tNew = set.ticket("p");
    set.setAccount(commentsScope("u2", "s:a"), true);
    expect(set.alive(tNew as never)).toBe(false);
    set.updateSheet("p", start("inject"), tNew);
    expect(set.sheetOf("p").pending).toHaveLength(0);
  });

  it("une lecture partie sous A n'est jamais affichée sous B", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const read = set.beginRead("p", "top");
    set.setAccount(B, true);
    // La lecture d'A reste valable chez A seulement ; sa réponse s'écrit chez A, B ne la voit pas.
    expect(set.isCurrent(read as never)).toBe(false);
    set.updateSheet("p", start("fromA"), read as never);
    expect(set.sheetOf("p").pending).toHaveLength(0);
    // Une lecture plus récente chez A rend l'ancienne périmée.
    set.setAccount(A, true);
    set.beginRead("p", "top");
    expect(set.fresh(read as never)).toBe(false);
  });

  it("l'état d'écran est commun : la feuille ouverte et les hôtes ne dépendent pas de la casquette", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    set.open("p", true);
    const off = set.register("p", "inst-1");
    set.setAccount(B, true);
    expect(set.opening()).toEqual({ postId: "p", focus: true });
    expect(set.host("p")).toBe("inst-1");
    off();
  });

  it("un autre compte vide tous les magasins ; la déconnexion aussi", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    set.updateSheet("p", start("c"), set.ticket("p"));
    set.setAccount(commentsScope("u2", "s:a"), true);
    set.setAccount(A, true);
    expect(set.sheetOf("p").pending).toHaveLength(0);
    set.updateSheet("p", start("c"), set.ticket("p"));
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
