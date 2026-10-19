// Lot 46 : menu de la vitrine, places d'un besoin, avis d'un organisateur sur un prestataire, tri des missions.
import { describe, expect, it } from "vitest";
import {
  arrivalHourLabel,
  canReviewProvider,
  formatMenuLine,
  menuPriceRange,
  menuToText,
  missionDistanceSort,
  missionTexts,
  needRemaining,
  parseMenuLines,
  providerReviewAverage,
  providerReviewIssue,
  providerReviewTexts,
  vitrineTexts,
} from "../index";
import { providerProfileSchema } from "../schemas/provider";
import { fromWallTime } from "./time";

describe("parseMenuLines", () => {
  it("lit les formats du prototype : « · 9 € », « 9€ », « 9,50 € », séparateurs et euros en toutes lettres", () => {
    const { items, errors } = parseMenuLines(
      [
        "Bocata de botifarra · 9 €",
        "Brochettes catalanes 11€",
        "",
        "Crema catalana : 4,50 €",
        "Frites maison - 4 euros",
        "Café – 1.5 €",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(items).toEqual([
      { label: "Bocata de botifarra", priceCents: 900 },
      { label: "Brochettes catalanes", priceCents: 1100 },
      { label: "Crema catalana", priceCents: 450 },
      { label: "Frites maison", priceCents: 400 },
      { label: "Café", priceCents: 150 },
    ]);
  });

  it("une erreur par ligne illisible, avec son numéro (lignes vides comptées)", () => {
    const { items, errors } = parseMenuLines("Frites · 4 €\n\nPack 2\n· 5 €\nPlat · 1500 €");
    expect(items).toEqual([{ label: "Frites", priceCents: 400 }]);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5]);
    expect(errors[0]?.message).toMatch(/^Ligne 3 : indique le prix/);
    expect(errors[1]?.message).toMatch(/nom du plat/);
  });

  it("refuse plus de 40 plats et un nom de plus de 60 caractères", () => {
    const many = Array.from({ length: 41 }, (_, i) => `Plat ${i} · 5 €`).join("\n");
    expect(parseMenuLines(many).errors.at(-1)?.message).toMatch(/40 plats au plus/);
    expect(parseMenuLines(`${"x".repeat(61)} · 5 €`).errors[0]?.message).toMatch(/trop long/);
  });

  it("aller-retour sans perte avec le texte du champ, fourchette de prix", () => {
    const items = [
      { label: "Bocata de botifarra", priceCents: 900 },
      { label: "Crema catalana", priceCents: 450 },
    ];
    expect(formatMenuLine(items[0] as (typeof items)[number])).toBe("Bocata de botifarra · 9 €");
    expect(parseMenuLines(menuToText(items)).items).toEqual(items);
    expect(menuPriceRange(items)).toEqual({ min: 450, max: 900 });
    expect(menuPriceRange([])).toBeNull();
    expect(vitrineTexts.menuRange(400, 1100)).toBe("De 4 à 11 €");
  });

  it("le schéma de la vitrine renvoie la ligne fautive", () => {
    const r = providerProfileSchema.safeParse({ type: "food_truck", name: "La Brasa", menu: "Frites · 4 €\nPack 2" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/^Ligne 2/);
  });
});

describe("missions", () => {
  it("places restantes d'un besoin, jamais négatives ; libellé « 1 place sur 2 »", () => {
    expect(needRemaining({ quantity: 2 }, 1)).toBe(1);
    expect(needRemaining({ quantity: 1 }, 3)).toBe(0);
    expect(missionTexts.places(1, 2, "Food truck")).toBe("1 place sur 2");
    expect(missionTexts.places(2, 2, "Food truck")).toBe("2 food trucks");
    expect(missionTexts.places(1, 1, "Food truck")).toBe("1 food truck");
  });

  it("du plus proche au plus loin, à égalité la plus tôt, sans distance en dernier", () => {
    const list = [
      { id: "c", distanceKm: 40, startsAt: "2026-11-28T09:00:00Z" },
      { id: "x", distanceKm: null, startsAt: "2026-10-01T09:00:00Z" },
      { id: "a", distanceKm: 18, startsAt: "2026-11-01T09:00:00Z" },
      { id: "b", distanceKm: 18, startsAt: "2026-10-30T09:00:00Z" },
    ];
    expect(missionDistanceSort(list).map((m) => m.id)).toEqual(["b", "a", "c", "x"]);
    expect(list[0]?.id).toBe("c");
  });

  it("heure d'arrivée à Paris", () => {
    expect(arrivalHourLabel(fromWallTime({ year: 2026, month: 10, day: 24, hour: 16, minute: 0 }))).toBe("16 h");
    expect(arrivalHourLabel(fromWallTime({ year: 2026, month: 10, day: 24, hour: 7, minute: 5 }))).toBe("7 h 05");
  });
});

describe("avis d'un organisateur sur un prestataire", () => {
  const endsAt = new Date("2026-08-29T22:00:00Z");
  const event = { endsAt, status: "published" };
  const app = { kind: "provider", status: "accepted" };
  const day = 86_400_000;

  it("après la fin, jusqu'à 30 jours, seulement pour un prestataire retenu d'un événement publié", () => {
    expect(providerReviewIssue(app, event, new Date(endsAt.getTime() - 1))).toBe("not_ended");
    expect(providerReviewIssue(app, event, endsAt)).toBeNull();
    expect(providerReviewIssue(app, event, new Date(endsAt.getTime() + 30 * day))).toBeNull();
    expect(providerReviewIssue(app, event, new Date(endsAt.getTime() + 30 * day + 1))).toBe("window_closed");
    expect(providerReviewIssue({ kind: "provider", status: "pending" }, event, endsAt)).toBe("not_accepted");
    expect(providerReviewIssue({ kind: "vehicle", status: "accepted" }, event, endsAt)).toBe("not_accepted");
    expect(providerReviewIssue(app, { endsAt, status: "cancelled" }, endsAt)).toBe("event_cancelled");
    expect(canReviewProvider(app, event, new Date(endsAt.getTime() + day))).toBe(true);
  });

  it("moyenne au dixième dès le premier avis ; « 4,9 sur 5 · 13 événements »", () => {
    expect(providerReviewAverage([])).toBeNull();
    expect(providerReviewAverage([5])).toBe(5);
    expect(providerReviewAverage([5, 5, 4])).toBe(4.7);
    expect(providerReviewTexts.summary(4.9, 13)).toBe("4,9 sur 5 · 13 événements");
    expect(providerReviewTexts.summary(5, 1)).toBe("5 sur 5 · 1 événement");
  });
});
