import { describe, expect, it } from "vitest";

import { storyPublishLabels as L } from "./storyPublish.fr";
import { storyVideoLabels as V } from "./storyVideo.fr";

describe("fin de la publication d'une story (lot B3a)", () => {
  it("le verbe s'accorde au public : « la voient » au pluriel, « la voit » pour le crew", () => {
    expect(L.doneText("followers")).toBe("Tes abonnés la voient pendant 24 h. Plaque traitée.");
    expect(L.doneText("public")).toBe("Tous les membres la voient pendant 24 h. Plaque traitée.");
    expect(L.doneText("crew")).toBe("Ton crew la voit pendant 24 h. Plaque traitée.");
  });

  it("la story vidéo dit la même chose", () => {
    expect(V.doneText("followers")).toMatch(/^Tes abonnés la voient pendant 24 h\./);
    expect(V.doneText("public")).toMatch(/^Tous les membres la voient pendant 24 h\./);
    expect(V.doneText("crew")).toMatch(/^Ton crew la voit pendant 24 h\./);
  });
});
