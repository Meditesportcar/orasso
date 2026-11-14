import { describe, expect, it } from "vitest";

import { eventPhotosLabels as L } from "../labels/eventPhotos.fr";
import {
  albumsOrder,
  canRepost,
  creditAlbumId,
  creditLine,
  repostCaptionDefault,
  repostRefusal,
  repostWindowOpen,
  showPhotosSection,
} from "./eventPhotos";

const album = (id: string, official: boolean, publishedAt: string) => ({ id, official, publishedAt });

describe("eventPhotos : règles pures (R9g)", () => {
  it("T43 : la section apparaît dès qu'un album publié existe, sinon rien (ni état vide)", () => {
    expect(showPhotosSection([])).toBe(false);
    expect(showPhotosSection(null)).toBe(false);
    expect(showPhotosSection(undefined)).toBe(false);
    expect(showPhotosSection([album("a", false, "2026-11-09T10:00:00Z")])).toBe(true);
  });

  it("l'album officiel d'abord, puis du plus récent ; l'identifiant départage à égalité", () => {
    const list = [
      album("a", false, "2026-11-09T10:00:00Z"),
      album("b", false, "2026-11-10T10:00:00Z"),
      album("c", true, "2026-11-08T10:00:00Z"),
      album("d", false, "2026-11-10T10:00:00Z"),
    ];
    expect(albumsOrder(list).map((x) => x.id)).toEqual(["c", "d", "b", "a"]);
    // L'entrée n'est pas modifiée.
    expect(list[0]?.id).toBe("a");
  });

  it("la légende par défaut d'une reprise est « Photo : <média> »", () => {
    expect(repostCaptionDefault("Objectif 66")).toBe("Photo : Objectif 66");
  });

  it("seule une photo d'ancienne galerie (plaque inconnue) ne peut pas être reprise", () => {
    expect(canRepost("blurred")).toBe(true);
    expect(canRepost("none")).toBe(true);
    expect(canRepost("kept")).toBe(true);
    expect(canRepost("unknown")).toBe(false);
  });

  it("les refus ont leur texte exact", () => {
    expect(repostRefusal("plate_unknown")).toBe("Cette photo d'une ancienne galerie ne peut pas être reprise.");
    expect(repostRefusal("already_reposted")).toBe("Déjà reprise dans le journal.");
    expect(repostRefusal("autre")).toBeNull();
    expect(repostRefusal(undefined)).toBeNull();
  });

  it("le crédit : « Photo : <média> » ; « Voir l'album » seulement tant que l'album est visible", () => {
    const credit = { mediaKey: "m:1", mediaName: "Objectif 66", albumId: "alb" };
    expect(creditLine(credit)).toBe("Photo : Objectif 66");
    expect(creditLine(null)).toBeNull();
    expect(creditAlbumId(credit)).toBe("alb");
    expect(creditAlbumId({ ...credit, albumId: null })).toBeNull();
    expect(creditAlbumId(undefined)).toBeNull();
  });

  it("les libellés de la maquette, au caractère près", () => {
    expect(L.titleWithCount(2)).toBe("Photos · 2 albums");
    expect(L.titleWithCount(1)).toBe("Photos · 1 album");
    expect(L.mediaLine("Objectif 66", 48)).toBe("Objectif 66 · 48 photos");
    expect(L.officialAlbum).toBe("Album officiel");
    expect(L.repostAction).toBe("Reprendre dans le journal de l'événement");
    expect(L.repostHint("Objectif 66")).toBe("Repartage avec le crédit « Photo : Objectif 66 », non retirable");
    expect(L.makeOfficial).toBe("Choisir cet album comme « officiel »");
    expect(L.makeOfficialHint).toBe("Un seul album officiel par événement");
    expect(L.repostedFoot).toBe("repartagée, crédit non retirable");
    expect(L.repostDone("Roues Libres 66", "Objectif 66")).toBe(
      "Repris dans le journal de Roues Libres 66 : crédit Objectif 66 conservé",
    );
    expect(L.manageLine(2, "Objectif 66")).toBe("Photos · 2 albums · officiel : Objectif 66");
    expect(L.manageLine(1, null)).toBe("Photos · 1 album");
    expect(L.publishedTitle("Objectif 66", 48, "Rassemblement JDM")).toBe(
      "Objectif 66 a publié un album de 48 photos · Rassemblement JDM",
    );
  });
});

describe("repostWindowOpen : 30 jours après la publication de l'album", () => {
  const published = "2026-10-01T10:00:00Z";
  it("ouverte jusqu'à 30 jours (borne comprise), fermée au-delà, fermée sans date", () => {
    expect(repostWindowOpen(published, new Date("2026-10-31T10:00:00Z"))).toBe(true);
    expect(repostWindowOpen(published, new Date("2026-10-31T10:00:01Z"))).toBe(false);
    expect(repostWindowOpen(new Date(published), new Date("2026-10-30T10:00:00Z"))).toBe(true);
    expect(repostWindowOpen(null, new Date("2026-10-02T10:00:00Z"))).toBe(false);
  });
  it("le refus de l'API a son texte", () => {
    expect(repostRefusal("repost_expired")).toBe("Cet album a plus de 30 jours : la reprise n'est plus possible.");
  });
});
