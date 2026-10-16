import { describe, expect, it } from "vitest";

import { reviewCreateSchema } from "../schemas/review";
import { REVIEW_MIN_COUNT_FOR_AVERAGE, reviewAverage, reviewDeadline, reviewWindowOpen } from "./reviews";

const endsAt = new Date("2026-10-17T16:00:00Z");
const DAY = 86_400_000;

describe("avis après l'événement", () => {
  it("fenêtre : de la fin de l'événement à J+7 inclus, événement publié seulement", () => {
    const e = { endsAt, status: "published" };
    expect(reviewDeadline(e)).toEqual(new Date(endsAt.getTime() + 7 * DAY));
    expect(reviewWindowOpen(e, new Date(endsAt.getTime() - 1))).toBe(false);
    expect(reviewWindowOpen(e, endsAt)).toBe(true);
    expect(reviewWindowOpen(e, new Date(endsAt.getTime() + 7 * DAY))).toBe(true);
    expect(reviewWindowOpen(e, new Date(endsAt.getTime() + 7 * DAY + 1))).toBe(false);
    expect(reviewWindowOpen({ endsAt, status: "cancelled" }, endsAt)).toBe(false);
  });

  it("moyenne seulement à partir du minimum d'avis, arrondie au dixième", () => {
    expect(REVIEW_MIN_COUNT_FOR_AVERAGE).toBe(3);
    expect(reviewAverage([3, 2])).toBeNull();
    expect(reviewAverage([3, 2, 2])).toBe(2.3);
    expect(reviewAverage([3, 3, 3, 1])).toBe(2.5);
  });

  it("note de 1 à 3 étoiles, commentaire obligatoire", () => {
    expect(reviewCreateSchema.safeParse({ rating: 3, comment: "Super accueil" }).success).toBe(true);
    expect(reviewCreateSchema.safeParse({ rating: 0, comment: "x" }).success).toBe(false);
    expect(reviewCreateSchema.safeParse({ rating: 4, comment: "x" }).success).toBe(false);
    expect(reviewCreateSchema.safeParse({ rating: 2.5, comment: "x" }).success).toBe(false);
    expect(reviewCreateSchema.safeParse({ rating: 2, comment: "   " }).success).toBe(false);
  });
});
