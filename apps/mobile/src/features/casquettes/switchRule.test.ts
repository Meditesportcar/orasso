import { describe, expect, it } from "vitest";

import { hasDraft, type SwitchState, switchToStory } from "./switchRule";

const empty: SwitchState = { photos: 0, caption: "", eventId: null, offerOn: false, busy: false, uncertain: false };

describe("switchToStory : « Publication → Story »", () => {
  it("rien de saisi : on passe", () => {
    expect(switchToStory(empty)).toBe("go");
  });
  it("un brouillon (photos, légende, rattachement) demande confirmation avant d'être abandonné", () => {
    expect(switchToStory({ ...empty, photos: 1 })).toBe("confirm");
    expect(switchToStory({ ...empty, caption: "  salut " })).toBe("confirm");
    expect(switchToStory({ ...empty, eventId: "e1" })).toBe("confirm");
    expect(hasDraft({ ...empty, caption: "   " })).toBe(false);
  });
  it("le départ d'une offre R9c (étiquette « Offre » cochée) compte comme un brouillon", () => {
    expect(switchToStory({ ...empty, offerOn: true })).toBe("confirm");
  });
  it("le segment est inactif pendant un envoi incertain ou en cours, brouillon ou non", () => {
    expect(switchToStory({ ...empty, uncertain: true })).toBe("locked");
    expect(switchToStory({ ...empty, photos: 2, uncertain: true })).toBe("locked");
    expect(switchToStory({ ...empty, busy: true })).toBe("locked");
  });
  it("aller-retour Publication → Story → Publication : un brouillon confirmé repart de zéro, l'écran vide passe sans question", () => {
    // Aller : rien à perdre → go ; le brouillon abandonné après confirmation laisse un écran vide, qui repasse sans question.
    expect(switchToStory(empty)).toBe("go");
    expect(switchToStory({ ...empty, photos: 3, caption: "x" })).toBe("confirm");
  });
});
