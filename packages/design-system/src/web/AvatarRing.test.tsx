import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarRing } from "./components/AvatarRing";

describe("AvatarRing (lot R7b1)", () => {
  it("un anneau par état, une taille par classe, l'initiale sans photo, pas de texte dans l'anneau", () => {
    for (const ring of ["followers", "crew", "live", "seen"] as const) {
      expect(renderToStaticMarkup(<AvatarRing ring={ring} name="Kenji_66" />)).toContain(`o-avring--${ring}`);
    }
    expect(renderToStaticMarkup(<AvatarRing ring={null} name="Kenji_66" />)).not.toMatch(
      /o-avring--(followers|crew|live|seen)/,
    );
    expect(renderToStaticMarkup(<AvatarRing size="xl" name="Kenji_66" />)).toContain("o-avring--xl");
    const plain = renderToStaticMarkup(<AvatarRing name="kenji_66" />);
    expect(plain).toContain(">K<");
    expect(plain).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<AvatarRing name="Kenji_66" src="/p.webp" />)).toContain('<img src="/p.webp"');
  });

  it("avec un lien : un lien nommé ; sans lien : décoratif", () => {
    const link = renderToStaticMarkup(
      <AvatarRing name="Kenji_66" href="/story/u:1" label="Voir les stories de Kenji_66" />,
    );
    expect(link).toContain('<a class="o-avring');
    expect(link).toContain('aria-label="Voir les stories de Kenji_66"');
  });

  it("jetons seulement : encre, brique (win), moutarde (accent), ligne ; le live est le seul néon", () => {
    const css = readFileSync(resolve(import.meta.dirname, "components/AvatarRing.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(css).toContain("--avring-color: var(--ink)");
    expect(css).toContain("--avring-color: var(--win)");
    expect(css).toContain("--avring-color: var(--accent)");
    expect(css.match(/neon/g)?.length).toBe(1);
  });

  it("tailles de la maquette : 40, 56, 64 et 88 px, les mêmes que l'appli", () => {
    const css = readFileSync(resolve(import.meta.dirname, "components/AvatarRing.css"), "utf8");
    for (const [size, px] of [
      ["sm", 40],
      ["md", 56],
      ["lg", 64],
      ["xl", 88],
    ] as const) {
      // Lu sans dépendre de la mise en forme (le formateur écrit une déclaration par ligne).
      const rule = css.replace(/\s+/g, " ");
      expect(rule).toContain(`.o-avring--${size} { --avring-box: ${px}px;`);
    }
    const native = readFileSync(resolve(import.meta.dirname, "../native/AvatarRing.tsx"), "utf8");
    for (const px of [40, 56, 64, 88]) expect(native).toContain(`box: ${px},`);
  });
});
