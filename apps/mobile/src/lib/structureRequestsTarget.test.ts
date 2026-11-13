import { describe, expect, it } from "vitest";

import { structureRequestsTarget } from "./links";

const ID = "3f2b8a52-1c7e-4b0a-9d5e-6a1f0c2d4e11";

// Les deux chemins qui mènent à `openNotification` portent la même `data` : le bandeau de l'appli ouverte (événement `notification`
// du canal `user:<id>`, `payload.data`) et le push (`data` + `notificationId`, `notificationType`, `recipient`).
const bannerPayload = {
  id: "n1",
  type: "coauthor_invited",
  title: "Kenji_66 te propose de publier avec toi",
  body: "…",
  delivered: true,
  data: {
    actor: { pseudo: "Kenji_66", avatarUrl: null },
    postId: "p1",
    structureId: ID,
    structureName: "Club",
    screen: "structure-requests",
  },
};
const pushData = { ...bannerPayload.data, notificationId: "n1", notificationType: "coauthor_invited", recipient: "x" };

describe("structureRequestsTarget : bandeau et push d'une invitation de structure", () => {
  it("le bandeau et le push mènent à la même structure", () => {
    expect(structureRequestsTarget(bannerPayload.data)).toBe(ID);
    expect(structureRequestsTarget(pushData)).toBe(ID);
  });
  it("invitation personnelle (pas d'écran de structure), autre écran ou identifiant invalide : rien", () => {
    expect(structureRequestsTarget({ postId: "p1", link: "/app/activite/demandes" })).toBeNull();
    expect(structureRequestsTarget({ screen: "structure-requests" })).toBeNull();
    expect(structureRequestsTarget({ screen: "structure-requests", structureId: "x" })).toBeNull();
    expect(structureRequestsTarget({ screen: "staff-requests", structureId: ID })).toBeNull();
    expect(structureRequestsTarget(null)).toBeNull();
  });
  it("ancien format (push reçu avant la mise à jour, sans `screen`) : type coauthor_invited + structureId valide", () => {
    expect(structureRequestsTarget({ notificationType: "coauthor_invited", structureId: ID })).toBe(ID);
    expect(structureRequestsTarget({ type: "coauthor_invited", structureId: ID })).toBe(ID);
    // Assertions du tour 4, rétablies : sans identifiant, identifiant invalide, autre type, invitation personnelle.
    expect(structureRequestsTarget({ notificationType: "coauthor_invited" })).toBeNull();
    expect(structureRequestsTarget({ notificationType: "coauthor_invited", structureId: "x" })).toBeNull();
    expect(structureRequestsTarget({ notificationType: "feed_comment", structureId: ID })).toBeNull();
    expect(structureRequestsTarget({ notificationType: "coauthor_invited", postId: "p1" })).toBeNull();
    // Un autre écran explicite n'est jamais pris pour une invitation de structure, même avec le type.
    expect(
      structureRequestsTarget({ screen: "staff-requests", notificationType: "coauthor_invited", structureId: ID }),
    ).toBeNull();
  });
});
