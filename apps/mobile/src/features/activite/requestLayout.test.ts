import { messagingLabels, plateTransferLabels } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { buttonsSideBySide } from "./requestLayout";

describe("Accepter / Refuser côte à côte seulement quand la rangée tient", () => {
  it("police normale : Accepter et Refuser partagent la ligne", () => {
    expect(buttonsSideBySide(1, [messagingLabels.accept, messagingLabels.decline])).toBe(true);
    expect(buttonsSideBySide(1.15, [messagingLabels.accept, messagingLabels.decline])).toBe(true);
  });
  it("police agrandie (×1,3, le Pixel de Damien) : empilés", () => {
    expect(buttonsSideBySide(1.3, [messagingLabels.accept, messagingLabels.decline])).toBe(false);
  });
  it("transfert de plaque : libellés longs, toujours empilés", () => {
    expect(buttonsSideBySide(1, [plateTransferLabels.accept, plateTransferLabels.decline])).toBe(false);
  });
});
