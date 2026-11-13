import { describe, expect, it } from "vitest";

import { albumTagLabels as L } from "../labels/albumTags.fr";
import { albumViewerRoleOf, mentionsSummary, myPhotoTaggedBy, taggedByText, whoLabelOf } from "./albumTagView";

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
