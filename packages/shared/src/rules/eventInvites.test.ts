import { describe, expect, it } from "vitest";

import {
  eventInviteCreateSchema,
  eventInvitedBanner,
  eventInvitedTitle,
  followingGoingText,
  inviteCaption,
  inviteResultText,
  inviteSendLabel,
} from "./eventInvites";

describe("invitations entre passionnés (lot R6c)", () => {
  it("« Qui y va » : un, deux, plusieurs", () => {
    expect(followingGoingText(["Julie_66"], 1)).toBe("Julie_66 y va");
    expect(followingGoingText(["Julie_66", "Nina_34"], 2)).toBe("Julie_66 et Nina_34 y vont");
    expect(followingGoingText(["Julie_66", "Nina_34", "Theo_66"], 3)).toBe("Julie_66, Nina_34 et 1 autre y vont");
    expect(followingGoingText(["Julie_66", "Nina_34", "Theo_66"], 4)).toBe("Julie_66, Nina_34 et 2 autres y vont");
    expect(followingGoingText([], 0)).toBe("");
  });

  it("titre de la notification et bandeau regroupés", () => {
    expect(eventInvitedTitle(["Kenji_66"], 1, "Nocturne de Canet")).toBe("Kenji_66 t'invite à Nocturne de Canet");
    expect(eventInvitedTitle(["Kenji_66", "Julie_66"], 2, "Nocturne de Canet")).toBe(
      "Kenji_66 et Julie_66 t'invitent à Nocturne de Canet",
    );
    expect(eventInvitedBanner(["Kenji_66", "Julie_66"], 4)).toBe("Kenji_66, Julie_66 et 2 autres t'invitent");
  });

  it("légende d'une ligne et bouton d'envoi", () => {
    expect(inviteCaption("going", { inCrew: true, followsMe: true, iFollow: true })).toBe("y va déjà · ton crew");
    expect(inviteCaption("available", { inCrew: true, followsMe: true, iFollow: false })).toBe("ton crew · te suit");
    expect(inviteCaption("available", { inCrew: false, followsMe: false, iFollow: true })).toBe("abonnement");
    expect(inviteCaption("invited", { inCrew: true, followsMe: true, iFollow: true })).toBe("déjà invité(e) par toi");
    expect(inviteSendLabel(0)).toBe("Choisis qui inviter");
    expect(inviteSendLabel(3)).toBe("Inviter 3 personnes");
    expect(inviteResultText({ invited: 2, alreadyInvited: ["a"], going: ["b", "c"] })).toBe(
      "2 invitations envoyées. 1 personne déjà invitée par toi. 2 personnes y vont déjà.",
    );
  });

  it("le mot : facultatif, 140 caractères, vide = aucun", () => {
    expect(eventInviteCreateSchema.parse({ userIds: ["u1"], note: "   " }).note).toBeNull();
    expect(eventInviteCreateSchema.parse({ userIds: ["u1"] }).note).toBeNull();
    expect(eventInviteCreateSchema.safeParse({ userIds: ["u1"], note: "x".repeat(141) }).success).toBe(false);
    expect(eventInviteCreateSchema.safeParse({ userIds: [] }).success).toBe(false);
    expect(eventInviteCreateSchema.safeParse({ userIds: Array.from({ length: 31 }, (_, i) => `u${i}`) }).success).toBe(
      false,
    );
  });
});
