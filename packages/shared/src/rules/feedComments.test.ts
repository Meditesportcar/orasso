import { describe, expect, it } from "vitest";

import {
  type CommentFacts,
  type CommentViewer,
  canSeeComment,
  commentExcerpt,
  commentMentions,
  commentParent,
  FEED_COMMENT_MAX,
  FEED_COMMENT_MENTIONS_MAX,
} from "./feedComments";

const base: CommentFacts = { authorId: "a", authorVisibility: "public", authorUnavailable: false, deleted: false };
const viewer = (over: Partial<CommentViewer> = {}): CommentViewer => ({ userId: "v", managesPost: false, ...over });
const none = { followAccepted: false };

describe("canSeeComment", () => {
  it("sert le commentaire d'un compte public à tout lecteur de la publication", () => {
    expect(canSeeComment(viewer(), base, none)).toBe(true);
  });
  it("ne sert jamais un commentaire supprimé ni celui d'un auteur hors règle, même à qui gère la publication", () => {
    expect(canSeeComment(viewer({ managesPost: true }), { ...base, deleted: true }, none)).toBe(false);
    expect(canSeeComment(viewer({ managesPost: true }), { ...base, authorUnavailable: true }, none)).toBe(false);
    expect(canSeeComment(viewer({ userId: "a" }), { ...base, authorUnavailable: true }, none)).toBe(false);
  });
  it("réserve le commentaire d'un compte privé à lui, à ses abonnés acceptés et à qui gère la publication", () => {
    const priv: CommentFacts = { ...base, authorVisibility: "private" };
    expect(canSeeComment(viewer(), priv, none)).toBe(false);
    expect(canSeeComment(viewer(), priv, { followAccepted: true })).toBe(true);
    expect(canSeeComment(viewer({ userId: "a" }), priv, none)).toBe(true);
    expect(canSeeComment(viewer({ managesPost: true }), priv, none)).toBe(true);
  });
});

describe("commentParent", () => {
  const top = { id: "c1", parentId: null, postId: "p", deleted: false };
  it("un commentaire sans parent est de premier niveau", () => {
    expect(commentParent(null, "p")).toEqual({ ok: true, parentId: null });
  });
  it("répondre à un commentaire le prend pour parent", () => {
    expect(commentParent(top, "p")).toEqual({ ok: true, parentId: "c1" });
  });
  it("répondre à une réponse rattache au commentaire de premier niveau", () => {
    expect(commentParent({ ...top, id: "r1", parentId: "c1" }, "p")).toEqual({ ok: true, parentId: "c1" });
  });
  it("refuse un parent inconnu, supprimé ou d'une autre publication", () => {
    expect(commentParent(undefined, "p")).toEqual({ ok: false });
    expect(commentParent({ ...top, deleted: true }, "p")).toEqual({ ok: false });
    expect(commentParent(top, "autre")).toEqual({ ok: false });
  });
});

describe("commentMentions", () => {
  it("lit les pseudos cités, sans doublon ni casse", () => {
    expect(commentMentions("@Kenji_66 oui, devant le plateau JDM")).toEqual(["Kenji_66"]);
    expect(commentMentions("@Lea_11 et @lea_11 et @Marc_66")).toEqual(["Lea_11", "Marc_66"]);
  });
  it("ignore une adresse e-mail, un mot collé et un pseudo trop court ou trop long", () => {
    expect(commentMentions("écris à kenji@orasso.fr")).toEqual([]);
    expect(commentMentions("a@Kenji_66")).toEqual([]);
    expect(commentMentions("@ab")).toEqual([]);
    expect(commentMentions(`@${"a".repeat(25)}`)).toEqual([]);
  });
  it("retire le point final d'une phrase", () => {
    expect(commentMentions("merci @Kenji_66.")).toEqual(["Kenji_66"]);
    expect(commentMentions("merci @Kenji_66, @Lea_11!")).toEqual(["Kenji_66", "Lea_11"]);
  });
  it("garde cinq pseudos au plus", () => {
    const text = Array.from({ length: 8 }, (_, i) => `@Pseudo${i}`).join(" ");
    expect(commentMentions(text)).toHaveLength(FEED_COMMENT_MENTIONS_MAX);
    expect(commentMentions(null)).toEqual([]);
  });
});

describe("commentExcerpt", () => {
  it("garde un texte court tel quel et coupe un long sur un mot", () => {
    expect(commentExcerpt("  On se retrouve\nau port ? ")).toBe("On se retrouve au port ?");
    const long = `${"mot ".repeat(60)}fin`;
    const cut = commentExcerpt(long);
    expect(cut.length).toBeLessThanOrEqual(120);
    expect(cut.endsWith("…")).toBe(true);
  });
  it("la limite d'un commentaire est 300", () => {
    expect(FEED_COMMENT_MAX).toBe(300);
  });
});
