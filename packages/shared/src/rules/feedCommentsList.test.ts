import { describe, expect, it } from "vitest";

import type { FeedPostView } from "../schemas/feed";
import type { FeedCommentView } from "../schemas/feedComments";
import {
  commentCounter,
  commentIssue,
  commentsTitle,
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
  type SheetState,
  sheetAddComment,
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
  it("une réponse : la carte monte, le compteur du parent monte, les deux derniers ne bougent pas", () => {
    const a = at("a", 1, { repliesCount: 1 });
    const r = at("r", 2);
    const p0 = post({ commentsCount: 2, lastComments: [preview(a)] });
    const s = sheetWithTopPage(emptySheet(), [a], null, true);
    const added = sheetAddComment(s, r, "a");
    expect(added.state.items[0]?.repliesCount).toBe(2);
    expect(added.state.replies.a?.open).toBe(true);
    const p = postWithCommentAdded(p0, r, "a", added.counted);
    expect(p.commentsCount).toBe(3);
    expect(p.lastComments).toEqual(p0.lastComments);
  });
  it("le même commentaire rendu deux fois (envoi rejoué) ne compte qu'une fois", () => {
    const a = at("a", 1);
    const s = sheetAddComment(emptySheet(), a, null);
    const again = sheetAddComment(s.state, a, null);
    expect(again.counted).toBe(0);
    expect(again.state.items).toHaveLength(1);
    expect(postWithCommentAdded(post({ commentsCount: 1 }), a, null, again.counted).commentsCount).toBe(1);
    const reply = at("r", 2);
    const r1 = sheetAddComment(sheetAddComment(emptySheet(), at("p", 0), null).state, reply, "p");
    const r2 = sheetAddComment(r1.state, reply, "p");
    expect(r2.counted).toBe(0);
    expect(r2.state.items[0]?.repliesCount).toBe(1);
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
    expect(state.items.find((c) => c.id === "a")?.repliesCount).toBe(1);
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
    const t = store.ticket();
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
  it("404 après une lecture réussie : fil, compteurs, brouillon vidés, feuille fermée, réponse tardive jetée", async () => {
    const { createPostLiveStore } = await import("./feedCommentsList");
    const store = createPostLiveStore();
    store.setAccount("A");
    const server = post({ commentsCount: 1, lastComments: [] });
    store.updateSheet("p", (s) => sheetWithTopPage(s, [at("a", 1)], null, true));
    store.set(server, { ...server, commentsCount: 4 });
    store.open("p", false);
    const t = store.ticket();
    store.markGone("p", t);
    expect(store.sheetOf("p").items).toEqual([]);
    expect(store.apply(server)).toBe(server);
    expect(store.opening()).toBeNull();
    expect(store.isGone("p")).toBe(true);
    store.open("p", false);
    expect(store.isGone("p")).toBe(false);
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
