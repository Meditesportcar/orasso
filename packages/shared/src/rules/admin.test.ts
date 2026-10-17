import { describe, expect, it } from "vitest";

import { adminSettingSchemas } from "../schemas/admin";
import {
  adminSettingDefaults,
  assistanceActive,
  assistanceExpiresAt,
  DEFAULT_POINTS_CONFIG,
  knownCodes,
  thresholdsProblem,
} from "./admin";
import { markdownToHtml, markdownToText } from "./markdown";
import { gradeFor } from "./misc";
import { carryoverPoints, nextGrade, POINTS } from "./points";

describe("réglages de l'administration", () => {
  it("les valeurs par défaut sont les constantes en vigueur", () => {
    expect(DEFAULT_POINTS_CONFIG).toMatchObject({ participation: POINTS.participation, malus: POINTS.malus });
    for (const [key, schema] of Object.entries(adminSettingSchemas)) {
      expect(schema.safeParse(adminSettingDefaults[key as keyof typeof adminSettingDefaults]).success).toBe(true);
    }
  });

  it("refuse une valeur invalide, clé par clé", () => {
    expect(adminSettingSchemas["points.malus"].safeParse(5).success).toBe(false);
    expect(adminSettingSchemas["points.malus"].safeParse(-15).success).toBe(true);
    expect(adminSettingSchemas["points.participation"].safeParse(2.5).success).toBe(false);
    expect(adminSettingSchemas["signup.enabled"].safeParse("oui").success).toBe(false);
    expect(
      adminSettingSchemas["grades.thresholds"].safeParse({ rodage: 0, route: 100, sport: 90, circuit: 400, legende: 800 })
        .success,
    ).toBe(false);
    expect(adminSettingSchemas["lists.refusal_reasons"].safeParse(["full"]).success).toBe(false);
    expect(adminSettingSchemas["lists.refusal_reasons"].safeParse(["full", "other"]).success).toBe(true);
    expect(adminSettingSchemas["lists.refusal_reasons"].safeParse(["full", "full", "other"]).success).toBe(false);
    expect(adminSettingSchemas["lists.vendor_types"].safeParse(["inconnu"]).success).toBe(false);
    expect(thresholdsProblem({ rodage: 5, route: 100, sport: 300, circuit: 400, legende: 800 })).not.toBeNull();
  });

  it("les grades suivent les seuils fournis", () => {
    const t = { rodage: 0, route: 50, sport: 150, circuit: 300, legende: 600 };
    expect(gradeFor(60, t)).toBe("route");
    expect(gradeFor(60)).toBe("rodage");
    expect(nextGrade(60, t)).toEqual({ grade: "sport", threshold: 150 });
    expect(carryoverPoints(200, t)).toBe(50);
  });

  it("garde seulement les codes connus, sinon la liste complète", () => {
    expect(knownCodes(["b", "x"], ["a", "b"] as const)).toEqual(["b"]);
    expect(knownCodes(undefined, ["a", "b"] as const)).toEqual(["a", "b"]);
  });

  it("une demande d'aide ouvre l'intervention pendant 7 jours", () => {
    const at = new Date("2026-10-17T10:00:00Z");
    expect(assistanceExpiresAt(at).toISOString()).toBe("2026-10-24T10:00:00.000Z");
    expect(assistanceActive({ status: "open", createdAt: at }, new Date("2026-10-24T09:59:00Z"))).toBe(true);
    expect(assistanceActive({ status: "open", createdAt: at }, new Date("2026-10-24T10:00:00Z"))).toBe(false);
    expect(assistanceActive({ status: "closed", createdAt: at }, at)).toBe(false);
  });
});

describe("Markdown de la newsletter", () => {
  it("met en forme sans laisser passer de HTML", () => {
    const html = markdownToHtml(
      "# Titre\n\nBonjour **à tous**, *voici* la suite.\n- un\n- deux\n\n[Orasso](https://orasso.fr) <script>x</script> [x](javascript:alert(1))",
    );
    expect(html).toContain("<h1>Titre</h1>");
    expect(html).toContain("<strong>à tous</strong>");
    expect(html).toContain("<em>voici</em>");
    expect(html).toContain("<ul><li>un</li><li>deux</li></ul>");
    expect(html).toContain('<a href="https://orasso.fr">Orasso</a>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript');
  });

  it("version texte lisible", () => {
    expect(markdownToText("## Info\n\nVoir [le site](https://orasso.fr) **vite**")).toBe(
      "Info\n\nVoir le site (https://orasso.fr) vite",
    );
  });
});
