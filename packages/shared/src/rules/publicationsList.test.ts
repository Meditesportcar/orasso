import { describe, expect, it } from "vitest";

import {
  appendUnique,
  applyNextPage,
  CAPTION_FOLD_LINES,
  captionFold,
  profileOpenTab,
  profileTabItems,
  publicationLinkOf,
  publicationPath,
  publicationsEmptyKind,
  tileDate,
  tileMeta,
  viewMode,
} from "./publicationsList";

const now = new Date("2026-11-11T10:00:00Z");
const POST = "3f2b8a52-1c7e-4b0a-9d5e-6a1f0c2d4e11";

describe("profileOpenTab : l'onglet d'ouverture", () => {
  it("mon profil s'ouvre sur « Publications », avec ou sans publication", () => {
    expect(profileOpenTab({ mine: true, hasGarage: true, publications: { count: 9 } })).toBe("publications");
    expect(profileOpenTab({ mine: true, hasGarage: true, publications: { count: 0 } })).toBe("publications");
    expect(profileOpenTab({ mine: true, hasGarage: false, publications: undefined })).toBe("publications");
  });
  it("chez un autre avec des publications : « Publications »", () => {
    expect(profileOpenTab({ mine: false, hasGarage: true, publications: { count: 3 } })).toBe("publications");
    expect(profileOpenTab({ mine: false, hasGarage: false, publications: { count: 1 } })).toBe("publications");
  });
  it("chez un autre sans aucune publication : « Garage », ou « Sorties » sans véhicule", () => {
    expect(profileOpenTab({ mine: false, hasGarage: true, publications: { count: 0 } })).toBe("garage");
    expect(profileOpenTab({ mine: false, hasGarage: false, publications: { count: 0 } })).toBe("sorties");
  });
  it("liste restreinte (compteur nul) : « Publications », le panneau « Compte privé »", () => {
    expect(profileOpenTab({ mine: false, hasGarage: true, publications: null })).toBe("publications");
    expect(profileOpenTab({ mine: false, hasGarage: false, publications: null })).toBe("publications");
  });
  it("compteur inconnu : comme avant la vague", () => {
    expect(profileOpenTab({ mine: false, hasGarage: true, publications: undefined })).toBe("garage");
    expect(profileOpenTab({ mine: false, hasGarage: false, publications: undefined })).toBe("sorties");
  });
});

describe("profileTabItems : l'ordre des onglets", () => {
  it("Garage, Sorties, Publications ; sans véhicule pas de Garage", () => {
    expect(profileTabItems({ hasGarage: true, restricted: false })).toEqual(["garage", "sorties", "publications"]);
    expect(profileTabItems({ hasGarage: false, restricted: false })).toEqual(["sorties", "publications"]);
  });
  it("une liste restreinte ne montre que « Publications »", () => {
    expect(profileTabItems({ hasGarage: true, restricted: true })).toEqual(["publications"]);
  });
});

describe("publicationsEmptyKind : ce que montre l'onglet sans liste", () => {
  it("le panneau privé est le même qu'il y ait ou non des publications", () => {
    expect(publicationsEmptyKind({ mine: false, restricted: true, itemsCount: 0 })).toBe("private");
    expect(publicationsEmptyKind({ mine: false, restricted: true, itemsCount: 5 })).toBe("private");
  });
  it("états vides chez moi et chez un autre ; rien quand il y a une liste", () => {
    expect(publicationsEmptyKind({ mine: true, restricted: false, itemsCount: 0 })).toBe("empty_mine");
    expect(publicationsEmptyKind({ mine: false, restricted: false, itemsCount: 0 })).toBe("empty_other");
    expect(publicationsEmptyKind({ mine: true, restricted: false, itemsCount: 2 })).toBeNull();
  });
});

describe("tileMeta : la date, puis le lieu", () => {
  it("date courte sans année dans l'année en cours, avec l'année sinon", () => {
    expect(tileDate("2026-11-09T12:00:00Z", now)).toBe("9 nov.");
    expect(tileDate("2025-09-02T12:00:00Z", now)).toBe("2 sept. 2025");
  });
  it("la date suit le jour d'Orasso (fuseau de Paris), pas celui de l'appareil", () => {
    expect(tileDate("2026-11-08T23:30:00Z", now)).toBe("9 nov.");
  });
  it("le lieu est celui de la publication ; vide ou espaces : aucun", () => {
    expect(tileMeta({ createdAt: "2026-11-09T12:00:00Z", placeLabel: "Canet" }, now)).toEqual({
      date: "9 nov.",
      place: "Canet",
    });
    expect(tileMeta({ createdAt: "2026-11-09T12:00:00Z", placeLabel: "  " }, now).place).toBeNull();
    expect(tileMeta({ createdAt: "2026-11-09T12:00:00Z", placeLabel: null }, now).place).toBeNull();
  });
});

describe("captionFold : repliée après trois lignes", () => {
  it("trois lignes ou moins : jamais de bouton", () => {
    expect(captionFold({ lines: CAPTION_FOLD_LINES, expanded: false })).toEqual({ clamp: false, toggle: null });
    expect(captionFold({ lines: 1, expanded: true })).toEqual({ clamp: false, toggle: null });
  });
  it("plus de trois lignes : repliée avec « plus », puis dépliée avec « moins »", () => {
    expect(captionFold({ lines: 4, expanded: false })).toEqual({ clamp: true, toggle: "more" });
    expect(captionFold({ lines: 9, expanded: true })).toEqual({ clamp: false, toggle: "less" });
  });
});

describe("viewMode : la grille par défaut, le dernier choix retenu", () => {
  it("grille sauf « one »", () => {
    expect(viewMode(null)).toBe("grid");
    expect(viewMode(undefined)).toBe("grid");
    expect(viewMode("n'importe quoi")).toBe("grid");
    expect(viewMode("grid")).toBe("grid");
    expect(viewMode("one")).toBe("one");
  });
});

describe("appendUnique : la suite sans doublon", () => {
  it("ne remet pas une publication déjà là", () => {
    expect(appendUnique([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }])).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
  });
});

describe("publicationLinkOf : ouvrir une notification sur sa publication", () => {
  it("postId avec le lien du Fil : la publication seule (appli et site)", () => {
    expect(publicationLinkOf({ postId: POST, link: "/app/fil" })).toBe(`/publication/${POST}`);
    expect(publicationLinkOf({ postId: POST }, { web: true })).toBe(`/app/publication/${POST}`);
  });
  it("un commentaire (commentId) ouvre aussi la feuille", () => {
    expect(publicationLinkOf({ postId: POST, commentId: "c1", link: "/app/fil" })).toBe(
      `/publication/${POST}?commentaires=1`,
    );
    expect(publicationLinkOf({ postId: POST, commentId: "c1", link: "/app/fil" }, { web: true })).toBe(
      `/app/publication/${POST}?commentaires=1`,
    );
  });
  it("une publication de crew (crewId) n'est pas une publication du Fil", () => {
    expect(publicationLinkOf({ postId: POST, crewId: "x", link: "/crew/le-crew" })).toBeNull();
  });
  it("un autre lien (la fiche d'un événement) reste celui de la notification", () => {
    expect(publicationLinkOf({ postId: POST, eventId: "e", link: "/e/nocturne" })).toBeNull();
  });
  it("sans postId valide : rien", () => {
    expect(publicationLinkOf(undefined)).toBeNull();
    expect(publicationLinkOf({ link: "/app/fil" })).toBeNull();
    expect(publicationLinkOf({ postId: "../../x" })).toBeNull();
  });
  it("publicationPath", () => {
    expect(publicationPath(POST)).toBe(`/publication/${POST}`);
    expect(publicationPath(POST, { web: true, comments: true })).toBe(`/app/publication/${POST}?commentaires=1`);
  });
});

describe("applyNextPage : la suite d'une liste", () => {
  const list = { items: [{ id: "a" }, { id: "b" }], nextCursor: "c1", restricted: false };
  it("ajoute la page sans doublon", () => {
    expect(applyNextPage(list, { items: [{ id: "b" }, { id: "c" }], nextCursor: null, restricted: false })).toEqual({
      items: [{ id: "a" }, { id: "b" }, { id: "c" }],
      nextCursor: null,
      restricted: false,
    });
  });
  it("une page restreinte vide toute la liste et le curseur", () => {
    expect(applyNextPage(list, { items: [], nextCursor: null, restricted: true })).toEqual({
      items: [],
      nextCursor: null,
      restricted: true,
    });
  });
});
