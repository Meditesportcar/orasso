import { pendingFail, pendingStart, sheetRemoveComment } from "@orasso/shared";
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

  it("B1 : un 404 de la casquette active ferme la feuille (état d'écran commun) ; celui d'une autre casquette, reçu plus tard, ne la ferme pas", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const tA = set.ticket("p");
    set.setAccount(B, true);
    set.open("p", true);
    // 404 tardif d'A pendant que B montre la feuille : A est marquée disparue chez elle, la feuille de B reste ouverte.
    set.markGone("p", tA as never);
    expect(set.opening()).toEqual({ postId: "p", focus: true });
    expect(set.isGone("p")).toBe(false);
    // 404 de B (casquette active) : la feuille se ferme.
    set.markGone("p", set.ticket("p") as never);
    expect(set.opening()).toBeNull();
    expect(set.isGone("p")).toBe(true);
    // Sans ticket (compat) : la feuille se ferme aussi.
    set.open("q", false);
    set.markGone("q");
    expect(set.opening()).toBeNull();
  });

  it("R2 : une suppression sous A se calcule sur le magasin d'A, même reçue sous B (B intact)", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const tA = set.ticket("p");
    const item = { id: "k1", repliesCount: 0 } as never;
    set.updateSheet("p", (s) => ({ ...s, items: [item] }), tA as never);
    set.setAccount(B, true);
    // B a sa propre liste.
    const other = { id: "k2", repliesCount: 0 } as never;
    set.updateSheet("p", (s) => ({ ...s, items: [other] }), set.ticket("p") as never);
    // La réponse de la suppression d'A arrive sous B : l'état lu est celui du ticket.
    expect(set.sheetOf("p", tA as never).items.map((c: { id: string }) => c.id)).toEqual(["k1"]);
    set.updateSheet("p", (s) => sheetRemoveComment(s, "k1").state, tA as never);
    expect(set.sheetOf("p").items.map((c: { id: string }) => c.id)).toEqual(["k2"]);
    set.setAccount(A, true);
    expect(set.sheetOf("p").items).toHaveLength(0);
  });

  it("R3 : isCurrent dit qui a des effets visibles ; une réponse tardive d'A n'en a pas sous B", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const tA = set.ticket("p");
    expect(set.isCurrent(tA as never)).toBe(true);
    set.setAccount(B, true);
    expect(set.isCurrent(tA as never)).toBe(false);
    expect(set.alive(tA as never)).toBe(true);
  });

  it("m1 : au changement de compte seule la feuille ouverte est remise à zéro, les hôtes montés restent", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    set.register("p", "inst");
    set.open("p", true);
    set.setAccount(commentsScope("u2", "s:a"), true);
    expect(set.opening()).toBeNull();
    expect(set.host("p")).toBe("inst");
  });

  it("dropReads : un parent disparu rend périmées les lectures de réponses du magasin du ticket seulement", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const tA = set.ticket("p");
    const read = set.beginRead("p", "r:x");
    set.setAccount(B, true);
    const readB = set.beginRead("p", "r:x");
    set.dropReads("p", "r:x", tA as never);
    expect(set.fresh(read as never)).toBe(false);
    expect(set.fresh(readB as never)).toBe(true);
  });

  it("m2 : le compteur de la carte d'A, reçu sous B, s'écrit dans le magasin d'A (B garde la carte du serveur)", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const tA = set.ticket("p");
    set.setAccount(B, true);
    const server = { id: "p", commentsCount: 2, commentsOff: false, lastComments: [] } as never;
    set.set(server, { id: "p", commentsCount: 3, commentsOff: false, lastComments: [] } as never, tA as never);
    expect((set.apply(server) as { commentsCount: number }).commentsCount).toBe(2);
    set.setAccount(A, true);
    expect((set.apply(server) as { commentsCount: number }).commentsCount).toBe(3);
  });
});

describe("C2 et C3 : la réponse tardive d'A, reçue sous B", () => {
  const server = { id: "p", commentsCount: 2, commentsOff: false, lastComments: [] } as never;

  it("C3 : « Couper les commentaires » réussi sous A, reçu sous B : la carte d'A est conservée dans son magasin (calculée depuis ses données)", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    set.apply(server); // A affiche la publication
    const tA = set.ticket("p");
    set.setAccount(B, true);
    set.apply(server);
    set.changePost("p", tA as never, (post) => ({ ...post, commentsOff: true }));
    // B garde la carte du serveur ; A retrouve la sienne.
    expect((set.apply(server) as { commentsOff: boolean }).commentsOff).toBe(false);
    set.setAccount(A, true);
    expect((set.apply(server) as { commentsOff: boolean }).commentsOff).toBe(true);
  });

  it("C3 : les compteurs d'un commentaire ajouté sous A partent de la carte d'A, pas de celle de B", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    set.apply(server);
    const tA = set.ticket("p");
    set.setAccount(B, true);
    set.apply(server);
    set.set(server, { ...(server as object), commentsCount: 9 } as never, set.ticket("p") as never); // B : 9
    set.changePost("p", tA as never, (post) => ({ ...post, commentsCount: post.commentsCount + 1 }));
    set.setAccount(A, true);
    expect((set.apply(server) as { commentsCount: number }).commentsCount).toBe(3);
  });

  it("C2 : un 404 tardif sur les réponses d'A prend le ticket d'A (dropReads) : les lectures de B restent fraîches et son fil intact", () => {
    const set = createPostLiveSet();
    set.setAccount(A, true);
    const tA = set.ticket("p");
    const item = { id: "parent", repliesCount: 1 } as never;
    set.updateSheet("p", (s) => ({ ...s, items: [item] }), tA as never);
    set.setAccount(B, true);
    set.updateSheet("p", (s) => ({ ...s, items: [item] }), set.ticket("p") as never);
    const readB = set.beginRead("p", "r:parent");
    // Le traitement du parent disparu reçoit le ticket d'A.
    set.dropReads("p", "r:parent", tA as never);
    expect(set.sheetOf("p", tA as never).items).toHaveLength(1);
    set.updateSheet("p", (s) => sheetRemoveComment(s, "parent").state, tA as never);
    expect(set.sheetOf("p", tA as never).items).toHaveLength(0);
    expect(set.sheetOf("p").items).toHaveLength(1);
    expect(set.fresh(readB as never)).toBe(true);
  });
});
