// Le rendu des tutos passe par React Native (non chargé ici) : ces tests lisent le code des diapos pour vérifier que
// chaque tuto a exactement une illustration par diapo de texte, et le texte pour vérifier le « sans genre ».
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mainProfiles, tutoArt, tutoSlides } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { tutoKeysAfterArrival } from "./model";

const here = dirname(fileURLToPath(import.meta.url));

describe("une illustration par diapo", () => {
  for (const profile of mainProfiles) {
    it(`${profile} : autant d'illustrations que de textes, toutes définies dans le fichier`, () => {
      const source = readFileSync(join(here, "slides", `${profile}.tsx`), "utf8");
      const list = source.match(/export const \w+Slides = \[([^\]]*)\]/);
      const names = (list?.[1] ?? "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      expect(names.length).toBe(tutoSlides[profile].length);
      for (const name of names) expect(source, name).toMatch(new RegExp(`function ${name}\\(`));
      expect(new Set(names).size).toBe(names.length);
    });
  }
});

describe("textes des illustrations, au tu et sans genre", () => {
  it("aucun accord genré sur la personne (visiteuse, retenu, accréditée…)", () => {
    const all = JSON.stringify([tutoArt, tutoSlides]);
    for (const word of ["Visiteuse", "Retenu,", "Retenus", "Accréditée", "Il peut le contester"]) {
      expect(all, word).not.toContain(word);
    }
  });
});

describe("clés posées à la fin du tuto d'arrivée", () => {
  it("le profil et la barre visiteur, une fois chacun (aucune tuile « Nouveau » juste après)", () => {
    expect(tutoKeysAfterArrival("pro")).toEqual(["tuto:pro", "tuto:visitor"]);
    expect(tutoKeysAfterArrival("visitor")).toEqual(["tuto:visitor"]);
    expect(tutoKeysAfterArrival("exhibitor")).toEqual(["tuto:exhibitor", "tuto:visitor"]);
  });
});
