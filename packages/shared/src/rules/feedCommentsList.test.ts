import { describe, expect, it } from "vitest";

import type { FeedPostView } from "../schemas/feed";
import type { FeedCommentView } from "../schemas/feedComments";
import {
  commentCounter,
  commentIssue,
  commentsTitle,
  createPostLiveStore,
  emptySheet,
  insertMention,
  lastCommentsLine,
  mentionParts,
  mentionQuery,
  mergeComments,
  pendingDrop,
  pendingFail,
  pendingRetry,
  pendingStart,
  postWithCommentAdded,
  postWithCommentRemoved,
  reactionGuess,
  repliesLine,
  repliesMark,
  type SheetState,
  sheetAddComment,
  sheetApplyParentCount,
  sheetCardRead,
  sheetMark,
  sheetRemoveComment,
  sheetReopen,
  sheetSetReaction,
  sheetToggleReplies,
  sheetWithRepliesPage,
  sheetWithTopPage,
} from "./feedCommentsList";

const author = { key: "u:1", pseudo: "Lea_11", avatarUrl: null } as unknown as FeedCommentView["author"];
const at = (id: string, minute: number, over: Partial<FeedCommentView> = {}): FeedCommentView => ({
  id,
  author,
  text: `texte ${id}`,
  createdAt: `2026-11-10T10:${String(minute).padStart(2, "0")}:00.000Z`,
  mentions: [],
  reactionsCount: 0,
  reactedByMe: false,
  repliesCount: 0,
  countedAt: "2026-11-10T09:00:00.000000Z",
  mine: false,
  canDelete: false,
  ...over,
});
const post = (over: Partial<FeedPostView> = {}) =>
  ({ id: "p", commentsCount: 2, commentsOff: false, lastComments: [], ...over }) as unknown as FeedPostView;
const preview = (c: FeedCommentView) => ({ id: c.id, author: c.author, text: c.text, createdAt: c.createdAt });

describe("la feuille : pages et fusion", () => {
  it("garde l'ordre du plus ancien au plus récent et ne double rien quand on relit une page", () => {
    const a = at("a", 1);
    const b = at("b", 2);
    const c = at("c", 3);
    const first = sheetWithTopPage(emptySheet(), [a, b], "cur", true);
    expect(first.items.map((x) => x.id)).toEqual(["a", "b"]);
    expect(first.cursor).toBe("cur");
    const more = sheetWithTopPage(first, [b, c], null, false);
    expect(more.items.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(more.cursor).toBeNull();
    // Un commentaire écrit avant « Voir plus » retombe à sa place quand la page le rend.
    const mine = at("m", 2, { createdAt: "2026-11-10T10:02:30.000Z" });
    const added = sheetAddComment(first, mine, null).state;
    expect(sheetWithTopPage(added, [mine, c], null, false).items.map((x) => x.id)).toEqual(["a", "b", "m", "c"]);
  });
  it("remplace tout à la première page (relecture) et écrase par la version la plus récente", () => {
    const s = sheetWithTopPage(emptySheet(), [at("a", 1)], null, true);
    const again = sheetWithTopPage(s, [at("a", 1, { reactionsCount: 3 })], null, true);
    expect(again.items).toHaveLength(1);
    expect(again.items[0]?.reactionsCount).toBe(3);
    expect(mergeComments([at("a", 1)], [at("a", 1, { text: "nouveau" })])[0]?.text).toBe("nouveau");
  });
  it("replie les réponses par défaut, les déplie et les replie", () => {
    let s = sheetWithTopPage(emptySheet(), [at("a", 1, { repliesCount: 2 })], null, true);
    expect(s.replies.a).toBeUndefined();
    s = sheetWithRepliesPage(s, "a", [at("r1", 2), at("r2", 3)], null, true);
    expect(s.replies.a?.open).toBe(false);
    s = sheetToggleReplies(s, "a");
    expect(s.replies.a?.open).toBe(true);
    s = sheetToggleReplies(s, "a");
    expect(s.replies.a?.open).toBe(false);
    expect(sheetToggleReplies(s, "a", true).replies.a?.open).toBe(true);
  });
});

describe("compteurs à l'ajout", () => {
  it("un commentaire de premier niveau : la carte et les deux derniers montent", () => {
    const a = at("a", 1);
    const b = at("b", 2);
    const c = at("c", 3);
    let p = post({ commentsCount: 2, lastComments: [preview(a), preview(b)] });
    const s = sheetWithTopPage(emptySheet(), [a, b], null, true);
    const added = sheetAddComment(s, c, null);
    expect(added.counted).toBe(1);
    p = postWithCommentAdded(p, c, null, added.counted);
    expect(p.commentsCount).toBe(3);
    expect(p.lastComments.map((x) => x.id)).toEqual(["b", "c"]);
  });
});

describe("compteurs au retrait", () => {
  const top = at("a", 1, { repliesCount: 2 });
  const other = at("b", 2);
  const base = (): SheetState => {
    const s = sheetWithTopPage(emptySheet(), [top, other], null, true);
    return sheetWithRepliesPage(s, "a", [at("r1", 3), at("r2", 4)], null, true);
  };
  it("retirer un commentaire qui a des réponses emporte ses réponses : la carte perd 1 + N", () => {
    const { state, removed } = sheetRemoveComment(base(), "a");
    expect(removed).toBe(3);
    expect(state.items.map((x) => x.id)).toEqual(["b"]);
    expect(state.replies.a).toBeUndefined();
    const p = postWithCommentRemoved(
      post({ commentsCount: 5, lastComments: [preview(top), preview(other)] }),
      "a",
      removed,
      state,
    );
    expect(p.commentsCount).toBe(2);
    expect(p.lastComments.map((x) => x.id)).toEqual(["b"]);
  });
  it("retirer une réponse : la carte perd 1, le parent aussi", () => {
    const { state, removed } = sheetRemoveComment(base(), "r1");
    expect(removed).toBe(1);
    // Le compteur du parent vient du serveur (réponse du DELETE), jamais d'un décrément local.
    expect(state.items.find((c) => c.id === "a")?.repliesCount).toBe(2);
    expect(state.replies.a?.items.map((c) => c.id)).toEqual(["r2"]);
  });
  it("un commentaire inconnu ne change rien, et le total ne passe jamais sous zéro", () => {
    const s = base();
    expect(sheetRemoveComment(s, "zz")).toEqual({ state: s, removed: 0 });
    expect(postWithCommentRemoved(post({ commentsCount: 1 }), "a", 3, null).commentsCount).toBe(0);
    expect(postWithCommentRemoved(post({ commentsCount: 4 }), "zz", 0, null).commentsCount).toBe(4);
  });
  it("relit les deux derniers de la feuille quand elle a lu toute la liste", () => {
    const three = sheetWithTopPage(emptySheet(), [at("a", 1), at("b", 2), at("c", 3)], null, true);
    const { state, removed } = sheetRemoveComment(three, "c");
    const p = postWithCommentRemoved(
      post({ commentsCount: 3, lastComments: [preview(at("b", 2)), preview(at("c", 3))] }),
      "c",
      removed,
      state,
    );
    expect(p.lastComments.map((x) => x.id)).toEqual(["a", "b"]);
    // Liste incomplète (un curseur reste) : on ne devine pas.
    const partial = sheetWithTopPage(emptySheet(), [at("a", 1), at("b", 2)], "more", true);
    const q = postWithCommentRemoved(
      post({ commentsCount: 9, lastComments: [preview(at("b", 2)), preview(at("c", 3))] }),
      "c",
      1,
      partial,
    );
    expect(q.lastComments.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("envois en attente", () => {
  const draft = { clientId: "c1", text: "Salut", parentId: null };
  it("la ligne apparaît grisée, échoue en gardant le texte, se relance avec le même clientId, puis part", () => {
    let s = pendingStart(emptySheet(), draft);
    expect(s.pending).toEqual([{ ...draft, status: "sending", error: null }]);
    s = pendingFail(s, "c1", "Connexion impossible");
    expect(s.pending[0]).toMatchObject({
      status: "failed",
      text: "Salut",
      clientId: "c1",
      error: "Connexion impossible",
    });
    s = pendingRetry(s, "c1");
    expect(s.pending[0]).toMatchObject({ status: "sending", error: null, clientId: "c1" });
    expect(pendingDrop(s, "c1").pending).toEqual([]);
  });
  it("relancer le même clientId ne crée pas une seconde ligne", () => {
    let s = pendingStart(emptySheet(), draft);
    s = pendingFail(s, "c1", "x");
    s = pendingStart(s, draft);
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0]?.status).toBe("sending");
  });
});

describe("la flamme d'un commentaire", () => {
  it("devine puis prend la réponse de l'API, sans jamais passer sous zéro", () => {
    expect(reactionGuess({ reactionsCount: 4, reactedByMe: false }, true)).toEqual({
      reactedByMe: true,
      reactionsCount: 5,
    });
    expect(reactionGuess({ reactionsCount: 0, reactedByMe: true }, false)).toEqual({
      reactedByMe: false,
      reactionsCount: 0,
    });
    expect(reactionGuess({ reactionsCount: 4, reactedByMe: true }, true)).toEqual({
      reactedByMe: true,
      reactionsCount: 4,
    });
    let s = sheetWithTopPage(emptySheet(), [at("a", 1, { repliesCount: 1 })], null, true);
    s = sheetWithRepliesPage(s, "a", [at("r", 2)], null, true);
    expect(sheetSetReaction(s, "r", { reactionsCount: 2, reactedByMe: true }).replies.a?.items[0]?.reactionsCount).toBe(
      2,
    );
    expect(sheetSetReaction(s, "a", { reactionsCount: 7, reactedByMe: true }).items[0]?.reactionsCount).toBe(7);
  });
});

describe("commentIssue et compteur", () => {
  it("refuse le vide et plus de 300 caractères, accepte 300 (texte rogné)", () => {
    expect(commentIssue("")).toBe("empty");
    expect(commentIssue("   \n ")).toBe("empty");
    expect(commentIssue("a".repeat(300))).toBeNull();
    expect(commentIssue("a".repeat(301))).toBe("too_long");
    expect(commentIssue(` ${"a".repeat(300)} `)).toBeNull();
  });
  it("le compteur apparaît à partir de 260 caractères", () => {
    expect(commentCounter("a".repeat(259)).shown).toBe(false);
    expect(commentCounter("a".repeat(260))).toEqual({ shown: true, length: 260, max: 300 });
  });
});

describe("singulier et pluriel", () => {
  it("lastCommentsLine, commentsTitle, repliesLine", () => {
    expect(lastCommentsLine(12)).toBe("Voir les 12 commentaires");
    expect(lastCommentsLine(1)).toBe("Voir le commentaire");
    expect(lastCommentsLine(2)).toBe("Voir les 2 commentaires");
    expect(commentsTitle(12)).toBe("12 commentaires");
    expect(commentsTitle(1)).toBe("1 commentaire");
    expect(commentsTitle(0)).toBe("Commentaires");
    expect(repliesLine(3)).toBe("Voir les 3 réponses");
    expect(repliesLine(1)).toBe("Voir la réponse");
  });
});

describe("mentionQuery", () => {
  it("trouve le mot « @ » en cours : début de texte, après une espace, « @ » seul", () => {
    expect(mentionQuery("@Le", 3)).toEqual({ query: "Le", start: 0, end: 3 });
    expect(mentionQuery("Salut @Kenj", 11)).toEqual({ query: "Kenj", start: 6, end: 11 });
    expect(mentionQuery("Salut @", 7)).toEqual({ query: "", start: 6, end: 7 });
    expect(mentionQuery("(@Lea", 5)?.query).toBe("Lea");
  });
  it("suit le curseur : au milieu du mot, la requête est ce qui précède le curseur", () => {
    expect(mentionQuery("@Kenji_66 oui", 3)).toEqual({ query: "Ke", start: 0, end: 9 });
  });
  it("rend null au milieu d'un mot, pour une adresse e-mail, après une espace, sans « @ »", () => {
    expect(mentionQuery("jean@exemple.fr", 15)).toBeNull();
    expect(mentionQuery("abc@Le", 6)).toBeNull();
    expect(mentionQuery("Salut @Lea ", 11)).toBeNull();
    expect(mentionQuery("Salut", 5)).toBeNull();
    expect(mentionQuery("", 0)).toBeNull();
    expect(mentionQuery(`@${"a".repeat(25)}`, 26)).toBeNull();
  });
});

describe("insertMention", () => {
  it("remplace le mot en cours par @pseudo suivi d'une espace", () => {
    expect(insertMention("@Le", 3, "Lea_11")).toEqual({ text: "@Lea_11 ", caret: 8 });
    expect(insertMention("Salut @Ke ça va", 9, "Kenji_66")).toEqual({ text: "Salut @Kenji_66 ça va", caret: 16 });
  });
  it("emporte le reste du mot après le curseur, et n'ajoute pas une seconde espace", () => {
    expect(insertMention("@Kenji x", 3, "Kenji_66")).toEqual({ text: "@Kenji_66 x", caret: 10 });
  });
  it("ne fait rien sans mot en cours, ni au-delà de 300 caractères", () => {
    expect(insertMention("Salut", 5, "Lea_11")).toBeNull();
    expect(insertMention(`${"a ".repeat(147)}@Le`, 296, "Lea_11_tres_long_pseudo")).toBeNull();
  });
});

describe("mentionParts", () => {
  it("ne rend en lien que les pseudos que l'API a mis dans mentions", () => {
    expect(mentionParts("@Kenji_66 oui, devant le plateau", ["Kenji_66"])).toEqual([
      { text: "@Kenji_66", mention: "Kenji_66" },
      { text: " oui, devant le plateau", mention: null },
    ]);
    expect(mentionParts("@Inconnu_1 salut", ["Kenji_66"])).toEqual([{ text: "@Inconnu_1 salut", mention: null }]);
    expect(mentionParts("@Inconnu_1 salut @Kenji_66", ["Kenji_66"])).toEqual([
      { text: "@Inconnu_1 salut ", mention: null },
      { text: "@Kenji_66", mention: "Kenji_66" },
    ]);
  });
  it("ne lie jamais un pseudo absent de la liste, ni dans une adresse e-mail, ni un point final", () => {
    expect(mentionParts("écris à jean@Kenji_66.fr", ["Kenji_66"])).toEqual([
      { text: "écris à jean@Kenji_66.fr", mention: null },
    ]);
    expect(mentionParts("Merci @Kenji_66.", ["Kenji_66"])).toEqual([
      { text: "Merci ", mention: null },
      { text: "@Kenji_66", mention: "Kenji_66" },
      { text: ".", mention: null },
    ]);
    expect(mentionParts("@Kenji_66", [])).toEqual([{ text: "@Kenji_66", mention: null }]);
  });
  it("lie chaque occurrence, sans tenir compte de la casse", () => {
    const parts = mentionParts("@kenji_66 et @KENJI_66", ["Kenji_66"]);
    expect(parts.filter((p) => p.mention).map((p) => p.text)).toEqual(["@kenji_66", "@KENJI_66"]);
    expect(parts.map((p) => p.text).join("")).toBe("@kenji_66 et @KENJI_66");
  });
});

describe("le magasin de la carte et de sa feuille", () => {
  it("garde ce que l'écran a changé tant que l'API rend la même publication, puis laisse la main à une relecture", async () => {
    const { createPostLiveStore } = await import("./feedCommentsList");
    const store = createPostLiveStore();
    const server = post({ commentsCount: 2, lastComments: [] });
    expect(store.apply(server)).toBe(server);
    store.set(server, { ...server, commentsCount: 3, commentsOff: true });
    expect(store.apply(server)).toMatchObject({ commentsCount: 3, commentsOff: true });
    // Une relecture du Fil qui rend d'autres chiffres l'emporte.
    const fresh = post({ commentsCount: 7 });
    expect(store.apply(fresh)).toBe(fresh);
    expect(store.apply(server)).toBe(server);
  });
  it("une seule feuille ouverte à la fois, et chaque changement prévient les abonnés", async () => {
    const { createPostLiveStore } = await import("./feedCommentsList");
    const store = createPostLiveStore();
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    store.open("p1", true);
    store.open("p2", false);
    expect(store.opening()).toEqual({ postId: "p2", focus: false });
    store.close();
    expect(store.opening()).toBeNull();
    expect(calls).toBe(3);
    off();
    store.open("p1", false);
    expect(calls).toBe(3);
  });
});

describe("caretAfterEdit", () => {
  it("place le curseur à la fin de ce qui vient d'être écrit", async () => {
    const { caretAfterEdit } = await import("./feedCommentsList");
    expect(caretAfterEdit("", "@")).toBe(1);
    expect(caretAfterEdit("@", "@L")).toBe(2);
    expect(caretAfterEdit("Salut ça va", "Salut @ça va")).toBe(7);
    expect(caretAfterEdit("abcd", "abd")).toBe(2);
    expect(caretAfterEdit("abc", "abc")).toBe(3);
    expect(caretAfterEdit("aaa", "aaaa")).toBe(4);
  });
});

describe("magasin : autre compte et feuille unique", () => {
  it("après une déconnexion (clear), le compte suivant ne reprend rien du commentaire de l'autre", async () => {
    const { createPostLiveStore } = await import("./feedCommentsList");
    const store = createPostLiveStore();
    const server = post({ commentsCount: 2, lastComments: [] });
    const a = at("a", 1);
    store.set(server, { ...server, commentsCount: 3, lastComments: [preview(a)] });
    store.open("p", true);
    expect(store.apply(server).commentsCount).toBe(3);
    store.clear();
    expect(store.apply(server)).toBe(server);
    expect(store.opening()).toBeNull();
  });
  it("une publication montée deux fois : seule la première instance porte la feuille", async () => {
    const { createPostLiveStore } = await import("./feedCommentsList");
    const store = createPostLiveStore();
    const stopA = store.register("p", "A");
    const stopB = store.register("p", "B");
    expect(store.host("p")).toBe("A");
    stopA();
    expect(store.host("p")).toBe("B");
    stopB();
    expect(store.host("p")).toBeUndefined();
  });
});

describe("tour 3 : compte, 404, réponses, flamme", () => {
  it("un autre compte ne reprend rien du fil, des compteurs ni du brouillon du précédent, et une réponse tardive est jetée", async () => {
    const { createPostLiveStore } = await import("./feedCommentsList");
    const store = createPostLiveStore();
    store.setAccount("A");
    const server = post({ commentsCount: 2, lastComments: [] });
    const t = store.ticket("p");
    // A ajoute un commentaire privé puis en supprime un ancien : même total (2) mais un fil et des deux derniers différents.
    store.set(server, { ...server, commentsCount: 2, lastComments: [preview(at("mine", 5))] }, t);
    store.updateSheet("p", (s) => sheetAddComment(s, at("mine", 5), null).state, t);
    store.setDraft("p", { text: "brouillon de A", replyTo: null });
    store.setAccount(null);
    store.setAccount("B");
    expect(store.apply(server)).toBe(server);
    expect(store.sheetOf("p").items).toEqual([]);
    expect(store.draftOf("p").text).toBe("");
    // A avait envoyé juste avant de se déconnecter : la réponse arrive chez B, avec l'ancien ticket.
    store.updateSheet("p", (s) => sheetAddComment(s, at("late", 6), null).state, t);
    store.set(server, { ...server, commentsCount: 9 }, t);
    expect(store.sheetOf("p").items).toEqual([]);
    expect(store.apply(server)).toBe(server);
    expect(store.alive(t)).toBe(false);
  });
  it("le fil, le brouillon et un envoi en échec survivent au démontage des cartes (même compte) avec le même clientId", async () => {
    const { createPostLiveStore } = await import("./feedCommentsList");
    const store = createPostLiveStore();
    store.setAccount("A");
    store.updateSheet("p", (s) =>
      pendingFail(pendingStart(s, { clientId: "c9", text: "Salut", parentId: null }), "c9", "réseau"),
    );
    store.setDraft("p", { text: "suite", replyTo: { id: "x", pseudo: "Lea_11" } });
    // La carte est démontée puis remontée : rien n'est perdu.
    expect(store.sheetOf("p").pending).toMatchObject([{ clientId: "c9", status: "failed", text: "Salut" }]);
    expect(store.draftOf("p")).toEqual({ text: "suite", replyTo: { id: "x", pseudo: "Lea_11" } });
    store.updateSheet("p", (s) => pendingRetry(s, "c9"));
    expect(store.sheetOf("p").pending[0]).toMatchObject({ clientId: "c9", status: "sending" });
  });
  it("404 après une lecture réussie : fil, compteurs, brouillon vidés, feuille fermée ; une réponse partie avant est réellement jetée", async () => {
    const { createPostLiveStore } = await import("./feedCommentsList");
    const store = createPostLiveStore();
    store.setAccount("A");
    const server = post({ commentsCount: 1, lastComments: [] });
    store.updateSheet("p", (s) => sheetWithTopPage(s, [at("a", 1)], "cur", true));
    store.set(server, { ...server, commentsCount: 4 });
    store.open("p", false);
    // « Voir plus » et une flamme partent avant le 404 : leurs tickets sont pris à ce moment.
    const more = store.followRead("p", "top");
    const flame = store.ticket("p");
    store.markGone("p", store.ticket("p"));
    expect(store.sheetOf("p").items).toEqual([]);
    expect(store.apply(server)).toBe(server);
    expect(store.opening()).toBeNull();
    expect(store.isGone("p")).toBe(true);
    // Les réponses tardives arrivent après le 404 : rien ne recrée le fil ni les compteurs.
    store.updateSheet("p", (s) => sheetWithTopPage(s, [at("late", 9)], null, false), more);
    store.updateSheet("p", (s) => sheetSetReaction(s, "a", { reactionsCount: 5, reactedByMe: true }), flame);
    store.set(server, { ...server, commentsCount: 9 }, flame);
    expect(store.sheetOf("p").items).toEqual([]);
    expect(store.apply(server)).toBe(server);
    expect(store.fresh(more)).toBe(false);
    // Rouvrir ne dit pas « lisible » : seule une lecture réussie le fait, et pas une lecture partie avant le 404.
    store.open("p", false);
    expect(store.isGone("p")).toBe(true);
    store.clearGone(more);
    expect(store.isGone("p")).toBe(true);
    const reread = store.beginRead("p", "top");
    store.clearGone(reread);
    expect(store.isGone("p")).toBe(false);
    store.updateSheet("p", (s) => sheetWithTopPage(s, [at("a", 1)], null, true), reread);
    expect(store.sheetOf("p").items).toHaveLength(1);
  });
  it("deux instances successives : les réponses arrivent dans l'ordre inverse, seule la dernière lecture écrit", async () => {
    const { createPostLiveStore } = await import("./feedCommentsList");
    const store = createPostLiveStore();
    store.setAccount("A");
    const old = store.beginRead("p", "r:a"); // ancienne instance (avant le changement de filtre)
    const fresh = store.beginRead("p", "r:a"); // nouvelle instance
    store.updateSheet("p", (s) => sheetWithRepliesPage(s, "a", [at("r1", 2)], null, true), fresh);
    expect(store.fresh(fresh)).toBe(true);
    // La réponse de l'ancienne arrive en dernier : jetée avant d'écrire (elle réintroduirait une réponse supprimée).
    expect(store.fresh(old)).toBe(false);
    // Un autre fil n'est pas touché.
    expect(store.fresh(store.beginRead("p", "top"))).toBe(true);
    expect(store.fresh(fresh)).toBe(true);
    // La suite d'une lecture (page suivante) reste valable tant qu'aucune autre lecture du fil n'est partie.
    const next = store.followRead("p", "r:a");
    expect(store.fresh(next)).toBe(true);
    store.beginRead("p", "r:a");
    expect(store.fresh(next)).toBe(false);
  });
  it("la réouverture revalide les réponses : une réponse supprimée entre deux ouvertures disparaît", () => {
    let s = sheetWithTopPage(emptySheet(), [at("a", 1, { repliesCount: 2 })], null, true);
    s = sheetWithRepliesPage(s, "a", [at("r1", 2), at("r2", 3)], null, true);
    s = sheetToggleReplies(s, "a", true);
    s = sheetReopen(s);
    expect(s.replies.a?.loaded).toBe(false);
    expect(s.replies.a?.open).toBe(true);
    s = sheetWithRepliesPage(s, "a", [at("r1", 2)], null, true);
    expect(s.replies.a?.items.map((c) => c.id)).toEqual(["r1"]);
  });
  it("répondre à un commentaire qui a des réponses non chargées : la page qui arrive ne l'efface pas, même arrivée tard", () => {
    let s = sheetWithTopPage(emptySheet(), [at("a", 1, { repliesCount: 25 })], null, true);
    s = sheetAddComment(s, at("mine", 50), "a").state;
    // La première page (20 réponses plus anciennes) arrive après l'envoi.
    const page = Array.from({ length: 20 }, (_, i) => at(`r${i}`, 10 + (i % 30)));
    s = sheetWithRepliesPage(s, "a", page, "cur", true);
    expect(s.replies.a?.items.some((c) => c.id === "mine")).toBe(true);
    expect(s.replies.a?.items).toHaveLength(21);
    // Une première page de premier niveau tardive garde aussi le commentaire envoyé.
    let t = sheetAddComment(emptySheet(), at("m2", 55), null).state;
    t = sheetWithTopPage(t, [at("x", 1), at("y", 2)], "c", true);
    expect(t.items.map((c) => c.id)).toEqual(["x", "y", "m2"]);
  });
  it("flamme : des touchers rapides ne partent pas en parallèle, seule la dernière intention compte", async () => {
    const { createFlameGate } = await import("./feedCommentsList");
    const gate = createFlameGate();
    const sent: boolean[] = [];
    const resolvers: ((v: { reactionsCount: number; reactedByMe: boolean }) => void)[] = [];
    let current = { reactionsCount: 3, reactedByMe: false };
    const io = {
      send: (on: boolean) => {
        sent.push(on);
        return new Promise<{ reactionsCount: number; reactedByMe: boolean }>((r) => resolvers.push(r));
      },
      apply: (v: { reactionsCount: number; reactedByMe: boolean }) => {
        current = v;
      },
    };
    // Flamme, retirée, remise : un seul envoi part, la dernière intention (flamme) est déjà celle de l'API.
    const done = gate.fire("c", current, io);
    void gate.fire("c", current, io);
    void gate.fire("c", current, io);
    expect(sent).toEqual([true]);
    resolvers[0]?.({ reactionsCount: 4, reactedByMe: true });
    await done;
    expect(sent).toEqual([true]);
    expect(current).toEqual({ reactionsCount: 4, reactedByMe: true });
    // Retirée puis remise avant la réponse : le second envoi attend le premier, seul le dernier résultat s'affiche.
    const second = gate.fire("c", current, io);
    void gate.fire("c", current, io);
    expect(sent).toEqual([true, false]);
    resolvers[1]?.({ reactionsCount: 3, reactedByMe: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toEqual([true, false, true]);
    resolvers[2]?.({ reactionsCount: 4, reactedByMe: true });
    await second;
    expect(current).toEqual({ reactionsCount: 4, reactedByMe: true });
  });
  it("flamme : si le compte change pendant la série, aucun envoi ne part sous la session suivante", async () => {
    const { createFlameGate } = await import("./feedCommentsList");
    const gate = createFlameGate();
    const sent: boolean[] = [];
    let resolve: ((v: { reactionsCount: number; reactedByMe: boolean }) => void) | undefined;
    let alive = true;
    const applied: unknown[] = [];
    const io = {
      send: (on: boolean) => {
        sent.push(on);
        return new Promise<{ reactionsCount: number; reactedByMe: boolean }>((r) => {
          resolve = r;
        });
      },
      apply: (v: unknown) => {
        applied.push(v);
      },
      alive: () => alive,
    };
    const base = { reactionsCount: 3, reactedByMe: false };
    const done = gate.fire("c", base, io); // A met une flamme
    void gate.fire("c", base, io); // puis la retire : une seconde mutation attend
    const appliedBefore = applied.length;
    alive = false; // B se connecte avant la réponse de la première
    resolve?.({ reactionsCount: 4, reactedByMe: true });
    await done;
    expect(sent).toEqual([true]);
    expect(applied.length).toBe(appliedBefore);
  });
  it("flamme : une panne remet l'état connu de l'API, pas une annulation périmée", async () => {
    const { createFlameGate } = await import("./feedCommentsList");
    const gate = createFlameGate();
    let current = { reactionsCount: 3, reactedByMe: false };
    await gate.fire("c", current, {
      send: () => Promise.reject(new Error("panne")),
      apply: (v) => {
        current = v;
      },
    });
    expect(current).toEqual({ reactionsCount: 3, reactedByMe: false });
  });
});

describe("tour 5 : files par compte, pages tardives", () => {
  it("flamme : B touche pendant la requête de A, sa file est la sienne (clé par génération de compte)", async () => {
    const { createFlameGate } = await import("./feedCommentsList");
    const gate = createFlameGate();
    const sent: string[] = [];
    const resolvers: (() => void)[] = [];
    const make = (who: string) => ({
      send: (on: boolean) => {
        sent.push(`${who}:${on}`);
        return new Promise<{ reactionsCount: number; reactedByMe: boolean }>((r) => {
          resolvers.push(() => r({ reactionsCount: 1, reactedByMe: on }));
        });
      },
      apply: () => undefined,
    });
    const base = { reactionsCount: 0, reactedByMe: false };
    void gate.fire("1|0|p|c", base, make("A"));
    void gate.fire("2|0|p|c", base, make("B"));
    expect(sent).toEqual(["A:true", "B:true"]);
    for (const r of resolvers) r();
  });
  it("mon commentaire supprimé par l'auteur de la publication ne reste pas : seuls les ajouts postérieurs au départ survivent", () => {
    let s = sheetWithTopPage(emptySheet(), [at("x", 1)], null, true);
    s = sheetAddComment(s, at("old", 5), null).state;
    const mark = sheetMark(s); // la lecture part après l'envoi de « old »
    s = sheetAddComment(s, at("new", 9), null).state;
    s = sheetWithTopPage(s, [at("x", 1)], null, true, mark); // « old » absent : supprimé entre-temps
    expect(s.items.map((c) => c.id)).toEqual(["x", "new"]);
    expect(s.recent).toEqual(["new"]);
  });
});

describe("tour 6 : pages partielles et compteurs", () => {
  it("envoyer dans une discussion de plus de 20 réponses : la première page, partielle, ne retire pas l'ajout", () => {
    let s = sheetWithTopPage(emptySheet(), [at("p", 1, { repliesCount: 25 })], null, true);
    s = sheetAddComment(s, at("mine", 59), "p").state; // la réponse est confirmée, la lecture part ensuite
    const mark = repliesMark(s, "p");
    expect(mark.recent).toEqual(["mine"]);
    const page = Array.from({ length: 20 }, (_, i) => at(`r${i}`, 10 + i)); // les 20 plus anciennes
    s = sheetWithRepliesPage(s, "p", page, "cur", true, mark);
    expect(s.replies.p?.items.some((c) => c.id === "mine")).toBe(true);
    expect(s.replies.p?.items).toHaveLength(21);
    // Une page complète qui ne le contient pas prouve, elle, qu'il a été supprimé.
    s = sheetWithRepliesPage(s, "p", page, null, true, { recent: ["mine"] });
    expect(s.replies.p?.items.some((c) => c.id === "mine")).toBe(false);
  });
});

const T = (n: number) => `2026-11-10T11:00:00.${String(n).padStart(6, "0")}Z`;

describe("tour 7 : le serveur fait foi, avec sa version", () => {
  const parentCount = (id: string, repliesCount: number, n: number) => ({ id, repliesCount, countedAt: T(n) });
  it("une réponse confirmée : le compteur du parent est celui du serveur, la carte monte, les deux derniers ne bougent pas", () => {
    const a = at("a", 1, { repliesCount: 1, countedAt: T(1) });
    const r = at("r", 2);
    const p0 = post({ commentsCount: 2, lastComments: [preview(a)] });
    const s = sheetWithTopPage(emptySheet(), [a], null, true);
    const added = sheetAddComment(s, r, "a", parentCount("a", 2, 5));
    expect(added.state.items[0]).toMatchObject({ repliesCount: 2, countedAt: T(5) });
    expect(added.state.replies.a?.open).toBe(true);
    const p = postWithCommentAdded(p0, r, "a", added.counted);
    expect(p.commentsCount).toBe(3);
    expect(p.lastComments).toEqual(p0.lastComments);
  });
  it("le même envoi rendu deux fois ne compte qu'une fois (carte et compteur)", () => {
    let s = sheetWithTopPage(emptySheet(), [at("p", 1)], null, true);
    const first = sheetAddComment(s, at("r", 5), "p", parentCount("p", 1, 5));
    s = first.state;
    const again = sheetAddComment(s, at("r", 5), "p", parentCount("p", 1, 6));
    expect(first.counted).toBe(1);
    expect(again.counted).toBe(0);
    expect(again.state.items[0]?.repliesCount).toBe(1);
  });
  it("lecture avant la confirmation (valeur ancienne) ou après (déjà comptée), dans les deux ordres d'arrivée : jamais zéro, jamais deux", () => {
    const base = () => sheetWithTopPage(emptySheet(), [at("p", 1, { repliesCount: 0, countedAt: T(0) })], null, true);
    // Ma réponse est enregistrée à T(5) ; le POST rend le parent à 1.
    const confirmed = (s: SheetState) => sheetAddComment(s, at("r", 5), "p", parentCount("p", 1, 6)).state;
    // GET lu avant (0 à T(2)) : arrivé après la confirmation, il est plus ancien : ignoré.
    let s = sheetWithTopPage(confirmed(base()), [at("p", 1, { repliesCount: 0, countedAt: T(2) })], null, true);
    expect(s.items[0]?.repliesCount).toBe(1);
    // GET lu après (1 à T(8)) arrivé avant la confirmation : la confirmation (T(6), plus ancienne) ne le remplace pas ; pas de 2.
    s = sheetWithTopPage(base(), [at("p", 1, { repliesCount: 1, countedAt: T(8) })], null, true);
    s = confirmed(s);
    expect(s.items[0]?.repliesCount).toBe(1);
    // Une réponse d'un autre pendant mon POST : le GET (1 à T(3)) puis ma confirmation (2 à T(6)) : 2, et dans l'ordre inverse aussi.
    s = sheetWithTopPage(base(), [at("p", 1, { repliesCount: 1, countedAt: T(3) })], null, true);
    s = sheetAddComment(s, at("r", 5), "p", parentCount("p", 2, 6)).state;
    expect(s.items[0]?.repliesCount).toBe(2);
    s = sheetAddComment(base(), at("r", 5), "p", parentCount("p", 2, 6)).state;
    s = sheetWithTopPage(s, [at("p", 1, { repliesCount: 1, countedAt: T(3) })], null, true);
    expect(s.items[0]?.repliesCount).toBe(2);
  });
  it("page suivante tardive contenant une ancienne version du parent : le compteur ne revient pas en arrière", () => {
    let s = sheetWithTopPage(emptySheet(), [at("a", 1)], "c", true);
    s = sheetWithTopPage(s, [at("p", 2, { repliesCount: 0, countedAt: T(1) })], null, false);
    const mark = sheetMark(s);
    s = sheetAddComment(s, at("r", 9), "p", parentCount("p", 1, 5)).state;
    s = sheetWithTopPage(s, [at("p", 2, { repliesCount: 0, countedAt: T(2) })], null, false, mark);
    expect(s.items.find((c) => c.id === "p")?.repliesCount).toBe(1);
  });
  it("réponse réseau perdue : le rejeu du même envoi rend le compteur du serveur, une seule réponse", () => {
    let s = sheetWithTopPage(emptySheet(), [at("p", 1)], null, true);
    // Le premier essai a été enregistré mais sa réponse perdue ; un GET le voit (1) ; le rejeu rend le même commentaire.
    s = sheetWithTopPage(s, [at("p", 1, { repliesCount: 1, countedAt: T(4) })], null, true);
    const replay = sheetAddComment(s, at("r", 5), "p", parentCount("p", 1, 7));
    expect(replay.state.items[0]?.repliesCount).toBe(1);
    expect(replay.counted).toBe(1); // jamais vue dans la liste des réponses : une fois pour la carte
    const again = sheetAddComment(replay.state, at("r", 5), "p", parentCount("p", 1, 8));
    expect(again.counted).toBe(0);
  });
  it("supprimer le parent retire le bon nombre : 1 + le compteur du serveur", () => {
    let s = sheetWithTopPage(emptySheet(), [at("p", 1)], null, true);
    s = sheetAddComment(s, at("r", 5), "p", parentCount("p", 2, 6)).state;
    const { removed } = sheetRemoveComment(s, "p");
    expect(removed).toBe(3);
  });
  it("un commentaire supprimé ne revient pas d'une lecture partie avant sa suppression (deux ordres)", () => {
    // Ordre 1 : la page, partie avant la suppression, arrive après.
    let s = sheetWithTopPage(emptySheet(), [at("a", 1), at("b", 2)], null, true);
    s = sheetRemoveComment(s, "b").state;
    s = sheetWithTopPage(s, [at("a", 1), at("b", 2)], null, true);
    expect(s.items.map((c) => c.id)).toEqual(["a"]);
    // Ordre 2 : la page arrive avant, puis la suppression.
    s = sheetWithTopPage(emptySheet(), [at("a", 1), at("b", 2)], null, true);
    s = sheetRemoveComment(s, "b").state;
    expect(s.items.map((c) => c.id)).toEqual(["a"]);
    // Pareil pour une réponse.
    let t = sheetWithTopPage(emptySheet(), [at("p", 1, { repliesCount: 1 })], null, true);
    t = sheetWithRepliesPage(t, "p", [at("r", 2)], null, true);
    t = sheetRemoveComment(t, "r").state;
    t = sheetWithRepliesPage(t, "p", [at("r", 2)], null, true);
    expect(t.replies.p?.items).toEqual([]);
  });
  it("première page partielle → suppression distante → dernière page : l'ajout supprimé ne reste pas", () => {
    let s = sheetWithTopPage(emptySheet(), [at("p", 1, { repliesCount: 25 })], null, true);
    s = sheetAddComment(s, at("mine", 59), "p", parentCount("p", 26, 5)).state;
    const first = Array.from({ length: 20 }, (_, i) => at(`r${i}`, 10 + i));
    s = sheetWithRepliesPage(s, "p", first, "cur", true, { recent: ["mine"] });
    expect(s.replies.p?.items.some((c) => c.id === "mine")).toBe(true); // hors de la portion couverte : conservé
    // L'auteur de la publication le supprime ; la dernière page (complète) ne le contient plus.
    const last = Array.from({ length: 5 }, (_, i) => at(`s${i}`, 30 + i));
    s = sheetWithRepliesPage(s, "p", last, null, false, { recent: ["mine"], boundary: first[19] });
    expect(s.replies.p?.items.some((c) => c.id === "mine")).toBe(false);
    expect(s.replies.p?.recent).toEqual([]);
  });
});

describe("tour 8 : suppression d'une réponse, confirmation tardive, curseur", () => {
  const parentCount = (id: string, repliesCount: number, n: number) => ({ id, repliesCount, countedAt: T(n) });
  const base = () => {
    let s = sheetWithTopPage(emptySheet(), [at("p", 1, { repliesCount: 1, countedAt: T(0) })], null, true);
    s = sheetWithRepliesPage(s, "p", [at("r1", 2)], null, true);
    return s;
  };
  it("supprimer R1 pendant que R2 est en route : la confirmation de R2 (1 à t1) puis celle du DELETE (1 à t2) donnent 1, dans les deux ordres", () => {
    const afterDelete = (s: SheetState) =>
      sheetApplyParentCount(sheetRemoveComment(s, "r1").state, parentCount("p", 1, 6));
    const afterPost = (s: SheetState) => sheetAddComment(s, at("r2", 5), "p", parentCount("p", 2, 3)).state; // lu avant la suppression : 2
    // POST confirmé (2 à t3), puis DELETE (1 à t6) : le plus récent gagne.
    let s = afterDelete(afterPost(base()));
    expect(s.items[0]?.repliesCount).toBe(1);
    // Ordre inverse : le DELETE (1 à t6) arrive d'abord, puis la confirmation tardive du POST (2 à t3, plus ancienne) : ignorée.
    s = afterPost(afterDelete(base()));
    expect(s.items[0]?.repliesCount).toBe(1);
    // Un GET parti après la suppression pose 1, puis la confirmation du DELETE (même valeur) : jamais 0.
    s = sheetWithTopPage(
      sheetRemoveComment(base(), "r1").state,
      [at("p", 1, { repliesCount: 1, countedAt: T(7) })],
      null,
      true,
    );
    s = sheetApplyParentCount(s, parentCount("p", 1, 6));
    expect(s.items[0]?.repliesCount).toBe(1);
  });
  it("une confirmation tardive ne ressuscite pas un commentaire supprimé, la carte ne remonte pas", () => {
    let s = sheetWithTopPage(emptySheet(), [at("x", 1)], null, true);
    s = sheetWithTopPage(s, [at("x", 1), at("mine", 5)], null, true); // un GET me montre mon commentaire avant la confirmation
    s = sheetRemoveComment(s, "mine").state; // je le supprime
    const late = sheetAddComment(s, at("mine", 5), null); // la confirmation du POST arrive
    expect(late.state.items.map((c) => c.id)).toEqual(["x"]);
    expect(late.counted).toBe(0);
    // Une réponse dont le parent a été supprimé entre-temps.
    let t = sheetWithTopPage(emptySheet(), [at("p", 1, { repliesCount: 1 })], null, true);
    t = sheetRemoveComment(t, "p").state;
    const reply = sheetAddComment(t, at("r", 9), "p", parentCount("p", 2, 4));
    expect(reply.counted).toBe(0);
    expect(reply.state.replies.p).toBeUndefined();
  });
  it("dernière page vide après une suppression distante : l'ajout situé après le curseur s'en va", () => {
    let s = sheetWithTopPage(emptySheet(), [at("p", 1)], "c", true);
    const first = Array.from({ length: 3 }, (_, i) => at(`a${i}`, 10 + i));
    s = sheetWithTopPage(s, first, "c", true);
    s = sheetAddComment(s, at("mine", 40), null).state;
    const mark = sheetMark(s); // la lecture suivante part ; l'auteur de la publication supprime « mine » ensuite
    expect(mark.boundary?.id).toBe("a2");
    s = sheetWithTopPage(s, [], null, false, { recent: ["mine"], boundary: mark.boundary });
    expect(s.items.some((c) => c.id === "mine")).toBe(false);
  });
  it("suppression distante d'un élément placé avant le premier élément reçu : la page suivante le retire", () => {
    let s = sheetWithTopPage(emptySheet(), [at("a", 1), at("b", 2)], "c", true);
    s = sheetWithTopPage(s, [at("a", 1), at("b", 2), at("z", 3)], "c", true); // « z » venu du serveur (pas un ajout)
    const mark = sheetMark(s);
    expect(mark.boundary?.id).toBe("z");
    // « z » est supprimé ailleurs ; la page suivante commence à « d » (après le curseur) : z est avant elle, la borne le couvre.
    s = sheetWithTopPage(s, [at("d", 4)], null, false, { recent: [], boundary: at("y", 2) });
    expect(s.items.map((c) => c.id)).toEqual(["a", "b", "d"]);
  });
});

describe("petit lot API : compteur de la carte (P29)", () => {
  const stamp = (i: number) => new Date(Date.UTC(2026, 10, 10, 10, 0, i)).toISOString();
  const c = (i: number, over: Partial<FeedCommentView> = {}) =>
    at(`c${String(i).padStart(2, "0")}`, 0, { createdAt: stamp(i), ...over });

  it("un commentaire déjà venu d'une lecture, confirmé ensuite, puis supprimé : la carte reste à N", () => {
    const card = post({ commentsCount: 3, lastComments: [] });
    // La lecture apporte le commentaire c03 avant la confirmation de l'envoi : la carte (3) ne l'a pas compté.
    let s = sheetWithTopPage(emptySheet(), [c(1), c(2), c(3)], null, true);
    const added = sheetAddComment(s, c(3), null);
    expect(added.counted).toBe(0);
    s = added.state;
    const gone = sheetRemoveComment(s, "c03");
    expect(gone.removed).toBe(0);
    expect(
      postWithCommentRemoved(postWithCommentAdded(card, c(3), null, added.counted), "c03", gone.removed, gone.state)
        .commentsCount,
    ).toBe(3);
    // Rejouée : la confirmation n'est pas comptée deux fois, et la marque disparaît avec le commentaire.
    expect(gone.state.uncounted ?? []).toEqual([]);
  });

  it("un commentaire confirmé par l'envoi (compté) puis supprimé : la carte revient à N", () => {
    const card = post({ commentsCount: 2, lastComments: [] });
    let s = sheetWithTopPage(emptySheet(), [c(1), c(2)], null, true);
    const added = sheetAddComment(s, c(3), null);
    expect(added.counted).toBe(1);
    s = added.state;
    // Un rejeu de la confirmation (déjà confirmée par l'envoi) ne devient pas « non compté ».
    const replay = sheetAddComment(s, c(3), null);
    expect(replay.counted).toBe(0);
    s = replay.state;
    const withCard = postWithCommentAdded(card, c(3), null, added.counted);
    const gone = sheetRemoveComment(s, "c03");
    expect(gone.removed).toBe(1);
    expect(postWithCommentRemoved(withCard, "c03", gone.removed, gone.state).commentsCount).toBe(2);
  });

  it("confirmation tardive d'un commentaire déjà supprimé, puis suppression : rien n'est retiré deux fois", () => {
    let s = sheetWithTopPage(emptySheet(), [c(1), c(2)], null, true);
    const first = sheetRemoveComment(s, "c02");
    expect(first.removed).toBe(1);
    s = first.state;
    const late = sheetAddComment(s, c(2), null);
    expect(late.counted).toBe(0);
    expect(sheetRemoveComment(late.state, "c02")).toEqual({ state: late.state, removed: 0 });
  });

  it("une réponse venue d'une lecture puis confirmée : sa suppression ne baisse pas la carte ; son parent retiré ne retire que les réponses comptées", () => {
    let s = sheetWithTopPage(emptySheet(), [c(1, { repliesCount: 2 })], null, true);
    s = sheetWithRepliesPage(s, "c01", [c(2), c(3)], null, true);
    // r c02 arrive de la lecture puis sa confirmation (non comptée par la carte) ; c03 reste comptée.
    const added = sheetAddComment(s, c(2), "c01");
    expect(added.counted).toBe(0);
    s = added.state;
    expect(s.uncounted).toEqual(["c02"]);
    const parent = sheetRemoveComment(s, "c01");
    // Le parent (1) et sa réponse comptée c03 ; la réponse non comptée c02 ne baisse rien.
    expect(parent.removed).toBe(2);
    // Même suppression d'abord de la réponse : 0, puis du parent : 1 + 1 réponse restante comptée.
    const reply = sheetRemoveComment(s, "c02");
    expect(reply.removed).toBe(0);
    expect(reply.state.uncounted ?? []).toEqual([]);
  });

  it("une carte dont le dernier aperçu part avec un commentaire non compté, sans baisser le total", () => {
    const only = c(1);
    const card = post({ commentsCount: 4, lastComments: [preview(only)] });
    const s = sheetWithTopPage(emptySheet(), [only], null, true);
    const added = sheetAddComment(s, only, null);
    const gone = sheetRemoveComment(added.state, "c01");
    const p = postWithCommentRemoved(card, "c01", gone.removed, gone.state);
    expect(p.commentsCount).toBe(4);
    expect(p.lastComments).toEqual([]);
  });
});

describe("petit lot API, tour 2 : la carte relue inclut tout", () => {
  const c = (i: number) => at(`c${i}`, i);
  it("réponse perdue, carte relue (elle compte le commentaire), réessai confirmé, puis suppression : la carte baisse de 1", () => {
    // La feuille a lu le commentaire (une page), la carte est relue ensuite, puis le réessai se confirme.
    let s = sheetWithTopPage(emptySheet(), [c(1), c(2)], null, true);
    s = sheetCardRead(s);
    const retry = sheetAddComment(s, c(2), null);
    expect(retry.counted).toBe(0);
    expect(retry.state.uncounted ?? []).toEqual([]);
    const gone = sheetRemoveComment(retry.state, "c2");
    expect(gone.removed).toBe(1);
    expect(postWithCommentRemoved(post({ commentsCount: 2 }), "c2", gone.removed, gone.state).commentsCount).toBe(1);
  });
  it("le magasin remet à zéro la feuille quand la carte reçue de l'API change (relue)", () => {
    const store = createPostLiveStore();
    const card = (n: number) => post({ commentsCount: n });
    store.apply(card(1));
    store.updateSheet("p", (s) => sheetWithTopPage(s, [c(1), c(2)], null, true));
    store.updateSheet("p", (s) => sheetAddComment(s, c(2), null).state);
    expect(store.sheetOf("p").uncounted).toEqual(["c2"]);
    // Même carte : rien ne bouge. Carte relue : plus rien de « non compté ».
    store.apply(card(1));
    expect(store.sheetOf("p").uncounted).toEqual(["c2"]);
    store.apply(card(2));
    expect(store.sheetOf("p").uncounted).toEqual([]);
  });
});

describe("petit lot API : borne gardée avec son curseur (P36)", () => {
  const stamp = (i: number) => new Date(Date.UTC(2026, 10, 10, 10, 0, i)).toISOString();
  const c = (i: number) => at(`c${String(i).padStart(2, "0")}`, 0, { createdAt: stamp(i) });
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => c(from + k));
  const ids = (s: SheetState) => s.items.map((x) => x.id);

  it("deux chargements partis du même curseur : la seconde page, périmée, est jetée sans effet", () => {
    let s = sheetWithTopPage(emptySheet(), range(1, 20), "C20", true);
    // Deux chargements partent du commentaire 20 : leurs marques portent le même curseur.
    const m1 = sheetMark(s);
    const m2 = sheetMark(s);
    expect(m1.cursor).toBe("C20");
    s = sheetWithTopPage(s, range(21, 60), "C60", false, m1);
    expect(s.cursor).toBe("C60");
    const stale = sheetWithTopPage(s, range(21, 40), "C40", false, m2);
    // Le curseur ne recule pas, la liste et la borne restent celles de la page plus longue.
    expect(stale).toBe(s);
    expect(stale.cursor).toBe("C60");
    expect(sheetMark(stale).boundary?.id).toBe("c60");
    // Le chargement suivant part du bon curseur : une page vide en fin de liste est appliquée.
    const m3 = sheetMark(stale);
    expect(m3.cursor).toBe("C60");
    const end = sheetWithTopPage(stale, [], null, false, m3);
    expect(end.cursor).toBeNull();
    expect(ids(end)).toEqual(ids(s));
  });

  it("des chargements l'un après l'autre (chacun avec sa marque) s'appliquent tous ; une marque sans curseur ne contrôle rien", () => {
    let s = sheetWithTopPage(emptySheet(), range(1, 20), "C20", true);
    s = sheetWithTopPage(s, range(21, 40), "C40", false, sheetMark(s));
    s = sheetWithTopPage(s, range(41, 60), null, false, sheetMark(s));
    expect(ids(s)).toEqual(range(1, 60).map((x) => x.id));
    // Compatible : une marque faite à la main, sans curseur, s'applique comme avant.
    const old = sheetWithTopPage(s, range(41, 50), "C50", false, { recent: [], boundary: c(40) });
    expect(old.cursor).toBe("C50");
  });

  it("une page de la première lecture (sans curseur envoyé) s'applique même si le curseur de la feuille a changé", () => {
    let s = sheetWithTopPage(emptySheet(), range(1, 20), "C20", true);
    const reload = sheetMark(s);
    s = sheetWithTopPage(s, range(21, 40), "C40", false, sheetMark(s));
    const again = sheetWithTopPage(s, range(1, 20), "C20", true, reload);
    expect(again.cursor).toBe("C20");
  });

  it("réponses : la page périmée d'un fil est jetée aussi", () => {
    let s = sheetWithTopPage(emptySheet(), [c(1)], null, true);
    s = sheetWithRepliesPage(s, "c01", range(10, 29), "R29", true);
    const m1 = repliesMark(s, "c01");
    const m2 = repliesMark(s, "c01");
    expect(m1.cursor).toBe("R29");
    s = sheetWithRepliesPage(s, "c01", range(30, 49), "R49", false, m1);
    const stale = sheetWithRepliesPage(s, "c01", range(30, 39), "R39", false, m2);
    expect(stale).toBe(s);
    expect(stale.replies.c01?.cursor).toBe("R49");
    const end = sheetWithRepliesPage(stale, "c01", [], null, false, repliesMark(stale, "c01"));
    expect(end.replies.c01?.cursor).toBeNull();
    expect(end.replies.c01?.items.length).toBe(40);
  });
});
