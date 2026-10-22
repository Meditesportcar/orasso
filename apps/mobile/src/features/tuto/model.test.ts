import { mainProfiles, tutoArt, tutoLabels, tutoProfileNames, tutoSlides } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  balanceTitle,
  parseTutoProfile,
  replayProfiles,
  stepIndex,
  titleCharsFor,
  tutoProfileOfPersona,
  tutoSeenKey,
} from "./model";

describe("les six tutos", () => {
  it("ont le nombre de diapos du prototype : 7, 6, 4, 6, 4, 4 (31)", () => {
    const counts = Object.fromEntries(mainProfiles.map((p) => [p, tutoSlides[p].length]));
    expect(counts).toEqual({ exhibitor: 7, visitor: 6, pro: 4, organizer: 6, provider: 4, media: 4 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(31);
  });

  it("chaque diapo a un jour, un titre et un texte, au « tu » (jamais « votre », « vos » ni « vous êtes »)", () => {
    for (const p of mainProfiles) {
      for (const slide of tutoSlides[p]) {
        expect(slide.day.length, `${p} jour`).toBeGreaterThan(0);
        expect(slide.title.length, `${p} titre`).toBeGreaterThan(0);
        expect(slide.text.length, `${p} texte`).toBeGreaterThan(0);
        expect(`${slide.title} ${slide.text}`, `${p} « ${slide.title} »`).not.toMatch(
          /\b(votre|vos|vous (êtes|avez|pouvez|devez))\b/i,
        );
      }
    }
  });

  it("la diapo sociale ne concerne que l'exposant et le visiteur (à revoir avec Damien)", () => {
    const social = (p: (typeof mainProfiles)[number]) => tutoSlides[p].some((s) => s.title === "Tu retrouves ta bande");
    expect(mainProfiles.filter(social)).toEqual(["exhibitor", "visitor"]);
  });

  it("les premières et dernières diapos sont celles du prototype", () => {
    expect(tutoSlides.exhibitor[0]?.title).toBe("Tu trouves un rasso");
    expect(tutoSlides.exhibitor.at(-1)?.title).toBe("Tu retrouves ta bande");
    expect(tutoSlides.visitor[0]?.title).toBe("Tu trouves une expo");
    expect(tutoSlides.pro[0]?.title).toBe("Tu montes la fiche de ton atelier");
    expect(tutoSlides.organizer.at(-1)?.title).toBe("Les points partent tout seuls");
    expect(tutoSlides.provider.at(-1)?.title).toBe("Les avis font ta vitrine");
    expect(tutoSlides.media[0]?.title).toBe("Tu repères quoi couvrir");
  });

  it("le tuto de la candidature suit le parcours : garage, règlement, envoi, « En attente » (v20)", () => {
    const apply = tutoSlides.exhibitor[1]?.text ?? "";
    expect(apply).toContain("garage");
    expect(apply).toContain("règlement");
    expect(tutoArt.garage.wait).toBe("En attente");
  });

  it("les libellés des boutons sont ceux du prototype", () => {
    expect([tutoLabels.skip, tutoLabels.next, tutoLabels.start]).toEqual(["Passer", "Suivant", "C'est parti"]);
    expect(mainProfiles.map((p) => tutoProfileNames[p])).toEqual([
      "Exposant",
      "Visiteur",
      "Pro de l'auto",
      "Organisateur",
      "Prestataire",
      "Média",
    ]);
  });
});

describe("profils et navigation du tuto", () => {
  it("reconnaît un profil, refuse le reste", () => {
    expect(parseTutoProfile("pro")).toBe("pro");
    expect(parseTutoProfile(["media"])).toBe("media");
    expect(parseTutoProfile("admin")).toBeNull();
    expect(parseTutoProfile(undefined)).toBeNull();
  });

  it("la clé mémorisée est tuto:<profil>", () => {
    expect(tutoSeenKey("exhibitor")).toBe("tuto:exhibitor");
  });

  it("l'ancienne casquette « passionné » joue le tuto de l'exposant", () => {
    expect(tutoProfileOfPersona("fan")).toBe("exhibitor");
    expect(tutoProfileOfPersona("organizer")).toBe("organizer");
    expect(tutoProfileOfPersona("admin")).toBeNull();
  });

  it("Revoir le tuto : le profil choisi d'abord, puis les autres casquettes, une fois chacune", () => {
    expect(replayProfiles(["fan", "pro"], "exhibitor")).toEqual(["exhibitor", "pro"]);
    expect(replayProfiles(["visitor", "organizer", "pro"], "pro")).toEqual(["pro", "visitor", "organizer"]);
    expect(replayProfiles(["fan"], null)).toEqual(["exhibitor"]);
    expect(replayProfiles([], null)).toEqual(["visitor"]);
  });

  it("les flèches restent dans les bornes des diapos", () => {
    expect(stepIndex(0, -1, 7)).toBe(0);
    expect(stepIndex(0, 1, 7)).toBe(1);
    expect(stepIndex(6, 1, 7)).toBe(6);
  });
});

describe("titres équilibrés (text-wrap: balance)", () => {
  it("coupe en lignes voisines, au même nombre de lignes", () => {
    expect(balanceTitle("Tu trouves un rasso", 16)).toBe("Tu trouves\nun rasso");
    expect(balanceTitle("Des points et des souvenirs", 16)).toBe("Des points et\ndes souvenirs");
    expect(balanceTitle("Tes points t'ouvrent des remises", 16)).toBe("Tes points\nt'ouvrent\ndes remises");
    expect(balanceTitle("Court", 16)).toBe("Court");
  });
});

describe("titres équilibrés à la largeur de l'appareil (360 px, police agrandie)", () => {
  it("aucune ligne ne dépasse ce qui tient : pas de mot rejeté seul par un retour automatique", () => {
    for (const [width, scale] of [
      [390, 1],
      [360, 1],
      [360, 1.3],
    ] as const) {
      const max = titleCharsFor(width, scale);
      for (const profile of mainProfiles)
        for (const slide of tutoSlides[profile])
          for (const line of balanceTitle(slide.title, max).split("\n"))
            expect(line.length <= max || !line.includes(" "), `${slide.title} @ ${width}/${scale} : « ${line} »`).toBe(
              true,
            );
    }
  });
  it("360 px tient moins de caractères que 390 px", () => {
    expect(titleCharsFor(390, 1)).toBe(17);
    expect(titleCharsFor(360, 1)).toBeLessThan(17);
    expect(titleCharsFor(360, 1.3)).toBeLessThan(titleCharsFor(360, 1));
  });
});
