import { describe, expect, it } from "vitest";

import { albumLabels } from "../labels/albums.fr";
import { ALBUM_MAX_PHOTOS, albumPhotoAddSchema } from "../schemas";
import {
  albumCardLabel,
  albumIssue,
  albumTitle,
  blurredCount,
  canAddPhoto,
  compareAlbums,
  draftPurgeBefore,
  isDraftExpired,
  sortAlbums,
} from "./albums";

describe("albums : règles pures", () => {
  it("le plafond est de 200 photos : la 200e passe, la 201e non", () => {
    expect(ALBUM_MAX_PHOTOS).toBe(200);
    expect(canAddPhoto(0)).toEqual({ ok: true });
    expect(canAddPhoto(199)).toEqual({ ok: true });
    expect(canAddPhoto(200)).toEqual({ ok: false, reason: "album_full" });
    expect(canAddPhoto(250)).toEqual({ ok: false, reason: "album_full" });
  });

  it("un album sans photo n'est pas publiable", () => {
    expect(albumIssue({ photosCount: 0 })).toBe("album_empty");
    expect(albumIssue({ photosCount: 1 })).toBeNull();
  });

  it("le titre servi est celui du média, sinon « Les photos du <événement> »", () => {
    expect(albumTitle("Mon récit", "Rassemblement du Lydia")).toBe("Mon récit");
    expect(albumTitle(null, "Rassemblement du Lydia")).toBe("Les photos du Rassemblement du Lydia");
    expect(albumTitle("   ", "Rassemblement du Lydia")).toBe("Les photos du Rassemblement du Lydia");
  });

  it("la mention de la carte : « 48 photos », « 1 photo » (le singulier va jusqu'à 1)", () => {
    expect(albumCardLabel(48)).toBe("48 photos");
    expect(albumCardLabel(1)).toBe("1 photo");
    expect(albumCardLabel(0)).toBe("0 photo");
    expect(albumLabels.cardLine("Les photos du Lydia", 48)).toBe("Les photos du Lydia · 48 photos");
  });

  it("un brouillon est périmé au bout de 7 jours, à la milliseconde près", () => {
    const now = new Date("2026-11-13T10:00:00Z");
    expect(draftPurgeBefore(now).toISOString()).toBe("2026-11-06T10:00:00.000Z");
    expect(isDraftExpired(new Date("2026-11-06T10:00:00Z"), now)).toBe(true);
    expect(isDraftExpired(new Date("2026-11-06T10:00:00.001Z"), now)).toBe(false);
  });

  it("compte les photos floutées", () => {
    expect(blurredCount(["blurred", "none", "kept", "blurred", "unknown"])).toBe(2);
    expect(albumLabels.photosAndPlates(48, 2)).toBe("48 photos · 2 plaques floutées");
    expect(albumLabels.photosAndPlates(1, 1)).toBe("1 photo · 1 plaque floutée");
  });

  it("tri : l'officiel en tête, puis du plus récent au plus ancien, puis l'identifiant", () => {
    const a = { id: "a", official: false, publishedAt: "2026-11-10T00:00:00Z" };
    const b = { id: "b", official: false, publishedAt: "2026-11-12T00:00:00Z" };
    const c = { id: "c", official: true, publishedAt: "2026-11-01T00:00:00Z" };
    const d = { id: "d", official: false, publishedAt: "2026-11-12T00:00:00Z" };
    expect(sortAlbums([a, b, c, d]).map((x) => x.id)).toEqual(["c", "d", "b", "a"]);
    expect(compareAlbums(a, a)).toBe(0);
  });

  it("le schéma d'ajout : cadres obligatoires pour blurred/kept, interdits pour none", () => {
    const clientId = "7d3f5b0e-6a0f-4a39-9e3a-1c4d8f2a9b11";
    const rect = [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }];
    const base = { uploadKey: "private/album-uploads/x.webp", clientId };
    expect(albumPhotoAddSchema.safeParse({ ...base, plateDecision: "none" }).success).toBe(true);
    expect(albumPhotoAddSchema.safeParse({ ...base, plateDecision: "none", plateRects: rect }).success).toBe(false);
    expect(albumPhotoAddSchema.safeParse({ ...base, plateDecision: "blurred" }).success).toBe(false);
    expect(albumPhotoAddSchema.safeParse({ ...base, plateDecision: "kept", plateRects: rect }).success).toBe(true);
    expect(albumPhotoAddSchema.safeParse({ ...base, plateDecision: "blurred", plateRects: rect }).success).toBe(true);
    expect(albumPhotoAddSchema.safeParse({ ...base, plateDecision: "maybe" }).success).toBe(false);
  });
});
