import { describe, expect, it } from "vitest";

import {
  authorFichePath,
  canHideFrom,
  eventTargetKey,
  journalBadges,
  journalSection,
  latestNotice,
  mentionsPhase,
  pinGesture,
  publicToFeedPost,
  remainingFil,
  showMentionsRow,
} from "./eventJournal";

describe("remainingFil : ce qui reste de l'ancien fil", () => {
  it("saute les annonces reprises, garde le reste dans l'ordre", () => {
    const items = [
      { id: "a", migratedPostId: "p1" },
      { id: "b" },
      { id: "c", migratedPostId: null },
      { id: "d", migratedPostId: "p2" },
    ];
    expect(remainingFil(items).map((i) => i.id)).toEqual(["b", "c"]);
  });
  it("une réponse sans le champ (API plus ancienne) garde tout", () => {
    expect(remainingFil([{ id: "a" }, { id: "b" }])).toHaveLength(2);
  });
});

describe("journalSection", () => {
  it("la liste s'il y a des publications, quel que soit le lecteur", () => {
    expect(journalSection({ count: 3, manager: false })).toBe("list");
    expect(journalSection({ count: 1, manager: true })).toBe("list");
  });
  it("sans publication : rien pour un passionné, l'invitation pour l'organisateur", () => {
    expect(journalSection({ count: 0, manager: false })).toBe("none");
    expect(journalSection({ count: undefined, manager: false })).toBe("none");
    expect(journalSection({ count: 0, manager: true })).toBe("invite");
  });
});

describe("showMentionsRow", () => {
  it("absente sans session ou à zéro", () => {
    expect(showMentionsRow({ signedIn: false, count: 4 })).toBe(false);
    expect(showMentionsRow({ signedIn: true, count: 0 })).toBe(false);
    expect(showMentionsRow({ signedIn: true, count: undefined })).toBe(false);
    expect(showMentionsRow({ signedIn: true, count: 2 })).toBe(true);
  });
});

describe("mentionsPhase", () => {
  const now = new Date("2026-11-11T10:00:00Z");
  it("avant la fin : j'y serai ; à la fin et après : j'y étais", () => {
    expect(mentionsPhase({ endsAt: "2026-11-11T10:00:01Z" }, now)).toBe("before");
    expect(mentionsPhase({ endsAt: "2026-11-11T10:00:00Z" }, now)).toBe("after");
    expect(mentionsPhase({ endsAt: new Date("2026-10-01T00:00:00Z") }, now)).toBe("after");
  });
});

describe("journalBadges, pinGesture, clés", () => {
  it("épinglée et inscrits prévenus (envoi effectué seulement)", () => {
    expect(journalBadges({ pinned: true, important: null })).toEqual({ pinned: true, notified: false });
    expect(journalBadges({ pinned: false, important: { sentAt: null } })).toEqual({ pinned: false, notified: false });
    expect(journalBadges({ pinned: false, important: { sentAt: "2026-11-10T09:00:00Z" } })).toEqual({
      pinned: false,
      notified: true,
    });
  });
  it("le geste d'épingle", () => {
    expect(pinGesture(false)).toBe("pin");
    expect(pinGesture(true)).toBe("unpin");
  });
  it("masquer de la fiche : la clé de la cible doit figurer dans hideFrom", () => {
    expect(eventTargetKey("abc")).toBe("e:abc");
    expect(canHideFrom(["e:abc", "s:x"], "abc")).toBe(true);
    expect(canHideFrom(["e:zzz"], "abc")).toBe(false);
    expect(canHideFrom(undefined, "abc")).toBe(false);
  });
});

describe("latestNotice : la dernière nouvelle du jour J", () => {
  const mk = (source: "journal" | "legacy", at: string, important = false) => ({
    source,
    id: `${source}-${at}`,
    text: source,
    at,
    important,
  });
  it("la plus récente l'emporte, le journal à égalité", () => {
    expect(latestNotice(mk("journal", "2026-11-10T10:00:00Z"), mk("legacy", "2026-11-11T09:00:00Z"))?.source).toBe(
      "legacy",
    );
    expect(
      latestNotice(mk("journal", "2026-11-11T10:00:00Z", true), mk("legacy", "2026-11-11T09:00:00Z"))?.source,
    ).toBe("journal");
    expect(latestNotice(mk("journal", "2026-11-11T09:00:00Z"), mk("legacy", "2026-11-11T09:00:00Z"))?.source).toBe(
      "journal",
    );
  });
  it("une seule source, ou aucune", () => {
    expect(latestNotice(null, mk("legacy", "2026-11-11T09:00:00Z"))?.source).toBe("legacy");
    expect(latestNotice(mk("journal", "2026-11-11T09:00:00Z"), null)?.source).toBe("journal");
    expect(latestNotice(null, null)).toBeNull();
  });
});

describe("authorFichePath : « Sa fiche »", () => {
  it("prestataire, pro, personne, structure ; pas de page pour un média", () => {
    expect(authorFichePath({ kind: "provider", key: "v:123", pseudo: "La Brasa" })).toBe("/providers/123");
    expect(authorFichePath({ kind: "pro", key: "p:456", pseudo: "Atelier" })).toBe("/p/456");
    expect(authorFichePath({ kind: "user", key: "u:acct", pseudo: "Kenji_66" })).toBe("/u/Kenji_66");
    expect(authorFichePath({ kind: "structure", key: "s:789", pseudo: "Club" })).toBe("/o/789");
    expect(authorFichePath({ kind: "media", key: "m:1", pseudo: "Média" })).toBeNull();
  });
});

describe("publicToFeedPost : sans session", () => {
  it("ne laisse passer ni la personne ni une flamme active, et garde le visuel", () => {
    const out = publicToFeedPost({
      id: "p1",
      author: { key: "s:1", kind: "structure", name: "Club", avatarUrl: null, verified: true },
      caption: "Texte",
      photos: [{ url: "/api/public/feed-posts/p1/photos/a.webp", width: 1080, height: 1350 }],
      visual: "photos",
      attach: null,
      placeLabel: "Canet",
      important: { reason: "other", sentAt: "2026-11-10T09:00:00Z" },
      pinned: true,
      reactionsCount: 3,
      createdAt: "2026-11-10T09:00:00Z",
    });
    expect(out).toMatchObject({ mine: false, reactedByMe: false, commentsOff: true, pinned: true, vehicle: null });
    expect(out.author).toMatchObject({ kind: "structure", pseudo: "Club", grade: null });
    expect(out.photos).toHaveLength(1);
  });
});
