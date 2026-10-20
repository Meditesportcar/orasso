// Lot 54 : calculs purs des onglets Pro et Prestataire.
import type { MissionCard, ProviderApplicationView } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  alreadyApplied,
  candidatureKind,
  discountCells,
  formatCount,
  gradeBars,
  missionDetail,
  missionFacts,
  missionTag,
  needLabel,
  pendingLine,
  reviewTag,
  spotLine,
} from "./proPresta";

const card = (over: Partial<MissionCard> = {}): MissionCard =>
  ({
    id: "e1",
    slug: "expo",
    title: "Expo Rivesaltes",
    format: "exhibition",
    startsAt: "2026-11-01T09:00:00.000Z",
    endsAt: "2026-11-01T17:00:00.000Z",
    city: "Rivesaltes",
    status: "published",
    department: "66",
    structureName: "Rivesaltes Auto Passion",
    distanceKm: 18.2,
    lockAt: "2026-11-01T07:00:00.000Z",
    expectedVisitors: 800,
    needs: [
      {
        id: "n1",
        trade: "food_truck",
        tradeLabel: "Food truck",
        quantity: 2,
        filled: 1,
        remaining: 1,
        power: "a16",
        water: true,
        frontageM: null,
        installAt: null,
        notes: null,
        position: 0,
      },
    ],
    myApplication: null,
    ...over,
  }) as MissionCard;

const app = (over: Partial<ProviderApplicationView> = {}): ProviderApplicationView =>
  ({
    id: "a1",
    status: "accepted",
    accreditedMedia: false,
    message: null,
    createdAt: "2026-10-19T10:00:00.000Z",
    decidedAt: null,
    waitlistRank: null,
    refusalNote: null,
    event: {
      id: "e1",
      slug: "nocturne",
      title: "Nocturne de Canet",
      format: "night",
      startsAt: "2026-10-24T17:00:00.000Z",
      endsAt: "2026-10-24T21:00:00.000Z",
      city: "Canet",
      status: "published",
    },
    checkedInAt: null,
    canWithdraw: true,
    need: null,
    spot: null,
    installAt: null,
    power: null,
    instructions: null,
    review: null,
    ...over,
  }) as ProviderApplicationView;

describe("missions", () => {
  it("dit « 1 place sur 2 » quand une partie est comblée", () => {
    expect(missionTag(card())).toEqual({ label: "1 place sur 2", mine: false });
  });
  it("dit « 2 food trucks » quand rien n'est comblé", () => {
    const c = card();
    c.needs = [{ ...c.needs[0]!, remaining: 2, filled: 0 }];
    expect(missionTag(c).label).toBe("2 food trucks");
  });
  it("dit « Retenue » quand ma candidature est retenue", () => {
    expect(missionTag(card({ myApplication: { id: "a", status: "accepted", needId: "n1" } }))).toEqual({
      label: "Retenue",
      mine: true,
    });
  });
  it("écrit la ligne structure · distance · visiteurs", () => {
    expect(missionDetail(card())).toBe("Rivesaltes Auto Passion · 18 km · 800 visiteurs attendus");
    expect(missionDetail(card({ distanceKm: null, expectedVisitors: null }))).toBe("Rivesaltes Auto Passion");
  });
  it("liste ce qui est fourni", () => {
    expect(missionFacts(card())).toEqual(["Électricité fournie", "Eau sur place"]);
    const c = card();
    c.needs = [{ ...c.needs[0]!, power: "generator_ok", water: false }];
    expect(missionFacts(c)).toEqual(["Pas d'électricité · groupe autorisé"]);
  });
  it("reconnaît une candidature déjà active", () => {
    expect(alreadyApplied(card())).toBe(false);
    expect(alreadyApplied(card({ myApplication: { id: "a", status: "pending", needId: null } }))).toBe(true);
    expect(alreadyApplied(card({ myApplication: { id: "a", status: "withdrawn", needId: null } }))).toBe(false);
  });
});

describe("candidatures", () => {
  it("range les statuts", () => {
    expect(candidatureKind({ status: "accepted" })).toBe("retained");
    expect(candidatureKind({ status: "offered" })).toBe("waitlist");
    expect(candidatureKind({ status: "expired" })).toBe("withdrawn");
  });
  it("écrit la ligne de l'emplacement", () => {
    expect(
      spotLine(
        app({
          spot: { label: "B2", note: null },
          installAt: "2026-10-24T14:00:00.000Z",
          power: "a16",
        }),
      ),
    ).toBe("Emplacement B2 · arrivée 16 h · électricité 16 A");
    expect(spotLine(app())).toBeNull();
    expect(spotLine(app({ spot: { label: "C1", note: null } }))).toBe("Emplacement C1");
  });
  it("écrit la ligne d'une candidature en attente", () => {
    expect(pendingLine(app({ status: "pending" }))).toBe("Envoyée le 19 oct · réponse avant le 24 oct");
  });
  it("garde l'avis des candidatures passées", () => {
    expect(reviewTag(app({ review: { rating: 5, comment: "Top", createdAt: "x", authorName: "MSC" } }))).toBe(
      "Avis · 5/5",
    );
    expect(reviewTag(app())).toBeNull();
  });
  it("nomme la mission, ou « Sans mission précise »", () => {
    expect(needLabel(app())).toBe("Sans mission précise");
    expect(
      needLabel(
        app({
          status: "pending",
          need: {
            id: "n",
            trade: "food_truck",
            tradeLabel: "Food truck",
            quantity: 2,
            filled: 1,
            remaining: 1,
            power: "none",
            water: false,
            frontageM: null,
            installAt: null,
            notes: null,
            position: 0,
          },
        }),
      ),
    ).toBe("Food truck · 1 place sur 2");
    expect(
      needLabel(
        app({
          need: {
            id: "n",
            trade: "food_truck",
            tradeLabel: "Food truck",
            quantity: 1,
            filled: 1,
            remaining: 0,
            power: "none",
            water: false,
            frontageM: null,
            installAt: null,
            notes: null,
            position: 0,
          },
        }),
      ),
    ).toBe("Food truck");
  });
});

describe("fiche pro et stats", () => {
  it("fusionne Circuit et Légende en « Circuit+ » quand la remise est la même", () => {
    expect(discountCells({ rodage: 5, route: 8, sport: 10, circuit: 15, legende: 15 })).toEqual([
      { key: "rodage", label: "Rodage", percent: 5 },
      { key: "route", label: "Route", percent: 8 },
      { key: "sport", label: "Sport", percent: 10 },
      { key: "circuit", label: "Circuit+", percent: 15 },
    ]);
  });
  it("sépare Circuit et Légende quand elles diffèrent, et saute un grade sans remise", () => {
    const cells = discountCells({ route: 8, circuit: 12, legende: 15 });
    expect(cells.map((c) => c.label)).toEqual(["Route", "Circuit", "Légende"]);
  });
  it("sépare les milliers par une espace insécable", () => {
    expect(formatCount(1284)).toBe("1 284");
    expect(formatCount(37)).toBe("37");
  });
  it("dessine des barres relatives au grade le plus utilisé", () => {
    const bars = gradeBars({ rodage: 6, route: 14, sport: 12, circuit: 5 });
    expect(bars.map((b) => b.label)).toEqual(["Rodage", "Route", "Sport", "Circuit"]);
    expect(bars.find((b) => b.grade === "route")?.percent).toBe(100);
    expect(bars.find((b) => b.grade === "rodage")?.percent).toBe(43);
    expect(gradeBars({}).every((b) => b.percent === 0)).toBe(true);
  });
});
