import { describe, expect, it } from "vitest";

import { cardPoster, heroPoster } from "./poster";

describe("vignettes : affiche générée ou gabarit « Minimal » (lot 44)", () => {
  it("la carte prend l'affiche générée, jamais l'affiche perso", () => {
    expect(cardPoster({ generatedPosterUrl: "/api/files/post.png" })).toBe("/api/files/post.png");
    expect(cardPoster({ generatedPosterUrl: null })).toBeNull();
  });

  it("la fiche met l'affiche générée en vedette, sinon le gabarit", () => {
    expect(heroPoster({ poster: { postUrl: "/p.png", storyUrl: "/s.png", style: "neon" } })).toBe("/p.png");
    expect(heroPoster({ poster: null })).toBeNull();
  });
});
