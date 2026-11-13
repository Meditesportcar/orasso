import { describe, expect, it } from "vitest";

import { albumTagLabels as L } from "../labels/albumTags.fr";
import {
  albumViewerRoleOf,
  appendTaggablePage,
  createOperationGate,
  createPagedReads,
  mentionsSummary,
  myPhotoTaggedBy,
  reviewButtonsOf,
  showPeopleTab,
  taggedByText,
  whoLabelOf,
} from "./albumTagView";

const car = { vehicleId: "v", label: "Toyota GR Supra" } as never;
const me = { userId: "u", pseudo: "Damien_66", avatarUrl: null, mine: true };

describe("albumViewerRoleOf", () => {
  it("le média auteur est toujours « media »", () => {
    expect(albumViewerRoleOf({ mine: true, taggable: null })).toBe("media");
  });
  it("sans plateau lu : un membre", () => {
    expect(albumViewerRoleOf({ mine: false, taggable: null })).toBe("member");
  });
  it("l'organisateur", () => {
    expect(albumViewerRoleOf({ mine: false, taggable: { role: "organizer", vehicles: [car], people: [] } })).toBe(
      "organizer",
    );
  });
  it("un passionné avec une voiture présente peut dire « C'est ma voiture »", () => {
    expect(albumViewerRoleOf({ mine: false, taggable: { role: "owner", vehicles: [car], people: [] } })).toBe("tagged");
  });
  it("un passionné dont seul le pseudo est identifiable", () => {
    expect(albumViewerRoleOf({ mine: false, taggable: { role: "owner", vehicles: [], people: [me] } })).toBe("tagged");
  });
  it("sans voiture ni pseudo identifiable : un membre (le bouton est absent)", () => {
    expect(albumViewerRoleOf({ mine: false, taggable: { role: "owner", vehicles: [], people: [] } })).toBe("member");
  });
});

describe("whoLabelOf", () => {
  it("les trois phrases de la maquette", () => {
    expect(whoLabelOf("media")).toBe("média auteur de l'album");
    expect(whoLabelOf("organizer")).toBe("organisateur de l'événement");
    expect(whoLabelOf("tagged")).toBe("propriétaire d'une voiture présente");
    expect(whoLabelOf("member")).toBeNull();
  });
});

describe("taggedByText", () => {
  it("moi quand j'ai posé l'identification, le média ou l'organisateur sinon", () => {
    expect(taggedByText({ taggedAs: "owner", mine: true, removeAs: "withdraw" }, "tagged", "Sud Cars")).toBe(
      L.identifiedByYou,
    );
    expect(taggedByText({ taggedAs: "media", mine: true, removeAs: "not_mine" }, "tagged", "Sud Cars")).toBe(
      "identifiée par Sud Cars",
    );
    expect(taggedByText({ taggedAs: "media", mine: false, removeAs: "tagger" }, "media", "Sud Cars")).toBe(
      L.identifiedByYou,
    );
    expect(taggedByText({ taggedAs: "organizer", mine: false, removeAs: null }, "member", "Sud Cars")).toBe(
      "identifiée par l'organisateur",
    );
  });
});

describe("myPhotoTaggedBy", () => {
  it("les trois cas de « Tes photos »", () => {
    expect(myPhotoTaggedBy("media", "Sud Cars")).toBe("Identifiée par Sud Cars");
    expect(myPhotoTaggedBy("me", "Sud Cars")).toBe("Identifiée par toi");
    expect(myPhotoTaggedBy("organizer", "Sud Cars")).toBe("Identifiée par l'organisateur");
  });
});

describe("mentionsSummary", () => {
  it("la voiture et le média, accord au pluriel", () => {
    expect(mentionsSummary([{ count: 6, mediaName: "Objectif 66" }], "Toyota GR Supra")?.line).toBe(
      "6 photos de ta Toyota GR Supra · Objectif 66",
    );
    expect(mentionsSummary([{ count: 1, mediaName: "Objectif 66" }], "Toyota GR Supra")?.line).toBe(
      "1 photo de ta Toyota GR Supra · Objectif 66",
    );
  });
  it("sans voiture : « où tu es identifié » ; plusieurs albums : la somme, les médias une fois", () => {
    const s = mentionsSummary(
      [
        { count: 2, mediaName: "Objectif 66" },
        { count: 3, mediaName: "Objectif 66" },
      ],
      null,
    );
    expect(s?.count).toBe(5);
    expect(s?.line).toBe("5 photos où tu es identifié · Objectif 66");
  });
  it("rien sans photo", () => {
    expect(mentionsSummary(undefined, "x")).toBeNull();
    expect(mentionsSummary([], "x")).toBeNull();
  });
});

describe("appendTaggablePage (« Voir plus » au-delà de 60 voitures)", () => {
  const car = (i: number) => ({ vehicleId: `v${i}`, label: `Voiture ${i}` }) as never;
  const page = (from: number, n: number, nextCursor: number | null) =>
    ({
      role: "media",
      vehicles: Array.from({ length: n }, (_, i) => car(from + i)),
      people: [],
      categories: [],
      fallback: false,
      nextCursor,
    }) as never;
  it("130 voitures en trois pages : toutes, une fois chacune, le curseur de la dernière page", () => {
    const a = appendTaggablePage(page(0, 60, 60), page(60, 60, 120));
    const b = appendTaggablePage(a, page(120, 10, null));
    expect(b.vehicles).toHaveLength(130);
    expect(new Set(b.vehicles.map((v) => v.vehicleId)).size).toBe(130);
    expect(b.nextCursor).toBeNull();
    expect(a.nextCursor).toBe(120);
  });
  it("une voiture déjà lue n'est pas doublée", () => {
    expect(appendTaggablePage(page(0, 3, 3), page(2, 3, null)).vehicles).toHaveLength(5);
  });
});

describe("showPeopleTab", () => {
  it("après deux caractères, ou dès que l'API rend « moi » sans recherche", () => {
    expect(showPeopleTab(false, 0)).toBe(false);
    expect(showPeopleTab(true, 0)).toBe(true);
    expect(showPeopleTab(false, 1)).toBe(true);
  });
});

describe("createOperationGate", () => {
  it("réponses dans l'ordre inverse : seule la dernière opération démarrée est appliquée", () => {
    const gate = createOperationGate();
    const first = gate.start();
    const second = gate.start();
    // La seconde répond d'abord, la première après : la première est périmée.
    expect(second()).toBe(true);
    expect(first()).toBe(false);
  });
  it("une invalidation (changement d'album, fermeture, perte de focus) périme l'opération en cours, sans reprise au retour", () => {
    const gate = createOperationGate();
    const op = gate.start();
    gate.invalidate();
    expect(op()).toBe(false);
    gate.invalidate();
    expect(op()).toBe(false);
  });
});

describe("createPagedReads (« Voir plus » pendant une nouvelle lecture de liste)", () => {
  const list = (from: number, n: number, next: number | null) => ({ vehicles: Array.from({ length: n }, (_, i) => ({ vehicleId: `v${from + i}` })), people: [], nextCursor: next }) as never;
  it("la nouvelle puce lue pendant « Voir plus » : la liste fraîche est gardée, la page de l'ancien curseur est jetée", () => {
    const reads = createPagedReads();
    let shown = list(0, 60, 60);
    const oldList = reads.startList();
    const page = reads.startPage();
    const fresh = reads.startList();
    // La liste de la nouvelle puce répond d'abord : appliquée.
    expect(fresh()).toBe(true);
    shown = list(100, 5, null);
    // La page de l'ancien filtre répond ensuite : jetée, jamais ajoutée au nouveau résultat.
    expect(page()).toBe(false);
    expect(oldList()).toBe(false);
    expect((shown as { vehicles: unknown[] }).vehicles).toHaveLength(5);
  });
  it("une page ne périme pas la lecture de liste ; seule la dernière page démarrée est appliquée", () => {
    const reads = createPagedReads();
    const l = reads.startList();
    const p1 = reads.startPage();
    const p2 = reads.startPage();
    expect(l()).toBe(true);
    expect(p1()).toBe(false);
    expect(p2()).toBe(true);
    reads.invalidate();
    expect(p2()).toBe(false);
    expect(l()).toBe(false);
  });
});

describe("reviewButtonsOf (souvenir à plusieurs albums)", () => {
  it("un album : « Revoir mes photos » ; deux albums : deux boutons distincts, chacun vers son album", () => {
    expect(reviewButtonsOf([{ albumId: "a1", mediaName: "Sud Cars" }])).toEqual([
      { albumId: "a1", label: "Revoir mes photos" },
    ]);
    const two = reviewButtonsOf([
      { albumId: "a1", mediaName: "Sud Cars" },
      { albumId: "a2", mediaName: "Sud Cars" },
    ]);
    expect(two.map((b) => b.albumId)).toEqual(["a1", "a2"]);
    expect(new Set(two.map((b) => b.label)).size).toBe(2);
    expect(two[0]?.label).toBe("Revoir mes photos · Sud Cars (1)");
  });
  it("rien sans album", () => {
    expect(reviewButtonsOf(undefined)).toEqual([]);
  });
});
