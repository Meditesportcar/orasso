import { describe, expect, it } from "vitest";

import {
  authorFichePath,
  canHideFrom,
  eventTargetKey,
  journalBadges,
  journalSection,
  lastJournalNotice,
  lastLegacyNotice,
  latestNotice,
  mentionsPhase,
  pinGesture,
  publicToFeedPost,
  publishStartChoice,
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
  it("journal non lu (panne, ni réponse ni copie) : rien n'est caché", () => {
    expect(remainingFil([{ id: "a", migratedPostId: "p1" }, { id: "b" }], false).map((i) => i.id)).toEqual(["a", "b"]);
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

describe("publishStartChoice : « Publier pour cet événement »", () => {
  const S = "11111111-2222-4333-8444-555555555555";
  const E = "66666666-7777-4888-9999-000000000000";
  const authors = [{ key: "me" }, { key: "structure:" + S, structureId: S }];
  it("la structure et l'événement sont posés", () => {
    expect(publishStartChoice({ structure: S, evenement: E }, authors)).toMatchObject({
      authorKey: `structure:${S}`,
      eventId: E,
      importantOn: false,
      vehicleId: null,
    });
  });
  it("une structure qui n'est pas la mienne ou une adresse mal formée : les valeurs habituelles", () => {
    expect(publishStartChoice({ structure: "autre", evenement: E }, authors).authorKey).toBe("me");
    expect(
      publishStartChoice({ structure: "11111111-2222-4333-8444-000000000000", evenement: E }, authors),
    ).toMatchObject({
      authorKey: "me",
      eventId: null,
    });
    expect(publishStartChoice({}, authors).eventId).toBeNull();
  });
  it("un événement mal formé est ignoré, la structure reste", () => {
    expect(publishStartChoice({ structure: S, evenement: "x" }, authors)).toMatchObject({
      authorKey: `structure:${S}`,
      eventId: null,
    });
  });
});

describe("lastJournalNotice et lastLegacyNotice", () => {
  it("la publication la plus récente par date de création, texte de repli sans légende", () => {
    const items = [
      { id: "pinned", caption: "Épinglée ancienne", createdAt: "2026-10-01T10:00:00Z" },
      { id: "new", caption: null, createdAt: "2026-11-11T08:00:00Z", important: { reason: "other" } },
      { id: "mid", caption: "Milieu", createdAt: "2026-11-05T08:00:00Z" },
    ];
    expect(lastJournalNotice(items, "Photo")).toMatchObject({ id: "new", text: "Photo", important: true });
    expect(lastJournalNotice([], "Photo")).toBeNull();
  });
  it("la dernière annonce seulement : ni consigne ni changement de statut", () => {
    const items = [
      { id: "i", kind: "instructions", body: "Consignes", publishedAt: "2026-11-11T09:00:00Z" },
      { id: "a1", kind: "announcement", body: "Ancienne", publishedAt: "2026-11-01T09:00:00Z" },
      { id: "a2", kind: "announcement", body: "Récente", publishedAt: "2026-11-10T09:00:00Z" },
    ];
    expect(lastLegacyNotice(items)).toMatchObject({ id: "a2", text: "Récente", source: "legacy" });
    expect(lastLegacyNotice([items[0] as (typeof items)[number]])).toBeNull();
  });
  it("une « Info importante » d'aujourd'hui passe devant une annonce d'hier", () => {
    const journal = lastJournalNotice([{ id: "j", caption: "Horaires", createdAt: "2026-11-11T08:00:00Z" }], "Photo");
    const legacy = lastLegacyNotice([
      { id: "a", kind: "announcement", body: "Hier", publishedAt: "2026-11-10T08:00:00Z" },
    ]);
    expect(latestNotice(journal, legacy)?.source).toBe("journal");
  });
});

describe("lastJournalNotice : l'info importante du jour passe devant", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  const important = {
    id: "imp",
    caption: "Entrée déplacée",
    createdAt: "2026-11-11T07:00:00Z",
    important: { reason: "access" },
  };
  const photo = { id: "ph", caption: "Photo", createdAt: "2026-11-11T08:00:00Z" };
  it("importante 8 h (heure de Paris) + photo 9 h : l'importante", () => {
    expect(lastJournalNotice([photo, important], "x", { now, timeZone: "Europe/Paris" })?.id).toBe("imp");
  });
  it("importante d'hier + photo d'aujourd'hui : la photo", () => {
    const old = { ...important, createdAt: "2026-11-10T07:00:00Z" };
    expect(lastJournalNotice([photo, old], "x", { now, timeZone: "Europe/Paris" })?.id).toBe("ph");
  });
  it("le jour est celui du fuseau de l'événement", () => {
    const late = { ...important, createdAt: "2026-11-10T23:30:00Z" };
    expect(lastJournalNotice([photo, late], "x", { now, timeZone: "Europe/Paris" })?.id).toBe("imp");
    expect(lastJournalNotice([photo, late], "x", { now, timeZone: "America/New_York" })?.id).toBe("ph");
  });
  it("sans jour donné : la plus récente", () => {
    expect(lastJournalNotice([photo, important], "x")?.id).toBe("ph");
  });
});
