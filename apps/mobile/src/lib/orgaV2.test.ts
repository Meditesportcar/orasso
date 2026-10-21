// Lot 52 : calculs purs de la casquette Organisateur v2 (brouillon, bulles, rôles, relance, missions du tri).
import { type ApplicationForTriage, type EventNeedView, type EventOrganizer, orgaV2Labels } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  AVATAR_COLORS,
  avatarColor,
  BUBBLE_FULL_AT,
  BUBBLE_MAX,
  BUBBLE_MIN,
  boardRoles,
  bubbleInitials,
  bubbleName,
  bubbleSize,
  cloudSizes,
  draftMissing,
  historyOf,
  holdersOf,
  missionGroups,
  nextReminder,
  packBubbles,
  publishedStatus,
  reminderText,
  requestBubbleSpot,
  withRole,
} from "./orgaV2";

const NOW = new Date("2026-10-18T07:00:00Z"); // dimanche 9 h à Paris

function draft(over: Partial<EventOrganizer> = {}): EventOrganizer {
  return {
    id: "e1",
    slug: "e1",
    title: "Expo de printemps",
    format: "exhibition",
    description: null,
    startsAt: "2027-04-10T08:00:00Z",
    endsAt: "2027-04-10T16:00:00Z",
    days: [],
    dayAccess: "both",
    addressLine: "Place du marché",
    postalCode: "66000",
    city: "Perpignan",
    lat: 42.7,
    lng: 2.9,
    admittedVehicleTypes: ["car"],
    maxVehiclesPerUser: 1,
    capacity: 50,
    vendorTypes: [],
    shopEnabled: false,
    publicAccess: "free",
    externalTicketUrl: null,
    admission: "open",
    criteria: null,
    registrationsOpenAt: "2027-03-01T08:00:00Z",
    previewHours: 24,
    highGradePriority: false,
    highGradePreviewHours: 0,
    highGradeMin: "circuit",
    lockAt: "2027-04-10T06:00:00Z",
    rulesText: "Règlement",
    instructions: null,
    zones: [],
    posterUrl: "/p.jpg",
    customPosterUrl: null,
    status: "draft",
    ...over,
  } as unknown as EventOrganizer;
}

describe("brouillon : ce qui manque", () => {
  it("ne dit rien d'un brouillon complet", () => {
    expect(draftMissing(draft(), NOW)).toEqual([]);
  });
  it("nomme l'adresse et l'affiche comme le prototype", () => {
    const missing = draftMissing(draft({ addressLine: null, city: null, posterUrl: null }), NOW);
    expect(missing).toEqual(["adresse", "affiche"]);
    expect(orgaV2Labels.draftMissing(missing.join(", "))).toBe("Il manque : adresse, affiche.");
  });
  it("une structure non vérifiée ne peut pas publier : le brouillon le dit", () => {
    expect(draftMissing(draft(), NOW, false)).toEqual(["la vérification de ta structure"]);
    expect(draftMissing(draft({ addressLine: null, city: null }), NOW, false)).toEqual([
      "adresse",
      "la vérification de ta structure",
    ]);
  });
  it("une affiche personnelle suffit", () => {
    expect(draftMissing(draft({ posterUrl: null, customPosterUrl: "/x.jpg" }), NOW)).toEqual([]);
  });
  it("signale le titre trop court et une capacité nulle", () => {
    expect(draftMissing(draft({ title: "Ex", capacity: 0 }), NOW)).toEqual(["titre", "places"]);
  });
});

describe("statut d'un événement publié", () => {
  it("J-N dans les trente jours, la date au-delà", () => {
    expect(publishedStatus("2026-10-24T17:00:00Z", "2026-10-24T22:00:00Z", NOW)).toBe("Publié · J-6");
    expect(publishedStatus("2026-12-24T17:00:00Z", "2026-12-24T22:00:00Z", NOW)).toBe("Publié · 24 déc.");
  });
  it("en cours le jour même", () => {
    expect(publishedStatus("2026-10-18T06:00:00Z", "2026-10-18T12:00:00Z", NOW)).toBe("Publié · en cours");
  });
});

describe("bulles", () => {
  it("la taille suit les événements tenus, de 36 à 96 px", () => {
    expect(bubbleSize(0)).toBe(BUBBLE_MIN);
    expect(bubbleSize(BUBBLE_FULL_AT)).toBe(BUBBLE_MAX);
    expect(bubbleSize(99)).toBe(BUBBLE_MAX);
    expect(bubbleSize(10)).toBe(66);
    expect(bubbleSize(-3)).toBe(BUBBLE_MIN);
  });
  it("la grappe pose les bulles sans chevauchement, dans la carte et hors de la bulle « +N »", () => {
    const sizes = [96, 74, 68, 60, 54, 50, 44, 40, 36];
    const reserved = requestBubbleSpot(358, 310);
    const placed = packBubbles(sizes, 358, 310, reserved);
    expect(placed).toHaveLength(sizes.length);
    const all = [reserved, ...placed];
    for (const [i, a] of all.entries()) {
      expect(a.x - a.size / 2).toBeGreaterThanOrEqual(0);
      expect(a.x + a.size / 2).toBeLessThanOrEqual(358);
      expect(a.y - a.size / 2).toBeGreaterThanOrEqual(0);
      expect(a.y + a.size / 2).toBeLessThanOrEqual(310);
      for (const b of all.slice(i + 1))
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual((a.size + b.size) / 2);
    }
  });
  it("une petite équipe peu active est agrandie, sans dépasser 96 px", () => {
    const sizes = cloudSizes([45, 39, 36], 358, 310);
    expect(sizes[0]).toBeGreaterThan(45);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(BUBBLE_MAX);
    expect(sizes[0]).toBeGreaterThan(sizes[2] ?? 0);
  });
  it("une grande équipe tient dans la carte (tailles réduites)", () => {
    const placed = packBubbles(
      Array.from({ length: 40 }, () => 96),
      358,
      310,
      null,
    );
    expect(placed).toHaveLength(40);
  });
  it("la couleur d'avatar est stable, le prénom vient du pseudo", () => {
    expect(avatarColor("u1")).toBe(avatarColor("u1"));
    expect(AVATAR_COLORS).toContain(avatarColor("u2"));
    expect(bubbleName("Lucie_Pia")).toBe("Lucie");
  });
  it("les initiales", () => {
    expect(bubbleInitials("Sarah_66")).toBe("SA");
    expect(bubbleInitials("Pilote_001")).toBe("PI");
    expect(bubbleInitials("123")).toBe("12");
    expect(bubbleInitials("damien")).toBe("DA");
    expect(bubbleInitials("Léa Martin")).toBe("LM");
  });
  it("l'historique d'un membre inconnu est vide", () => {
    expect(historyOf([], "u1")).toEqual({ userId: "u1", eventsHeld: 0, events: [] });
  });
});

describe("rôles d'un événement", () => {
  const staff = [
    { userId: "a", pseudo: "Zoé", roles: ["scan"], presence: "unknown" },
    { userId: "b", pseudo: "Alex", roles: ["scan", "placement"], presence: "present" },
    { userId: "c", pseudo: "Max", roles: ["scan"], presence: "absent" },
  ] as never;
  it("les présences confirmées d'abord, les absents derniers", () => {
    expect(holdersOf(staff, "scan").map((m) => m.userId)).toEqual(["b", "a", "c"]);
    expect(holdersOf(staff, "placement").map((m) => m.userId)).toEqual(["b"]);
  });
  it("donner ou retirer un rôle garde l'ordre de la liste", () => {
    expect(withRole(["placement"], "scan", true)).toEqual(["scan", "placement"]);
    expect(withRole(["scan", "placement"], "scan", false)).toEqual(["placement"]);
  });
  it("le tableau montre quatre rôles", () => {
    expect(boardRoles).toEqual(["scan", "placement", "shop", "filtering"]);
  });
});

describe("relance du staff", () => {
  it("dimanche 9 h : aujourd'hui à 10 h tant que l'événement n'est pas le jour même", () => {
    const next = nextReminder(NOW, "2026-10-24T17:00:00Z");
    expect(next?.toISOString()).toBe("2026-10-18T08:00:00.000Z");
    expect(next && reminderText(next, NOW)).toBe("aujourd'hui à 10 h");
  });
  it("après 10 h : demain à 10 h", () => {
    const at = new Date("2026-10-18T12:00:00Z");
    const next = nextReminder(at, "2026-10-24T17:00:00Z");
    expect(next && reminderText(next, at)).toBe("demain à 10 h");
  });
  it("plus de relance le jour J ni après", () => {
    expect(nextReminder(NOW, "2026-10-18T17:00:00Z")).toBeNull();
    expect(nextReminder(NOW, "2026-10-17T17:00:00Z")).toBeNull();
  });
  it("la veille de l'événement : encore une relance, puis plus rien le jour J", () => {
    const eve = new Date("2026-10-23T12:00:00Z");
    expect(nextReminder(eve, "2026-10-24T17:00:00Z")).toBeNull();
    expect(nextReminder(new Date("2026-10-22T12:00:00Z"), "2026-10-24T17:00:00Z")?.toISOString()).toBe(
      "2026-10-23T08:00:00.000Z",
    );
  });
});

describe("prestataires par mission", () => {
  const need = (id: string, filled: number, quantity: number): EventNeedView =>
    ({ id, tradeLabel: "Food truck", filled, quantity }) as unknown as EventNeedView;
  const app = (id: string, needId: string | null) =>
    ({
      id,
      provider: { need: needId ? { id: needId, trade: "food_truck", tradeLabel: "Food truck" } : null },
    }) as unknown as ApplicationForTriage;
  it("groupe par mission puis les candidatures sans mission", () => {
    const groups = missionGroups([app("1", "n1"), app("2", null), app("3", "n1")], [need("n1", 1, 2)]);
    expect(groups.map((g) => g.label)).toEqual(["Food truck · 1 place sur 2", "Sans mission précise"]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["1", "3"]);
    expect(groups[1]?.items.map((i) => i.id)).toEqual(["2"]);
  });
  it("garde une mission vide visible", () => {
    const groups = missionGroups([], [need("n1", 0, 1)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Food truck · 0 place sur 1");
  });
});
