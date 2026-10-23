// Nuancier du site (lot M1, tour 2) : la teinte choisie part dans un champ indépendant de la famille affichée.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ColorPicker } from "./ColorPicker";

const fields = (html: string) => [...html.matchAll(/<input[^>]*name="color"[^>]*>/g)].map((m) => m[0]);

describe("ColorPicker", () => {
  it("un seul champ « color », caché, qui porte la teinte choisie ; les pastilles ont un autre nom", () => {
    const html = renderToStaticMarkup(<ColorPicker value="Rouge vif" custom={false} onChange={() => undefined} />);
    const color = fields(html);
    expect(color).toHaveLength(1);
    expect(color[0]).toContain('type="hidden"');
    expect(color[0]).toContain('value="Rouge vif"');
    expect(html).toContain('name="colorSwatch"');
  });

  it("le champ ne dépend pas des pastilles montrées : il est là même sans pastille de sa famille", () => {
    // La famille affichée est celle de la teinte au premier rendu ; le champ caché est posé hors de la grille, il
    // reste quand on change de famille (la grille seule est remplacée).
    const html = renderToStaticMarkup(<ColorPicker value="Rouge vif" custom={false} onChange={() => undefined} />);
    const hidden = html.indexOf('name="color"');
    const grid = html.indexOf('class="g-swatches"');
    expect(hidden).toBeGreaterThan(-1);
    expect(grid).toBeGreaterThan(hidden);
  });

  it("« Autre teinte » : la saisie libre porte le champ", () => {
    const html = renderToStaticMarkup(<ColorPicker value="Bleu Laguna" custom onChange={() => undefined} />);
    const color = fields(html);
    expect(color).toHaveLength(1);
    expect(color[0]).not.toContain('type="hidden"');
    expect(color[0]).toContain('value="Bleu Laguna"');
  });

  it("rien de choisi : le champ part vide", () => {
    const html = renderToStaticMarkup(<ColorPicker value="" custom={false} onChange={() => undefined} />);
    expect(fields(html)[0]).toContain('value=""');
  });
});
