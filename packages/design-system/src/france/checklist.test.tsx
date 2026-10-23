import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepartmentChecklist, departmentRows, foldSearch } from "./DepartmentChecklistWeb";
import { FranceMap } from "./FranceMapWeb";

describe("liste des départements (web) : vraies cases de formulaire", () => {
  const html = renderToStaticMarkup(<DepartmentChecklist selected={["66", "974"]} onValidate={() => undefined} />);

  it("101 cases `department`, libellé « code · nom », outre-mer compris", () => {
    expect(html.match(/<input type="checkbox" name="department"/g)).toHaveLength(101);
    expect(html).toContain("66 · Pyrénées-Orientales");
    expect(html).toContain("2A · Corse-du-Sud");
    expect(html).toContain("974 · La Réunion");
    expect(html).toContain("976 · Mayotte");
  });

  it("l'état coché est dans le HTML (marche sans JavaScript)", () => {
    expect(html).toMatch(/checked="" value="66"/);
    expect(html).toMatch(/checked="" value="974"/);
    expect(html).not.toMatch(/checked="" value="11"/);
    expect(html).toContain("<details");
    expect(html).toContain("Choisir dans une liste");
  });
});

describe("carte (web) : décorative, hors du clavier", () => {
  const html = renderToStaticMarkup(<FranceMap selected={["66"]} favorite="66" onToggle={() => undefined} />);
  it("aria-hidden, aucun tracé n'est un bouton ni ne prend le focus (tabindex -1)", () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="button"');
    expect(html.match(/tabindex="-1"/g)).toHaveLength(96);
    expect(html).not.toContain('tabindex="0"');
  });
});

describe("carte « Ton coin » (web) : France pleine en option", () => {
  it("par défaut, le dessin d'origine ; `land` ajoute la variante dept-land", () => {
    const plain = renderToStaticMarkup(<FranceMap selected={[]} onToggle={() => undefined} />);
    const land = renderToStaticMarkup(<FranceMap selected={[]} onToggle={() => undefined} land />);
    expect(plain).not.toContain("o-france--land");
    expect(land).toContain("o-france--land");
  });
});

describe("fenêtre « Tes départements » : lignes et recherche", () => {
  it("sans recherche : les choisis en tête (dans l'ordre), puis tous les autres", () => {
    const rows = departmentRows(["974", "66"], "");
    expect(rows[0]).toEqual({ kind: "sep", label: "Choisis" });
    expect(rows[1]).toMatchObject({ kind: "dept", choice: { code: "974" } });
    expect(rows[2]).toMatchObject({ kind: "dept", choice: { code: "66" } });
    expect(rows[3]).toEqual({ kind: "sep", label: "Tous les départements" });
    expect(rows.filter((r) => r.kind === "dept")).toHaveLength(101);
  });
  it("recherche sans accents ni casse, par nom ou par numéro", () => {
    const codes = (q: string) => departmentRows([], q).flatMap((r) => (r.kind === "dept" ? [r.choice.code] : []));
    expect(codes("pyrenees")).toEqual(expect.arrayContaining(["66", "64", "65"]));
    expect(codes("2a")).toEqual(["2A"]);
    expect(codes("  Réunion ")).toEqual(["974"]);
    expect(foldSearch("Hérault")).toBe("herault");
  });
});
