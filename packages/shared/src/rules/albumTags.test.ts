import { describe, expect, it } from "vitest";

import { albumTagLabels } from "../labels/albumTags.fr";
import { albumTagCreateSchema, albumTagRemoveSchema, taggableQuerySchema } from "../schemas/albumTags";
import {
  albumCreditLine,
  canSavePhoto,
  canSeeTag,
  canTagAlbum,
  declinedByInterested,
  removalNotifies,
  storyPlateOfAlbumPhoto,
  tagDeclinedTitle,
  tagNotificationTitle,
  tagPseudoShown,
  tagRemovalKind,
} from "./albumTags";

const rel = (over: Partial<Parameters<typeof canSeeTag>[1]> = {}) => ({
  self: false,
  mediaAuthor: false,
  manager: false,
  followerAccepted: false,
  ...over,
});

describe("identification : qui peut identifier", () => {
  it("le média et l'organisateur identifient toute cible, l'intéressé seulement la sienne", () => {
    expect(canTagAlbum("media", "m", { ownerId: "x" })).toBe(true);
    expect(canTagAlbum("organizer", "o", { ownerId: "x" })).toBe(true);
    expect(canTagAlbum("owner", "x", { ownerId: "x" })).toBe(true);
    expect(canTagAlbum("owner", "y", { ownerId: "x" })).toBe(false);
  });
});

describe("identification : qui la voit (T5)", () => {
  it("sans session : jamais, compte public ou privé", () => {
    expect(canSeeTag({ hasSession: false, accountPrivate: false }, rel({ self: true }))).toBe(false);
    expect(canSeeTag({ hasSession: false, accountPrivate: true }, rel({ self: true }))).toBe(false);
  });
  it("compte public : tout membre connecté", () => {
    expect(canSeeTag({ hasSession: true, accountPrivate: false }, rel())).toBe(true);
  });
  it("compte privé : lui, le média auteur, les responsables, un abonné accepté ; personne d'autre", () => {
    const at = { hasSession: true, accountPrivate: true };
    expect(canSeeTag(at, rel())).toBe(false);
    expect(canSeeTag(at, rel({ self: true }))).toBe(true);
    expect(canSeeTag(at, rel({ mediaAuthor: true }))).toBe(true);
    expect(canSeeTag(at, rel({ manager: true }))).toBe(true);
    expect(canSeeTag(at, rel({ followerAccepted: true }))).toBe(true);
  });
  it("le pseudo d'une voiture d'un compte privé ne se montre ni au média ni à l'organisateur", () => {
    const priv = { kind: "vehicle" as const, accountPrivate: true };
    expect(tagPseudoShown(priv, { self: false, followerAccepted: false })).toBe(false);
    expect(tagPseudoShown(priv, { self: true, followerAccepted: false })).toBe(true);
    expect(tagPseudoShown(priv, { self: false, followerAccepted: true })).toBe(true);
    expect(tagPseudoShown({ kind: "vehicle", accountPrivate: false }, { self: false, followerAccepted: false })).toBe(
      true,
    );
    // Une identification par pseudo : celui qui l'a posée connaissait le pseudo.
    expect(tagPseudoShown({ kind: "user", accountPrivate: true }, { self: false, followerAccepted: false })).toBe(true);
  });
});

describe("identification : le geste de retrait (T41)", () => {
  const tag = { userId: "dam", taggedBy: "leo", taggedAs: "media" as const };
  it("l'intéressé : « Ce n'est pas ma voiture » si un autre l'a posée, « Retirer mon identification » si c'est lui", () => {
    expect(tagRemovalKind(tag, { id: "dam", isMediaAuthor: false, isOrganizer: false })).toBe("not_mine");
    expect(
      tagRemovalKind(
        { userId: "dam", taggedBy: "dam", taggedAs: "owner" },
        { id: "dam", isMediaAuthor: false, isOrganizer: false },
      ),
    ).toBe("withdraw");
  });
  it("celui qui l'a posée la retire en tant que média ou organisateur, personne d'autre", () => {
    expect(tagRemovalKind(tag, { id: "leo", isMediaAuthor: true, isOrganizer: false })).toBe("tagger");
    expect(tagRemovalKind(tag, { id: "orga", isMediaAuthor: false, isOrganizer: true })).toBeNull();
    expect(
      tagRemovalKind({ ...tag, taggedAs: "organizer" }, { id: "orga", isMediaAuthor: false, isOrganizer: true }),
    ).toBe("tagger");
    expect(tagRemovalKind(tag, { id: "kenji", isMediaAuthor: false, isOrganizer: false })).toBeNull();
  });
  it("seul « Ce n'est pas ma voiture » prévient ; une identification retirée par l'intéressé est définitive pour les autres", () => {
    expect(removalNotifies("not_mine")).toBe(true);
    expect(removalNotifies("withdraw")).toBe(false);
    expect(removalNotifies("tagger")).toBe(false);
    expect(declinedByInterested("not_mine")).toBe(true);
    expect(declinedByInterested("withdraw")).toBe(true);
    expect(declinedByInterested("tagger")).toBe(false);
    expect(declinedByInterested(null)).toBe(false);
  });
});

describe("identification : les titres de notification (T40)", () => {
  it("par voiture et par pseudo, avec l'accord en nombre", () => {
    expect(
      tagNotificationTitle({
        kind: "vehicle",
        mediaName: "Sud Cars",
        count: 6,
        vehicleLabel: "Toyota GR Supra",
        eventTitle: "Rassemblement de la Côte Vermeille",
      }),
    ).toBe("Sud Cars a publié 6 photos de ta Toyota GR Supra au Rassemblement de la Côte Vermeille");
    expect(
      tagNotificationTitle({
        kind: "vehicle",
        mediaName: "Sud Cars",
        count: 1,
        vehicleLabel: "Supra",
        eventTitle: "R",
      }),
    ).toBe("Sud Cars a publié 1 photo de ta Supra au R");
    expect(
      tagNotificationTitle({ kind: "user", mediaName: "Sud Cars", count: 3, vehicleLabel: null, eventTitle: "R" }),
    ).toBe("Sud Cars t'a identifié sur 3 photos au R");
  });
  it("« ce n'est pas ma voiture » : jamais le pseudo d'un compte privé", () => {
    expect(tagDeclinedTitle({ kind: "vehicle", pseudo: "Lea_11", albumTitle: "Album" })).toBe(
      "Lea_11 dit que ce n'est pas sa voiture · Album",
    );
    expect(tagDeclinedTitle({ kind: "vehicle", pseudo: null, albumTitle: "Album" })).toBe(
      `${albumTagLabels.declinedWho} dit que ce n'est pas sa voiture · Album`,
    );
  });
});

describe("« En story » et « Enregistrer »", () => {
  it("la plaque de la copie (T38)", () => {
    expect(storyPlateOfAlbumPhoto("blurred")).toEqual({ ok: true, plate: "blurred", blur: false });
    expect(storyPlateOfAlbumPhoto("none")).toEqual({ ok: true, plate: "none_confirmed", blur: false });
    expect(storyPlateOfAlbumPhoto("kept")).toEqual({ ok: true, plate: "blurred", blur: true });
    expect(storyPlateOfAlbumPhoto("unknown")).toEqual({ ok: false, reason: "plate_unknown" });
  });
  it("« Enregistrer » : au choix du média, toujours pour lui", () => {
    expect(canSavePhoto({ allowSave: false, isMediaAuthor: false })).toBe(false);
    expect(canSavePhoto({ allowSave: true, isMediaAuthor: false })).toBe(true);
    expect(canSavePhoto({ allowSave: false, isMediaAuthor: true })).toBe(true);
    expect(albumCreditLine("Sud Cars")).toBe("Photos : Sud Cars");
  });
});

describe("identification : schémas", () => {
  it("une voiture OU une personne, jamais les deux ni rien", () => {
    const id = "6f1c1c1e-3a35-4b6f-9d3c-1f9d0a3c7d11";
    expect(albumTagCreateSchema.safeParse({ vehicleId: id }).success).toBe(true);
    expect(albumTagCreateSchema.safeParse({ userId: "abc" }).success).toBe(true);
    expect(albumTagCreateSchema.safeParse({ vehicleId: id, userId: "abc" }).success).toBe(false);
    expect(albumTagCreateSchema.safeParse({}).success).toBe(false);
    expect(albumTagCreateSchema.safeParse({ vehicleId: "pas-un-uuid" }).success).toBe(false);
  });
  it("le retrait : motif facultatif, deux valeurs", () => {
    expect(albumTagRemoveSchema.safeParse({}).success).toBe(true);
    expect(albumTagRemoveSchema.safeParse({ reason: "not_mine" }).success).toBe(true);
    expect(albumTagRemoveSchema.safeParse({ reason: "tagger" }).success).toBe(false);
  });
  it("la recherche : le texte est nettoyé, la limite bornée", () => {
    expect(taggableQuerySchema.parse({ q: "  ke " }).q).toBe("ke");
    expect(taggableQuerySchema.parse({ q: "   " }).q).toBeUndefined();
    expect(taggableQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });
});
