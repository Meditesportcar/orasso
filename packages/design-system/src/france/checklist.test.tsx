import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepartmentChecklist } from "./DepartmentChecklistWeb";
import { FranceMap } from "./FranceMapWeb";

describe("liste des départements (web) : vraies cases de formulaire", () => {
  const html = renderToStaticMarkup(<DepartmentChecklist selected={["66", "974"]} onToggle={() => undefined} />);

  it("101 cases `department`, libellé « code · nom », outre-mer compris", () => {
    expect(html.match(/<input type="checkbox" name="department"/g)).toHaveLength(101);
    expect(html).toContain("66 · Pyrénées-Orientales");
    expect(html).toContain("2A · Corse-du-Sud");
    expect(html).toContain("974 · La Réunion");
    expect(html).toContain("976 · Mayotte");
  });

  it("l'état coché est dans le HTML (marche sans JavaScript) et l'ordre du choix est gardé", () => {
    expect(html).toMatch(/checked="" value="66"/);
    expect(html).toMatch(/checked="" value="974"/);
    expect(html).not.toMatch(/checked="" value="11"/);
    expect(html).toContain('name="departmentOrder" value="66,974"');
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
