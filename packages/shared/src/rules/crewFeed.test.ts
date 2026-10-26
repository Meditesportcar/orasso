import { describe, expect, it } from "vitest";

import { crewFeedLabels, crewFeedWhen } from "../labels/crewFeed.fr";
import { crewCommentCreateSchema, crewPostCreateSchema } from "../schemas/crewFeed";
import { canRemoveCrewContent, crewPhotoFrameRatio, crewPollOpen, pollEndsAtValid, pollShare } from "./crewFeed";

const NOW = new Date("2026-10-26T12:00:00Z");
const HOUR = 3_600_000;

describe("fil du crew (lot R5c1)", () => {
  it("un sondage est ouvert tant qu'il n'est ni clos ni arrivé à sa fin", () => {
    expect(crewPollOpen({ closedAt: null, endsAt: null }, NOW)).toBe(true);
    expect(crewPollOpen({ closedAt: null, endsAt: new Date(NOW.getTime() + HOUR) }, NOW)).toBe(true);
    expect(crewPollOpen({ closedAt: null, endsAt: NOW.toISOString() }, NOW)).toBe(false);
    expect(crewPollOpen({ closedAt: new Date(NOW.getTime() - HOUR), endsAt: null }, NOW)).toBe(false);
  });

  it("fin du sondage : dans le futur, au plus 90 jours", () => {
    expect(pollEndsAtValid(new Date(NOW.getTime() + HOUR), NOW)).toBe(true);
    expect(pollEndsAtValid(new Date(NOW.getTime() + 90 * 24 * HOUR), NOW)).toBe(true);
    expect(pollEndsAtValid(new Date(NOW.getTime() + 91 * 24 * HOUR), NOW)).toBe(false);
    expect(pollEndsAtValid(NOW, NOW)).toBe(false);
  });

  it("retirer : l'auteur ou le chef", () => {
    expect(canRemoveCrewContent("a", { userId: "a", leader: false })).toBe(true);
    expect(canRemoveCrewContent("a", { userId: "b", leader: true })).toBe(true);
    expect(canRemoveCrewContent("a", { userId: "b", leader: false })).toBe(false);
    expect(canRemoveCrewContent(null, { userId: "b", leader: false })).toBe(false);
  });

  it("cadre des photos : la forme de la première, bornée entre 4:5 et 1,91:1", () => {
    expect(crewPhotoFrameRatio({ width: 1200, height: 600 })).toBe(1.91);
    expect(crewPhotoFrameRatio({ width: 1200, height: 900 })).toBeCloseTo(4 / 3);
    expect(crewPhotoFrameRatio({ width: 683, height: 2048 })).toBe(0.8);
    expect(crewPhotoFrameRatio(undefined)).toBe(1);
  });

  it("parts des réponses en pourcentage entier", () => {
    expect(pollShare(0, 0)).toBe(0);
    expect(pollShare(1, 3)).toBe(33);
    expect(pollShare(2, 3)).toBe(67);
    expect(pollShare(4, 4)).toBe(100);
  });

  it("« il y a 2 h », « hier », puis la date", () => {
    expect(crewFeedWhen(NOW, NOW, "x")).toBe("à l'instant");
    expect(crewFeedWhen(new Date(NOW.getTime() - 5 * 60_000), NOW, "x")).toBe("il y a 5 min");
    expect(crewFeedWhen(new Date(NOW.getTime() - 2 * HOUR), NOW, "x")).toBe("il y a 2 h");
    expect(crewFeedWhen(new Date(NOW.getTime() - 30 * HOUR), NOW, "x")).toBe("hier");
    expect(crewFeedWhen(new Date(NOW.getTime() - 3 * 24 * HOUR), NOW, "x")).toBe("il y a 3 jours");
    expect(crewFeedWhen(new Date(NOW.getTime() - 9 * 24 * HOUR), NOW, "Sam 17 oct")).toBe("Sam 17 oct");
    expect(crewFeedLabels.autoAcceptedMembers(["A", "B", "C", "D", "E"])).toBe("A, B, C et 2 de plus");
  });

  it("schémas : photo 1 à 6 sans doublon, texte non vide, sondage 2 à 6 réponses distinctes, commentaire 300", () => {
    const key = "private/crew-posts/00000000-0000-4000-8000-000000000000.webp";
    expect(crewPostCreateSchema.safeParse({ kind: "photo", photoKeys: [key] }).success).toBe(true);
    expect(crewPostCreateSchema.safeParse({ kind: "photo", photoKeys: [] }).success).toBe(false);
    expect(crewPostCreateSchema.safeParse({ kind: "photo", photoKeys: [key, key] }).success).toBe(false);
    expect(crewPostCreateSchema.safeParse({ kind: "photo", photoKeys: Array(7).fill(key) }).success).toBe(false);
    expect(crewPostCreateSchema.safeParse({ kind: "text", text: "   " }).success).toBe(false);
    expect(crewPostCreateSchema.safeParse({ kind: "text", text: "x".repeat(501) }).success).toBe(false);
    const poll = (options: string[], question = "On roule où ?") =>
      crewPostCreateSchema.safeParse({ kind: "poll", poll: { question, options } }).success;
    expect(poll(["A", "B"])).toBe(true);
    expect(poll(["A"])).toBe(false);
    expect(poll(["A", "B", "C", "D", "E", "F", "G"])).toBe(false);
    expect(poll(["Oui", "oui"])).toBe(false);
    expect(poll(["A", "x".repeat(61)])).toBe(false);
    expect(poll(["A", "B"], "x".repeat(121))).toBe(false);
    expect(crewCommentCreateSchema.safeParse({ text: "x".repeat(300) }).success).toBe(true);
    expect(crewCommentCreateSchema.safeParse({ text: "x".repeat(301) }).success).toBe(false);
  });
});
