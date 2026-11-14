import { describe, expect, it, vi } from "vitest";

// Le vrai registre (`registry.ts`) avec ses vraies lignes R9f (`TagActions`) et R9g (`OrganizerActions`) : seuls les modules d'écran
// (react-native, design-system, routeur, API, feuilles) sont remplacés par des coquilles, car aucune action n'est exécutée ici.
vi.mock("react-native", () => ({ StyleSheet: { create: (s: unknown) => s }, View: "View", Modal: "Modal", Pressable: "Pressable" }));
vi.mock("@orasso/design-system/native", () => ({
  Button: "Button",
  Icon: "Icon",
  Text: "Text",
  tokens: { spacing: { space2: 8, space3: 12 }, radius: { radiusSm: 4 } },
  useTheme: () => ({}),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({}) }));
vi.mock("@/lib/api", () => ({ api: {} }));
vi.mock("@/lib/clock", () => ({ now: () => new Date() }));
vi.mock("@/lib/http", () => ({ errorMessage: () => "" }));
vi.mock("@/lib/persona", () => ({ usePersona: () => ({}) }));
vi.mock("@/lib/useApi", () => ({ useApi: () => ({}) }));
vi.mock("@/ui/AppSheet", () => ({ AppSheet: "AppSheet" }));
vi.mock("@/ui/Muted", () => ({ Muted: "Muted" }));
vi.mock("@/ui/Notice", () => ({ Notice: "Notice" }));
vi.mock("@/ui/Avatar", () => ({ Avatar: "Avatar" }));
vi.mock("@/ui/Overlay", () => ({ SheetBoundary: "SheetBoundary" }));
vi.mock("@/features/orga/ConfirmSheet", () => ({ ConfirmSheet: "ConfirmSheet" }));
vi.mock("../RepostSheet", () => ({ RepostSheet: "RepostSheet" }));
vi.mock("../TagPicker", () => ({ TagPicker: "TagPicker" }));

import { actionsFor } from "./registry";

const ids = (role: "media" | "organizer" | "tagged" | "member", organizer: boolean) =>
  actionsFor(role, organizer).map((a) => a.id);

describe("le vrai registre des actions de la visionneuse", () => {
  it("rôle organisateur (droits du compte) sans la casquette de la structure : aucune action R9g", () => {
    const list = ids("organizer", false);
    expect(list).not.toContain("repost");
    expect(list).not.toContain("official");
    expect(list.filter((id) => id === "tag-identify")).toHaveLength(1);
  });
  it("rôle média avec la casquette de la structure : un seul « Identifier une voiture » (le rôle), les actions R9g en plus", () => {
    const list = ids("media", true);
    expect(list.filter((id) => id === "tag-identify")).toHaveLength(1);
    expect(list).toContain("official");
  });
  it("aucun identifiant en double, quel que soit le cumul", () => {
    for (const role of ["media", "organizer", "tagged", "member"] as const) {
      for (const organizer of [false, true]) {
        const list = ids(role, organizer);
        expect(new Set(list).size).toBe(list.length);
      }
    }
  });
});
