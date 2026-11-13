import { describe, expect, it } from "vitest";

import {
  attachDateLabel,
  attachPhraseOf,
  attachStateLabel,
  importantWhoText,
  publishWhereText,
} from "../labels/feedPublish.fr";
import type { PlateRect } from "../schemas/vehicle";
import {
  acceptEvents,
  accountCheckOf,
  attachableQuery,
  attachLeadOf,
  captionMaxOf,
  chooseAuthor,
  chooseEvent,
  clearUncertain,
  draftFromBody,
  emptyEventsLoad,
  eventsOf,
  eventsStale,
  feedPostBodyR8,
  importantAvailable,
  importantBlocked,
  importantImmediate,
  initialPublishChoice,
  loadUncertain,
  type PublishAuthor,
  type PublishDraft,
  publishAuthors,
  publishIssueR8,
  publishSays,
  purgeUncertain,
  saveUncertain,
  showAuthorChoice,
  showEventBlock,
  startEventsLoad,
  vehicleAllowed,
  withImportantLeft,
} from "./feedPublish";
import { nextPlateFrame } from "./plateFrame";

const frame: PlateRect = { x: 0.1, y: 0.1, w: 0.3, h: 0.1 };
const decided = { rects: [frame], noPlate: false } as never;
const undecided = { rects: [], noPlate: false } as never;

const personas = [
  { kind: "fan" as const, id: "fan", label: "Passionné · exposant", logoUrl: null },
  { kind: "media" as const, id: "m1", label: "Sud Cars", logoUrl: null },
  { kind: "organizer" as const, id: "s1", label: "Roues Libres 66", logoUrl: "/l.png" },
  { kind: "provider" as const, id: "v1", label: "La Caravane", logoUrl: null },
  { kind: "pro" as const, id: "p1", label: "La Brasa", logoUrl: null },
  { kind: "organizer" as const, id: "s2", label: "MéditeSportCar", logoUrl: null },
  { kind: "admin" as never, id: "x", label: "Administration", logoUrl: null },
];

const authors = publishAuthors(personas, "Damien_66");
const byKey = (key: string) => authors.find((a) => a.key === key) as PublishAuthor;

describe("publishAuthors", () => {
  it("« Moi » d'abord, puis structures, fiche pro, prestataire, média ; ni passionné ni administration", () => {
    expect(authors.map((a) => a.key)).toEqual([
      "me",
      "structure:s1",
      "structure:s2",
      "pro:p1",
      "provider:v1",
      "media:m1",
    ]);
  });
  it("une structure suspendue n'est pas proposée (R9h, tour 1) ; ni, par conséquent, préchoisie par ?auteur=", () => {
    const withSuspended = publishAuthors(
      [...personas, { kind: "organizer" as const, id: "s3", label: "Suspendue", logoUrl: null, suspended: true }],
      "Damien_66",
    );
    expect(withSuspended.map((a) => a.key)).toEqual(authors.map((a) => a.key));
    expect(withSuspended.some((a) => a.key === "structure:s3")).toBe(false);
  });
  it("les titres et sous-titres de la maquette", () => {
    expect(byKey("me")).toMatchObject({ title: "Moi · Damien_66", hint: "Ta publication personnelle", persona: "fan" });
    expect(byKey("structure:s1")).toMatchObject({
      title: "Roues Libres 66 · ma structure",
      hint: "Visible sur la page de la structure",
      persona: "organizer",
      structureId: "s1",
    });
    expect(byKey("pro:p1")).toMatchObject({
      title: "La Brasa · ma fiche pro",
      hint: "Visible sur ta fiche pro",
      proId: "p1",
    });
    expect(byKey("provider:v1").title).toBe("La Caravane · mon profil de prestataire");
    expect(byKey("media:m1").hint).toBe("Visible sur ta page de média");
  });
  it("« Publier en tant que » : seulement avec plus d'une casquette", () => {
    expect(showAuthorChoice(publishAuthors([personas[0] as never], "Kenji_66"))).toBe(false);
    expect(showAuthorChoice(authors)).toBe(true);
  });
  it("légende : 500 pour « Moi », 2 000 pour une casquette", () => {
    expect(captionMaxOf(byKey("me"))).toBe(500);
    expect(captionMaxOf(byKey("structure:s1"))).toBe(2000);
  });
  it("une fiche pro ne rattache pas (T2)", () => {
    expect(showEventBlock(byKey("pro:p1"))).toBe(false);
    for (const k of ["me", "structure:s1", "provider:v1", "media:m1"]) expect(showEventBlock(byKey(k))).toBe(true);
  });
  it("le titre du bloc : sortie pour « Moi », événement pour une casquette", () => {
    expect(attachLeadOf(byKey("me"))).toBe("Rattacher à une sortie");
    expect(attachLeadOf(byKey("media:m1"))).toBe("Rattacher à un événement");
  });
  it("la requête des événements rattachables suit la casquette", () => {
    expect(attachableQuery(byKey("me"))).toEqual({ persona: "fan" });
    expect(attachableQuery(byKey("structure:s2"))).toEqual({ persona: "organizer", structureId: "s2" });
    expect(attachableQuery(byKey("pro:p1"))).toEqual({ persona: "pro", proId: "p1" });
    expect(attachableQuery(byKey("provider:v1"))).toEqual({ persona: "provider" });
  });
});

describe("chooseAuthor / chooseEvent", () => {
  const base = {
    ...initialPublishChoice,
    eventId: "e1",
    vehicleId: "v1",
    placeLabel: "Collioure",
    importantOn: true,
    importantReason: "access" as const,
  };
  it("changer de casquette remet l'événement à « Aucun », retire le véhicule et décoche l'info importante", () => {
    const next = chooseAuthor(base, authors, "structure:s1");
    expect(next).toMatchObject({
      authorKey: "structure:s1",
      eventId: null,
      vehicleId: null,
      importantOn: false,
      importantReason: null,
      placeLabel: "Collioure",
    });
  });
  it("la même casquette ou une casquette inconnue ne change rien", () => {
    expect(chooseAuthor(base, authors, "me")).toBe(base);
    expect(chooseAuthor(base, authors, "structure:autre")).toBe(base);
  });
  it("un autre événement décoche l'info importante et efface le motif", () => {
    expect(chooseEvent(base, "e2")).toMatchObject({ eventId: "e2", importantOn: false, importantReason: null });
    expect(chooseEvent(base, "e1")).toBe(base);
    expect(chooseEvent(base, null).eventId).toBeNull();
  });
  it("le véhicule est réservé à « Moi »", () => {
    expect(vehicleAllowed(byKey("me"))).toBe(true);
    expect(vehicleAllowed(byKey("structure:s1"))).toBe(false);
  });
});

describe("publishIssueR8", () => {
  const draft = (over: Partial<PublishDraft> = {}): PublishDraft => ({
    photos: [decided],
    caption: "",
    author: byKey("me"),
    event: null,
    important: { on: false, reason: null },
    ...over,
  });
  it("la préparation en cours passe avant tout", () => {
    expect(publishIssueR8(draft({ preparing: true, photos: [] }))).toBe("Préparation des photos…");
  });
  it("aucune photo et pas d'événement : « ajoute une photo », pour « Moi » comme pour une casquette", () => {
    expect(publishIssueR8(draft({ photos: [] }))).toBe("Ajoute au moins une photo.");
    expect(publishIssueR8(draft({ photos: [], author: byKey("structure:s1"), caption: "Plan en ligne" }))).toBe(
      "Ajoute au moins une photo.",
    );
  });
  it("aucune photo, événement sans affiche : « cet événement n'a pas d'affiche : ajoute une photo »", () => {
    expect(publishIssueR8(draft({ photos: [], event: { hasVisual: false }, caption: "Un mot" }))).toBe(
      "Cet événement n'a pas d'affiche : ajoute une photo.",
    );
  });
  it("aucune photo, événement avec affiche : permis avec une légende, bloqué sans", () => {
    const ev = { hasVisual: true };
    expect(publishIssueR8(draft({ photos: [], event: ev, caption: "Le plan est en ligne" }))).toBeNull();
    expect(publishIssueR8(draft({ photos: [], event: ev, caption: "   " }))).toBe(
      "Sans photo, écris un mot : l'affiche de l'événement sera le visuel.",
    );
  });
  it("avec une photo, l'événement n'a pas besoin d'affiche", () => {
    expect(publishIssueR8(draft({ event: { hasVisual: false } }))).toBeNull();
  });
  it("la décision de plaque de chaque photo reste obligatoire", () => {
    expect(publishIssueR8(draft({ photos: [decided, undecided] }))).toBe(
      "Photo 2 : floute la plaque ou confirme qu'aucune plaque n'est visible.",
    );
    expect(publishIssueR8(draft({ photos: [{ rects: [nextPlateFrame([])], noPlate: false } as never] }))).toContain(
      "place le cadre",
    );
    expect(publishIssueR8(draft({ photos: [{ rects: [], noPlate: true } as never] }))).toBeNull();
  });
  it("la légende : 500 pour « Moi », 2 000 pour une casquette", () => {
    const long = "a".repeat(501);
    expect(publishIssueR8(draft({ caption: long }))).toBe("Un mot de 500 caractères au plus.");
    expect(publishIssueR8(draft({ caption: long, author: byKey("structure:s1") }))).toBeNull();
    expect(publishIssueR8(draft({ caption: "a".repeat(2001), author: byKey("structure:s1") }))).toBe(
      "Un mot de 2 000 caractères au plus.",
    );
  });
  it("« Info importante » cochée sans motif : bloquée ; avec motif : permise", () => {
    const org = { author: byKey("structure:s1"), event: { hasVisual: true } };
    expect(publishIssueR8(draft({ ...org, important: { on: true, reason: null } }))).toBe(
      "Choisis le motif de l'info importante.",
    );
    expect(publishIssueR8(draft({ ...org, important: { on: true, reason: "access" } }))).toBeNull();
    expect(publishIssueR8(draft({ ...org, important: { on: false, reason: null } }))).toBeNull();
  });
  it("l'ordre : visuel, plaque, légende, motif", () => {
    const org = byKey("structure:s1");
    const all = draft({
      photos: [undecided],
      caption: "a".repeat(2500),
      author: org,
      important: { on: true, reason: null },
    });
    expect(publishIssueR8(all)).toContain("Photo 1");
    expect(publishIssueR8({ ...all, photos: [decided] })).toBe("Un mot de 2 000 caractères au plus.");
    expect(publishIssueR8({ ...all, photos: [decided], caption: "ok" })).toBe("Choisis le motif de l'info importante.");
  });
});

describe("feedPostBodyR8", () => {
  const photo = { rects: [frame], noPlate: false, uploadKey: "k1" } as never;
  const base = {
    photos: [photo],
    caption: "  Un mot  ",
    aspect: "portrait_4_5" as const,
    clientId: "c1",
    eventId: null as string | null,
    vehicleId: "veh1" as string | null,
    placeLabel: " Collioure ",
    important: { on: false, reason: null } as const,
    commercialPartnerId: "pro9" as string | null,
  };
  it("n'envoie jamais de rôle", () => {
    for (const a of authors) {
      const body = feedPostBodyR8({ ...base, author: a, eventId: "e1" }) as Record<string, unknown>;
      expect(body).not.toHaveProperty("role");
      expect(JSON.stringify(body)).not.toMatch(/organizer"\s*:\s*"|attendee|on_site/);
    }
  });
  it("« Moi » : persona fan, véhicule et collaboration commerciale", () => {
    const body = feedPostBodyR8({ ...base, author: byKey("me") });
    expect(body).toMatchObject({
      persona: "fan",
      vehicleId: "veh1",
      commercialPartnerId: "pro9",
      caption: "Un mot",
      eventId: null,
      placeLabel: "Collioure",
    });
    expect(body).not.toHaveProperty("structureId");
  });
  it("une casquette n'envoie ni véhicule ni collaboration commerciale", () => {
    const body = feedPostBodyR8({ ...base, author: byKey("structure:s1") });
    expect(body).toMatchObject({ persona: "organizer", structureId: "s1" });
    expect(body).not.toHaveProperty("vehicleId");
    expect(body).not.toHaveProperty("commercialPartnerId");
    expect(body).not.toHaveProperty("proId");
    expect(feedPostBodyR8({ ...base, author: byKey("pro:p1") })).toMatchObject({ persona: "pro", proId: "p1" });
    expect(feedPostBodyR8({ ...base, author: byKey("media:m1") })).toMatchObject({ persona: "media" });
  });
  it("le lieu libre n'est envoyé que sans événement", () => {
    expect(feedPostBodyR8({ ...base, author: byKey("me"), eventId: "e1" })).not.toHaveProperty("placeLabel");
    expect(feedPostBodyR8({ ...base, author: byKey("me"), placeLabel: "   " })).not.toHaveProperty("placeLabel");
    expect(feedPostBodyR8({ ...base, author: byKey("me"), placeLabel: "x".repeat(120) })).toMatchObject({
      placeLabel: "x".repeat(80),
    });
  });
  it("« Info importante » : seulement cochée, avec son motif et un événement", () => {
    const org = byKey("structure:s1");
    expect(
      feedPostBodyR8({ ...base, author: org, eventId: "e1", important: { on: true, reason: "weather" } }),
    ).toMatchObject({
      important: { reason: "weather" },
    });
    expect(
      feedPostBodyR8({ ...base, author: org, eventId: "e1", important: { on: false, reason: "weather" } }),
    ).not.toHaveProperty("important");
    expect(
      feedPostBodyR8({ ...base, author: org, eventId: "e1", important: { on: true, reason: null } }),
    ).not.toHaveProperty("important");
    expect(
      feedPostBodyR8({ ...base, author: org, eventId: null, important: { on: true, reason: "access" } }),
    ).not.toHaveProperty("important");
  });
  it("sans photo : liste vide ; une photo sans cadre = « aucune plaque » confirmée", () => {
    expect(feedPostBodyR8({ ...base, author: byKey("structure:s1"), photos: [] }).photos).toEqual([]);
    const body = feedPostBodyR8({
      ...base,
      author: byKey("me"),
      photos: [{ rects: [], noPlate: true, uploadKey: "k2" } as never],
    });
    expect(body.photos).toEqual([{ uploadKey: "k2", plateRects: null, noPlateConfirmed: true }]);
  });
});

describe("« Info importante »", () => {
  const ev = (
    important: { leftToday: number; leftWeek: number } | null,
    role: "organizer" | "attendee" = "organizer",
  ) => ({
    role,
    important,
  });
  it("la case n'existe que pour la casquette structure et un événement de sa structure", () => {
    expect(importantAvailable(byKey("structure:s1"), ev({ leftToday: 1, leftWeek: 3 }))).toBe(true);
    expect(importantAvailable(byKey("structure:s1"), null)).toBe(false);
    expect(importantAvailable(byKey("me"), ev({ leftToday: 1, leftWeek: 3 }))).toBe(false);
    expect(importantAvailable(byKey("media:m1"), ev(null))).toBe(false);
    expect(importantAvailable(byKey("structure:s1"), ev(null))).toBe(false);
    expect(importantAvailable(byKey("structure:s1"), ev({ leftToday: 1, leftWeek: 3 }, "attendee"))).toBe(false);
  });
  it("le plafond : la semaine avant le jour", () => {
    expect(importantBlocked({ important: { leftToday: 1, leftWeek: 3 } })).toBeNull();
    expect(importantBlocked({ important: { leftToday: 0, leftWeek: 2 } })).toBe("day");
    expect(importantBlocked({ important: { leftToday: 0, leftWeek: 0 } })).toBe("week");
    expect(importantBlocked({ important: null })).toBeNull();
  });
  it("tout de suite le jour, la nuit si l'événement commence dans moins de 12 h ou est en cours, sinon à 8 h", () => {
    // Novembre : Paris = UTC + 1. 14 h à Paris.
    const noon = new Date("2026-11-11T13:00:00Z");
    expect(importantImmediate("2026-11-20T10:00:00Z", noon)).toBe(true);
    // 23 h à Paris, événement dans 5 h : tout de suite.
    const night = new Date("2026-11-11T22:00:00Z");
    expect(importantImmediate("2026-11-12T03:00:00Z", night)).toBe(true);
    // 23 h, événement en cours (commencé hier) : tout de suite.
    expect(importantImmediate("2026-11-10T08:00:00Z", night)).toBe(true);
    // 23 h, événement dans 30 h : à 8 h.
    expect(importantImmediate("2026-11-13T04:00:00Z", night)).toBe(false);
    // 3 h du matin, événement dans 20 h : à 8 h.
    expect(importantImmediate("2026-11-12T00:00:00Z", new Date("2026-11-11T02:00:00Z"))).toBe(false);
  });
  it("la phrase de confirmation", () => {
    expect(importantWhoText(148, true)).toBe(
      "Les 148 inscrits sont prévenus tout de suite (notification « Essentiel »).",
    );
    expect(importantWhoText(148, false)).toBe("Les 148 inscrits sont prévenus à 8 h (notification « Essentiel »).");
    expect(importantWhoText(null, true)).toBe("Les inscrits sont prévenus tout de suite (notification « Essentiel »).");
    expect(importantWhoText(1, true)).toBe("1 inscrit est prévenu tout de suite (notification « Essentiel »).");
    expect(importantWhoText(0, true)).toBe("Aucun inscrit à prévenir pour l'instant.");
  });
});

describe("« Ce que verront les autres »", () => {
  it("les mots du rattachement et le tampon (sortie passée seulement)", () => {
    const org = publishSays(
      byKey("structure:s1"),
      { title: "Salon Argelès", role: "organizer", phase: "before" },
      true,
    );
    expect(org).toMatchObject({ phrase: "pour le Salon Argelès", stamp: false, authorName: "Roues Libres 66" });
    expect(org.where).toBe(
      "Elle devient une publication de la fiche de l'événement (son journal) et du profil de la structure. Les inscrits sont prévenus (info importante).",
    );
    const past = publishSays(byKey("me"), { title: "Rassemblement du Lydia", role: "attendee", phase: "after" }, false);
    expect(past).toMatchObject({ phrase: "était au Rassemblement du Lydia", stamp: true });
    const soon = publishSays(byKey("me"), { title: "Nocturne de Canet", role: "attendee", phase: "before" }, false);
    expect(soon).toMatchObject({ phrase: "sera à la Nocturne de Canet", stamp: false });
    expect(
      publishSays(byKey("provider:v1"), { title: "Nocturne", role: "on_site", phase: "before" }, false).phrase,
    ).toBe("présent à la Nocturne");
    const none = publishSays(byKey("me"), null, false);
    expect(none).toMatchObject({ phrase: null, stamp: false });
  });
  it("les cinq variantes de la phrase de destination", () => {
    const w = (destination: never, role: never, phase: never, important = false) =>
      publishWhereText({ destination, role, phase, important });
    expect(w("me" as never, null as never, "before" as never)).toBe(
      "Elle reste sur ton profil et le Fil la montre à tes abonnés.",
    );
    expect(w("structure" as never, null as never, "before" as never)).toBe(
      "Elle reste sur la page de la structure et le Fil la montre à tes abonnés.",
    );
    expect(w("pro" as never, null as never, "before" as never)).toBe(
      "Elle reste sur ta fiche pro et le Fil la montre à tes abonnés.",
    );
    expect(w("structure" as never, "organizer" as never, "before" as never)).toBe(
      "Elle devient une publication de la fiche de l'événement (son journal) et du profil de la structure.",
    );
    expect(w("media" as never, "on_site" as never, "before" as never)).toBe(
      "Elle reste sur ta page de média. Sur la fiche de l'événement, elle apparaît dans « Mentions » (rubrique « Sur place »), pas dans ses publications.",
    );
    expect(w("me" as never, "attendee" as never, "after" as never)).toBe(
      "Elle reste sur ton profil. Sur la fiche de l'événement, elle apparaît dans « Mentions » (rubrique « Passionnés, j'y étais ») si ton compte est public. Le tampon « Présent » ne s'ajoute que si ta présence a été validée (QR ou GPS).",
    );
    expect(w("me" as never, "attendee" as never, "before" as never)).toContain("Passionnés, j'y serai");
  });
});

describe("libellés d'un événement rattachable", () => {
  it("date de Paris et état (copie de la maquette)", () => {
    expect(attachDateLabel("2026-11-14T18:00:00Z")).toBe("sam. 14 nov.");
    expect(attachDateLabel("2026-11-09T23:30:00Z")).toBe("mar. 10 nov.");
    expect(attachDateLabel("pas une date")).toBe("");
    expect(attachStateLabel("on_site", "before")).toBe("tu y es retenu");
    expect(attachStateLabel("attendee", "after")).toBe("tu y étais");
    expect(attachStateLabel("organizer", "after")).toBe("30 derniers jours");
    expect(attachStateLabel("organizer", "before")).toBe("à venir");
    expect(attachStateLabel("attendee", "running")).toBe("en cours");
    expect(attachPhraseOf("organizer", "before", "Balade de Prades")).toBe("pour la Balade de Prades");
    expect(attachPhraseOf("organizer", "before", "Rassemblement du Lydia")).toBe("pour le Rassemblement du Lydia");
    expect(attachPhraseOf("attendee", "before", "Nocturne de Canet")).toBe("sera à la Nocturne de Canet");
    expect(attachPhraseOf(null, "after", "Rassemblement du Lydia")).toBe("Rassemblement du Lydia");
  });
});

describe("événements lus pour un compte (tour 2)", () => {
  const item = (id: string) => ({ id, title: id, important: { leftToday: 1, leftWeek: 3 } }) as never;
  it("la réponse tardive du compte A est jetée quand B est connecté (même casquette « me »)", () => {
    let state = startEventsLoad(emptyEventsLoad, "A", "me");
    const askedA = { account: "A", key: "me" };
    // B se connecte avant la réponse de A : la liste de A est vidée, B a son propre chargement.
    state = startEventsLoad(state, "B", "me");
    expect(eventsOf(state, "B", "me")).toEqual([]);
    state = acceptEvents(state, { account: "B", key: "me" }, askedA, { ok: true, items: [item("secret-de-A")] }, 1);
    expect(eventsOf(state, "B", "me")).toEqual([]);
    expect(state.items).toBeNull();
    // La réponse de B est prise.
    state = acceptEvents(
      state,
      { account: "B", key: "me" },
      { account: "B", key: "me" },
      { ok: true, items: [item("b1")] },
      2,
    );
    expect(eventsOf(state, "B", "me").map((e) => e.id)).toEqual(["b1"]);
    // Et rien n'est servi à A.
    expect(eventsOf(state, "A", "me")).toEqual([]);
  });
  it("une casquette changée jette la réponse de l'ancienne ; une relecture de la même garde la liste", () => {
    let state = startEventsLoad(emptyEventsLoad, "A", "me");
    state = acceptEvents(
      state,
      { account: "A", key: "me" },
      { account: "A", key: "me" },
      { ok: true, items: [item("e1")] },
      5,
    );
    const same = startEventsLoad(state, "A", "me");
    expect(same).toBe(state);
    const failed = acceptEvents(
      state,
      { account: "A", key: "me" },
      { account: "A", key: "me" },
      { ok: false, forbidden: null },
      6,
    );
    expect(failed).toMatchObject({ failed: true, loadedAt: 5 });
    expect(failed.items).toHaveLength(1);
    const other = startEventsLoad(state, "A", "structure:s1");
    expect(other.items).toBeNull();
    expect(
      acceptEvents(
        other,
        { account: "A", key: "structure:s1" },
        { account: "A", key: "me" },
        { ok: true, items: [item("x")] },
        7,
      ).items,
    ).toBeNull();
  });
  it("un refus de la liste (droit, second facteur) bloque « Publier » avec la raison", () => {
    const base = {
      photos: [decidedPhoto()],
      caption: "x",
      author: byKey("structure:s1"),
      event: null,
      important: { on: false, reason: null },
    } satisfies PublishDraft;
    expect(publishIssueR8({ ...base, forbidden: "persona_forbidden" })).toBe(
      "Tu ne peux pas publier au nom de cette page.",
    );
    expect(publishIssueR8({ ...base, forbidden: "two_factor_required" })).toContain("double authentification");
    expect(publishIssueR8({ ...base, forbidden: null })).toBeNull();
  });
  it("le plafond est périmé au changement de jour de Paris, pas avant", () => {
    const loadedAt = new Date("2026-11-11T21:30:00Z").getTime(); // 22 h 30 à Paris
    expect(eventsStale(loadedAt, new Date("2026-11-11T22:30:00Z"))).toBe(false);
    expect(eventsStale(loadedAt, new Date("2026-11-11T23:01:00Z"))).toBe(true); // minuit passé à Paris
    expect(eventsStale(0, new Date())).toBe(false);
  });
  it("le plafond d'un événement se remplace sans toucher aux autres", () => {
    let state = startEventsLoad(emptyEventsLoad, "A", "structure:s1");
    state = acceptEvents(
      state,
      { account: "A", key: "structure:s1" },
      { account: "A", key: "structure:s1" },
      { ok: true, items: [item("e1"), item("e2")] },
      1,
    );
    const next = withImportantLeft(state, "e1", { leftToday: 0, leftWeek: 2 });
    expect(next.items?.[0]?.important).toEqual({ leftToday: 0, leftWeek: 2 });
    expect(next.items?.[1]?.important).toEqual({ leftToday: 1, leftWeek: 3 });
  });
});

function decidedPhoto() {
  return { rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.1 }], noPlate: false } as never;
}

describe("contrôle du compte et envoi incertain gardé (tour 4)", () => {
  it("quatre états : même compte, autre compte, session perdue (401), rien de sûr (réseau, 5xx)", () => {
    expect(accountCheckOf({ ok: true, userId: "A" }, "A")).toBe("same");
    expect(accountCheckOf({ ok: true, userId: "B" }, "A")).toBe("other");
    expect(accountCheckOf({ ok: false, status: 401 }, "A")).toBe("signed_out");
    expect(accountCheckOf({ ok: false, status: 0 }, "A")).toBe("unreachable");
    expect(accountCheckOf({ ok: false, status: 503 }, "A")).toBe("unreachable");
  });
  const memory = () => {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  it("le corps incertain survit au rechargement, par compte : A → B → A garde l'envoi de A", () => {
    const store = memory();
    saveUncertain(store, "A", { clientId: "c1", caption: "x" } as never);
    expect(loadUncertain(store, "A")).toMatchObject({ clientId: "c1", caption: "x" });
    // B n'en relit rien et n'efface rien de A.
    expect(loadUncertain(store, "B")).toBeNull();
    saveUncertain(store, "B", { clientId: "cB" });
    clearUncertain(store, "B");
    expect(loadUncertain(store, "A")).toMatchObject({ clientId: "c1" });
    clearUncertain(store, "A");
    expect(loadUncertain(store, "A")).toBeNull();
    expect(loadUncertain(null, "A")).toBeNull();
  });
  it("la déconnexion efface les envois incertains de tous les comptes, rien d'autre", () => {
    const store = memory();
    store.setItem("autre-cle", "garde");
    saveUncertain(store, "A", { clientId: "c1" });
    saveUncertain(store, "B", { clientId: "c2" });
    purgeUncertain(store);
    expect(loadUncertain(store, "A")).toBeNull();
    expect(loadUncertain(store, "B")).toBeNull();
    expect(store.getItem("autre-cle")).toBe("garde");
    expect(() => purgeUncertain(null)).not.toThrow();
  });
  it("transition : l'ancienne clé unique passe sous la clé de son compte, et la purge l'efface aussi", () => {
    const store = memory();
    store.setItem(
      "orasso:fil:publish-uncertain",
      JSON.stringify({ account: "A", body: { clientId: "vieux", caption: "x" } }),
    );
    // Un autre compte ne la touche pas ; le bon la retrouve et la migre.
    expect(loadUncertain(store, "B")).toBeNull();
    expect(store.getItem("orasso:fil:publish-uncertain")).not.toBeNull();
    expect(loadUncertain(store, "A")).toMatchObject({ clientId: "vieux", caption: "x" });
    expect(store.getItem("orasso:fil:publish-uncertain")).toBeNull();
    expect(loadUncertain(store, "A")).toMatchObject({ clientId: "vieux" });
    // Une ancienne clé jamais relue disparaît à la déconnexion.
    store.setItem("orasso:fil:publish-uncertain", JSON.stringify({ account: "C", body: { clientId: "c" } }));
    purgeUncertain(store);
    expect(store.getItem("orasso:fil:publish-uncertain")).toBeNull();
    expect(loadUncertain(store, "A")).toBeNull();
    // Un contenu illisible est écarté.
    store.setItem("orasso:fil:publish-uncertain", "{abîmé");
    expect(loadUncertain(store, "A")).toBeNull();
    expect(store.getItem("orasso:fil:publish-uncertain")).toBeNull();
  });
  it("migration : stockage plein (quota) → l'ancienne clé reste et son corps sert de secours ; réessai réussi → migrée", () => {
    const m = new Map<string, string>();
    let full = true;
    const store = {
      get length() {
        return m.size;
      },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (full) throw new DOMException("quota", "QuotaExceededError");
        m.set(k, v);
      },
      removeItem: (k: string) => void m.delete(k),
    };
    m.set("orasso:fil:publish-uncertain", JSON.stringify({ account: "A", body: { clientId: "vieux", caption: "x" } }));
    expect(loadUncertain(store, "A")).toMatchObject({ clientId: "vieux", caption: "x" });
    expect(m.has("orasso:fil:publish-uncertain")).toBe(true);
    full = false;
    expect(loadUncertain(store, "A")).toMatchObject({ clientId: "vieux" });
    expect(m.has("orasso:fil:publish-uncertain")).toBe(false);
    expect(m.has("orasso:fil:publish-uncertain:A")).toBe(true);
  });
  it("quota puis lecture, confirmation ou abandon, rechargement : plus rien (l'ancienne clé aussi)", () => {
    const m = new Map<string, string>();
    const store = {
      get length() {
        return m.size;
      },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
      removeItem: (k: string) => void m.delete(k),
    };
    for (const _end of ["confirmation", "abandon"]) {
      m.set("orasso:fil:publish-uncertain", JSON.stringify({ account: "A", body: { clientId: "vieux" } }));
      expect(loadUncertain(store, "A")).toMatchObject({ clientId: "vieux" });
      clearUncertain(store, "A");
      expect(loadUncertain(store, "A")).toBeNull();
      expect(m.size).toBe(0);
    }
    // L'ancienne clé d'un autre compte n'est jamais effacée par ce compte.
    m.set("orasso:fil:publish-uncertain", JSON.stringify({ account: "B", body: { clientId: "b" } }));
    clearUncertain(store, "A");
    expect(m.has("orasso:fil:publish-uncertain")).toBe(true);
  });
  it("le corps d'un envoi porte le compte attendu", () => {
    const body = feedPostBodyR8({
      photos: [],
      caption: "x",
      aspect: "portrait_4_5",
      clientId: "c",
      author: authors[0] as PublishAuthor,
      eventId: null,
      vehicleId: null,
      placeLabel: "",
      important: { on: false, reason: null },
      expectedUserId: "compte-A",
    });
    expect(body).toMatchObject({ expectedUserId: "compte-A" });
  });
  it("un contenu abîmé n'est pas un corps incertain", () => {
    const store = memory();
    store.setItem("orasso:fil:publish-uncertain:A", "{pas du json");
    expect(loadUncertain(store, "A")).toBeNull();
  });
  it("le brouillon affichable d'une reprise : structure, événement, Info importante, légende, format, photos parties", () => {
    const body = {
      persona: "organizer",
      structureId: "s2",
      eventId: "e9",
      caption: "Parking fermé",
      aspect: "square",
      important: { reason: "access" },
      photos: [{ uploadKey: "k1" }, { uploadKey: "k2" }],
      clientId: "c1",
    };
    const d = draftFromBody(body, authors);
    expect(d.choice).toMatchObject({
      authorKey: "structure:s2",
      eventId: "e9",
      importantOn: true,
      importantReason: "access",
      vehicleId: null,
    });
    expect(d).toMatchObject({ caption: "Parking fermé", aspect: "square", photoCount: 2 });
    // Un corps de « Moi » ou d'une casquette disparue retombe sur « Moi ».
    expect(draftFromBody({ caption: "x", vehicleId: "v1", placeLabel: "Port" }, authors).choice).toMatchObject({
      authorKey: "me",
      vehicleId: "v1",
      placeLabel: "Port",
      importantOn: false,
    });
    expect(draftFromBody({ persona: "organizer", structureId: "disparue" }, authors).choice.authorKey).toBe("me");
  });
});

describe("l'étiquette « Offre » (R9c)", () => {
  const NOW = new Date("2026-11-10T09:00:00Z");
  const proAuthor = () => byKey("pro:p1");
  const offer = { on: true, title: "Polish complet", startsOn: "2026-11-10", endsOn: "2026-11-30" };
  const draft = (over: Partial<PublishDraft> = {}): PublishDraft => ({
    photos: [decided],
    caption: "",
    author: proAuthor(),
    event: null,
    important: { on: false, reason: null },
    offer,
    ...over,
  });
  it("une offre sans photo est bloquée, la photo d'abord", () => {
    expect(publishIssueR8(draft({ photos: [], offer: { ...offer, title: "" } }), NOW)).toBe(
      "Ajoute au moins une photo.",
    );
  });
  it("titre manquant, fin manquante, fin passée : la ligne dit lequel", () => {
    expect(publishIssueR8(draft({ offer: { ...offer, title: " " } }), NOW)).toBe(
      "Donne un titre à ton offre (2 caractères au moins).",
    );
    expect(publishIssueR8(draft({ offer: { ...offer, endsOn: "" } }), NOW)).toBe("Choisis la date de fin de l'offre.");
    expect(publishIssueR8(draft({ offer: { ...offer, endsOn: "2026-11-09" } }), NOW)).toBe(
      "La date de fin de l'offre est déjà passée.",
    );
    expect(publishIssueR8(draft(), NOW)).toBeNull();
  });
  it("l'étiquette non choisie ou une autre casquette : aucune règle d'offre", () => {
    expect(publishIssueR8(draft({ offer: { ...offer, on: false, title: "" } }), NOW)).toBeNull();
    expect(publishIssueR8(draft({ author: byKey("me"), offer: { ...offer, title: "" } }), NOW)).toBeNull();
  });
  const photo = { rects: [frame], noPlate: false, uploadKey: "k1" } as never;
  const body = (author: PublishAuthor, o = offer) =>
    feedPostBodyR8({
      photos: [photo],
      caption: "x",
      aspect: "portrait_4_5",
      clientId: "c1",
      author,
      eventId: null,
      vehicleId: null,
      placeLabel: "",
      important: { on: false, reason: null },
      offer: o,
    }) as Record<string, unknown>;
  it("le corps porte `offer` pour la casquette pro et l'étiquette choisie seulement", () => {
    expect(body(proAuthor())).toMatchObject({
      persona: "pro",
      offer: { title: "Polish complet", startsOn: "2026-11-10", endsOn: "2026-11-30" },
    });
    expect(body(proAuthor(), { ...offer, on: false })).not.toHaveProperty("offer");
    for (const key of ["me", "structure:s1", "provider:v1", "media:m1"]) {
      expect(body(byKey(key))).not.toHaveProperty("offer");
    }
  });
  it("« Ce que verront les autres » : l'étiquette « Offre » à droite du nom, seulement pour une fiche pro", () => {
    expect(publishSays(proAuthor(), null, false, true).tag).toBe("Offre");
    expect(publishSays(proAuthor(), null, false).tag).toBeNull();
    expect(publishSays(byKey("me"), null, false, true).tag).toBeNull();
  });
});

describe("draftFromBody : l'offre du corps gardé (R9c)", () => {
  it("la reprise restaure l'offre (titre, dates) pour la casquette pro, et rien sans offre", () => {
    const body = {
      persona: "pro",
      proId: "p1",
      offer: { title: "Polish", startsOn: "2026-11-10", endsOn: "2026-11-30" },
      photos: [],
    };
    const d = draftFromBody(body, authors);
    expect(d.choice.authorKey).toBe("pro:p1");
    expect(d.offer).toEqual({ on: true, title: "Polish", startsOn: "2026-11-10", endsOn: "2026-11-30" });
    expect(draftFromBody({ persona: "fan", photos: [] }, authors).offer.on).toBe(false);
  });
});
