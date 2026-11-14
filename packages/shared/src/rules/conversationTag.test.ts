import { describe, expect, it } from "vitest";

import { conversationTag } from "./conversationTag";

describe("conversationTag (lot R7c2)", () => {
  it("une étiquette par sorte de conversation, rien pour une conversation privée", () => {
    expect(conversationTag({ kind: "organizer", side: "member" })).toBe("Organisateur");
    expect(conversationTag({ kind: "crew", side: "member" })).toBe("Crew");
    expect(conversationTag({ kind: "event_staff", side: "member" })).toBe("Staff");
    expect(conversationTag({ kind: "structure_staff", side: "member" })).toBe("Staff");
    expect(conversationTag({ kind: "story_reply", side: "member" })).toBe("Réponse à ta story");
    expect(conversationTag({ kind: "direct", side: "member" })).toBeNull();
  });
  it("une conversation de page (lot R9i) porte « Média » des deux côtés", () => {
    expect(conversationTag({ kind: "media", side: "member" })).toBe("Média");
  });
  it("côté structure, la personne en face est un participant : pas d'étiquette Organisateur", () => {
    expect(conversationTag({ kind: "organizer", side: "structure" })).toBeNull();
  });
});
