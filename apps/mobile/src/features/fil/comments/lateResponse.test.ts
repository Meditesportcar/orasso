import type { FeedPostView } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { applyCommentsOff, dropRemoved, emitPost, parentGone } from "./lateResponse";
import { commentsScope } from "./scope";
import { createPostLiveSet } from "./storeSet";

const A = commentsScope("u1", "s:a");
const B = commentsScope("u1", "s:b");
const server = { id: "p", commentsCount: 2, commentsOff: false, lastComments: [] } as unknown as FeedPostView;
const item = (id: string, repliesCount = 0) => ({ id, repliesCount }) as never;
const ids = (set: ReturnType<typeof createPostLiveSet>, t?: never) =>
  set.sheetOf("p", t).items.map((c: { id: string }) => c.id);

/** Deux casquettes qui ont chacune leur fil, A d'abord ; renvoie le ticket pris sous A, puis passe à B. */
function world() {
  const set = createPostLiveSet();
  set.setAccount(A, true);
  set.apply(server);
  const tA = set.ticket("p");
  set.updateSheet("p", (s) => ({ ...s, items: [item("k1"), item("parent", 1)] }), tA as never);
  set.setAccount(B, true);
  set.apply(server);
  const tB = set.ticket("p");
  set.updateSheet("p", (s) => ({ ...s, items: [item("k2"), item("parent", 1)] }), tB as never);
  return { set, tA, tB };
}

describe("lateResponse : la réponse reçue APRÈS le passage de A à B", () => {
  it("dropRemoved (suppression) : le commentaire part du fil d'A (R2), B est intact, la carte d'A est mise à jour chez elle", () => {
    const { set, tA } = world();
    let shown = 0;
    dropRemoved(set, "p", "k1", tA as never, (change) => emitPost(set, tA as never, server, change, () => shown++));
    expect(ids(set, tA as never)).toEqual(["parent"]);
    expect(ids(set)).toEqual(["k2", "parent"]);
    // La carte affichée (B) n'est pas touchée ; A la retrouve à son retour.
    expect(shown).toBe(0);
    set.setAccount(A, true);
    expect(ids(set)).toEqual(["parent"]);
    expect((set.apply(server) as { commentsCount: number }).commentsCount).toBeLessThan(2);
  });

  it("dropRemoved : un commentaire qui n'est pas dans le fil du ticket ne touche rien (R2 : jamais l'état de B)", () => {
    const { set, tA } = world();
    // « k2 » n'existe que chez B : la suppression d'A ne doit pas le retirer de B ni écraser le fil d'A.
    dropRemoved(set, "p", "k2", tA as never, () => undefined);
    expect(ids(set, tA as never)).toEqual(["k1", "parent"]);
    expect(ids(set)).toEqual(["k2", "parent"]);
  });

  it("emitPost : la carte d'A n'est jamais montrée sous B (R3), la modification est conservée pour A (C3)", () => {
    const { set, tA } = world();
    const shown: FeedPostView[] = [];
    emitPost(
      set,
      tA as never,
      server,
      (p) => ({ ...p, commentsOff: true }),
      (n) => shown.push(n),
    );
    expect(shown).toHaveLength(0);
    expect((set.apply(server) as { commentsOff: boolean }).commentsOff).toBe(false);
    set.setAccount(A, true);
    expect((set.apply(server) as { commentsOff: boolean }).commentsOff).toBe(true);
    // La casquette active reçoit, elle, le rappel de l'écran.
    emitPost(
      set,
      set.ticket("p") as never,
      server,
      (p) => ({ ...p, commentsOff: false }),
      (n) => shown.push(n),
    );
    expect(shown).toHaveLength(1);
  });

  it("parentGone (C2) : le ticket d'origine retire le parent chez A, sans relecture (A n'est pas active), les lectures de B restent fraîches", () => {
    const { set, tA } = world();
    const readB = set.beginRead("p", "r:parent");
    const next = parentGone(set, "p", "parent", tA as never, () => undefined);
    expect(next).toBe("done");
    expect(ids(set, tA as never)).toEqual(["k1"]);
    expect(ids(set)).toEqual(["k2", "parent"]);
    expect(set.fresh(readB as never)).toBe(true);
  });

  it("parentGone sous la casquette active : le parent part et la première page doit être relue", () => {
    const { set, tB } = world();
    expect(parentGone(set, "p", "parent", tB as never, () => undefined)).toBe("reload");
    expect(ids(set)).toEqual(["k2"]);
  });

  it("applyCommentsOff (menu « ⋯ ») : confirmation tardive d'A → écrite chez A, le menu de B n'est pas fermé", () => {
    const { set, tA } = world();
    expect(applyCommentsOff(set, server, true, tA as never)).toBe(false);
    expect((set.apply(server) as { commentsOff: boolean }).commentsOff).toBe(false);
    set.setAccount(A, true);
    expect((set.apply(server) as { commentsOff: boolean }).commentsOff).toBe(true);
  });

  it("applyCommentsOff sous la casquette active : la carte est mise à jour et le menu se ferme", () => {
    const { set, tB } = world();
    expect(applyCommentsOff(set, server, true, tB as never)).toBe(true);
    expect((set.apply(server) as { commentsOff: boolean }).commentsOff).toBe(true);
  });

  it("ticket d'un compte quitté : rien n'est écrit, et le fil de la casquette active n'est jamais rendu à sa place (point 5)", () => {
    const { set, tA } = world();
    set.setAccount(commentsScope("u2", "s:a"), true);
    expect(ids(set, tA as never)).toEqual([]);
    dropRemoved(set, "p", "k1", tA as never, () => undefined);
    expect(ids(set)).toEqual([]);
  });

  it("C2 (Codex) : A → B → A, écran d'origine démonté, confirmation tardive : calculée depuis le magasin du ticket, rappel d'écran seulement si monté", () => {
    const { set, tA } = world();
    set.setAccount(A, true);
    set.apply(server);
    const shown: FeedPostView[] = [];
    emitPost(
      set,
      tA as never,
      server,
      (p) => ({ ...p, commentsOff: true }),
      (n) => shown.push(n),
      () => false,
    );
    expect(shown).toHaveLength(0);
    expect((set.apply(server) as { commentsOff: boolean }).commentsOff).toBe(true);
    // Une instance encore montée reçoit la carte à jour.
    emitPost(
      set,
      tA as never,
      server,
      (p) => ({ ...p, commentsOff: false }),
      (n) => shown.push(n),
      () => true,
    );
    expect(shown).toHaveLength(1);
    expect((shown[0] as unknown as { commentsOff: boolean }).commentsOff).toBe(false);
  });

  it("menu « ⋯ » : A → B → A, confirmation tardive : commentsOff vrai pour A, et le menu (casquette active) se ferme", () => {
    const { set, tA } = world();
    set.setAccount(A, true);
    expect(applyCommentsOff(set, server, true, tA as never)).toBe(true);
    expect((set.apply(server) as { commentsOff: boolean }).commentsOff).toBe(true);
  });

  it("parentGone : un parent qui n'existe que chez A est retiré chez A, même reçu sous B (jamais cherché dans le fil de B)", () => {
    const { set, tA } = world();
    // « seul » n'existe que dans le fil d'A.
    set.updateSheet("p", (s) => ({ ...s, items: [...s.items, item("seul")] }), tA as never);
    expect(ids(set)).toEqual(["k2", "parent"]);
    expect(parentGone(set, "p", "seul", tA as never, () => undefined)).toBe("done");
    expect(ids(set, tA as never)).toEqual(["k1", "parent"]);
    expect(ids(set)).toEqual(["k2", "parent"]);
  });
});
