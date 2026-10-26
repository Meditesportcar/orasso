// Lot R5b, tour 2 (décision du coordinateur) : l'aide d'un titre de section reste à droite, comme dans l'artefact ; elle
// passe dessous seulement avec une police agrandie, ou si titre + écart + aide ne tiennent pas côte à côte. Rangée =
// largeur de l'écran moins les deux marges de 16 px (384 px : Pixel de Damien ; 390 px : téléphones des recettes).
import { describe, expect, it } from "vitest";

import { secHeadLayout, secHeadSideWidth, secHeadTitleWidth } from "./secHeadLayout";

const row = (screen: number) => screen - 32;
const TITLE = { titleSize: 16, titleWide: true } as const;
const SHORT = { side: "1 autre", sideSize: 12.5 };
const LONG = { side: "Roussillon Drift · 12 membres · fondé en 2019 à Perpignan", sideSize: 12.5 };

describe("titre de section : l'aide à droite, dessous seulement s'il le faut", () => {
  for (const screen of [384, 390]) {
    it(`${screen} px, police ×1 : « Son crew » et « Son garage » gardent une aide courte à droite, titre jamais rétréci`, () => {
      for (const title of ["Son crew", "Son garage"]) {
        const l = secHeadLayout({ ...TITLE, ...SHORT, title, rowWidth: row(screen), fontScale: 1 });
        expect(l.stacked, title).toBe(false);
        // Le titre ne descend jamais sous son estimation (chasse de chaque signe + 10 % d'encre).
        expect(l.titleMinWidth).toBe(secHeadTitleWidth({ ...TITLE, title }));
        expect((l.titleMinWidth ?? 0) + 8 + secHeadSideWidth(SHORT)).toBeLessThanOrEqual(row(screen));
      }
    });

    it(`${screen} px, police ×1 : une aide longue passe dessous ; « Ses sorties à venir » aussi avec une aide moyenne`, () => {
      for (const title of ["Son crew", "Son garage", "Ses sorties à venir"]) {
        expect(secHeadLayout({ ...TITLE, ...LONG, title, rowWidth: row(screen), fontScale: 1 }).stacked, title).toBe(
          true,
        );
      }
      const medium = { side: "2 autres à venir cette saison", sideSize: 12.5 };
      const l = secHeadLayout({
        ...TITLE,
        ...medium,
        title: "Ses sorties à venir",
        rowWidth: row(screen),
        fontScale: 1,
      });
      expect(l).toEqual({ stacked: true, titleMinWidth: null });
      // Avec une aide courte, « Ses sorties à venir » tient encore à côté.
      expect(
        secHeadLayout({
          ...TITLE,
          side: "3 à venir",
          title: "Ses sorties à venir",
          rowWidth: row(screen),
          fontScale: 1,
        }).stacked,
      ).toBe(false);
    });

    it(`${screen} px, police ×1,3 : l'aide passe toujours dessous, courte ou longue`, () => {
      for (const title of ["Son crew", "Son garage", "Ses sorties à venir"]) {
        for (const side of [SHORT, LONG]) {
          expect(secHeadLayout({ ...TITLE, ...side, title, rowWidth: row(screen), fontScale: 1.3 })).toEqual({
            stacked: true,
            titleMinWidth: null,
          });
        }
      }
    });
  }

  it("sans aide : le titre a toute la rangée, rien à décider", () => {
    expect(secHeadLayout({ ...TITLE, title: "Son garage", side: null, rowWidth: 352, fontScale: 1.3 })).toEqual({
      stacked: false,
      titleMinWidth: null,
    });
  });

  it("le titre est estimé large : au-dessus de la moyenne de 0,92 corps par signe pour « SON CREW » (W, C, R)", () => {
    expect(secHeadTitleWidth({ ...TITLE, title: "Son crew" })).toBeGreaterThan(8 * 0.92 * 16);
    // Un titre en texte courant (sections des personnes de l'Explorer) est plus étroit qu'en Archivo large.
    expect(secHeadTitleWidth({ title: "Crews près de chez toi", titleSize: 14.5, titleWide: false })).toBeLessThan(
      secHeadTitleWidth({ title: "Crews près de chez toi", titleSize: 14.5 }),
    );
  });
});
