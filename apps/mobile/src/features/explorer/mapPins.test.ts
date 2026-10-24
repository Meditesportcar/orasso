import type { EventCard, ProCard } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  eventPins,
  eventPinsData,
  FRANCE_VIEW,
  groupKind,
  mapHeight,
  pinsKey,
  proPins,
  proPinsData,
  viewFor,
} from "./mapPins";

const event = (over: Partial<EventCard>): EventCard =>
  ({
    id: "e1",
    slug: "expo-rivesaltes",
    title: "Expo Rivesaltes",
    format: "exhibition",
    city: "Rivesaltes",
    lat: 42.77,
    lng: 2.87,
    startsAt: "2026-10-24T17:00:00Z",
    ...over,
  }) as EventCard;

const pro = (over: Partial<ProCard>): ProCard =>
  ({
    slug: "garage-du-port",
    name: "Garage du Port",
    activities: ["garage"],
    city: "Canet",
    lat: 42.7,
    lng: 3.01,
    ...over,
  }) as ProCard;

describe("épingles de la carte", () => {
  it("seuls les événements avec une position ont une épingle, avec le lien de leur page", () => {
    const pins = eventPins(
      [event({}), event({ id: "e2", slug: "sans-adresse", lat: null, lng: null })],
      new Date("2026-10-20T10:00:00Z"),
    );
    expect(pins).toHaveLength(1);
    // Lot R2 : la date en clair.
    expect(pins[0]).toMatchObject({
      id: "e1",
      kind: "event",
      label: "SAM. 24 OCT.",
      href: "/e/expo-rivesaltes",
      lat: 42.77,
    });
    expect(eventPins([event({})], new Date("2026-10-24T06:00:00Z"))[0]?.label).toBe("AUJOURD'HUI");
    expect(pins[0]?.subtitle).toContain("Rivesaltes");
  });

  it("les pros : épingle sur la fiche, un pro sans adresse (zone d'intervention) n'en a pas", () => {
    const pins = proPins([pro({}), pro({ slug: "a-domicile", lat: null, lng: null })]);
    expect(pins.map((p) => p.href)).toEqual(["/p/garage-du-port"]);
    expect(pins[0]).toMatchObject({ kind: "pro", label: "Garage du Port" });
  });
});

describe("vue de départ", () => {
  it("rien à montrer : la France", () => {
    expect(viewFor([])).toEqual(FRANCE_VIEW);
  });

  it("une épingle : un zoom de ville centré dessus", () => {
    expect(viewFor(eventPins([event({})], new Date("2026-10-20T10:00:00Z")))).toEqual({
      center: [2.87, 42.77],
      zoom: 10,
    });
  });

  it("plusieurs épingles : le cadre qui les contient (ouest, sud, est, nord)", () => {
    const pins = eventPins(
      [
        event({ id: "a", lat: 42.7, lng: 2.9 }),
        event({ id: "b", lat: 43.6, lng: 1.4 }),
        event({ id: "c", lat: 43.2, lng: 3.0 }),
      ],
      new Date("2026-10-20T10:00:00Z"),
    );
    expect(viewFor(pins)).toEqual({ bounds: [1.4, 42.7, 3.0, 43.6] });
  });

  it("toutes au même endroit : pas de cadre vide", () => {
    const pins = eventPins([event({ id: "a" }), event({ id: "b" })], new Date("2026-10-20T10:00:00Z"));
    expect(viewFor(pins)).toEqual({ center: [2.87, 42.77], zoom: 10 });
  });

  it("la clé change avec les épingles", () => {
    const a = eventPins([event({ id: "a" })], new Date("2026-10-20T10:00:00Z"));
    const b = eventPins([event({ id: "a" }), event({ id: "b" })], new Date("2026-10-20T10:00:00Z"));
    expect(pinsKey(a)).not.toBe(pinsKey(b));
  });
});

describe("hauteur de la carte (lot 59c, tour 2)", () => {
  it("55 % de l'écran, mais au moins 30 % de l'écran laissé à la page hors de la carte", () => {
    expect(mapHeight(844)).toBe(441);
    // Petit téléphone (390 × 700) : 340 px, il reste 210 px (30 %) de page hors des barres et de la carte.
    expect(mapHeight(700)).toBe(340);
    expect(700 - 150 - mapHeight(700)).toBeGreaterThanOrEqual(0.3 * 700);
    expect(mapHeight(1400)).toBe(520);
    expect(mapHeight(400)).toBe(280);
  });
});

describe("relecture du lot R1 : épingles à jour quand les données changent", () => {
  it("mêmes identifiants, adresse, coordonnées ou date corrigées : la clé des données change", () => {
    const before = [event({}), event({ id: "e2", slug: "b" })];
    const moved = [event({ lat: 42.8 }), event({ id: "e2", slug: "b" })];
    const later = [event({ startsAt: "2026-10-25T17:00:00Z" }), event({ id: "e2", slug: "b" })];
    expect(pinsKey(eventPins(before, new Date()))).toBe(pinsKey(eventPins(moved, new Date())));
    expect(eventPinsData(moved)).not.toBe(eventPinsData(before));
    expect(eventPinsData(later)).not.toBe(eventPinsData(before));
    expect(eventPinsData([...before])).toBe(eventPinsData(before));
    expect(proPinsData([pro({ lng: 3.02 })])).not.toBe(proPinsData([pro({})]));
  });

  it("une pastille de groupe dit ce qu'elle regroupe", () => {
    expect(groupKind([{ kind: "event" }, { kind: "event" }])).toBe("event");
    expect(groupKind([{ kind: "pro" }, { kind: "pro" }])).toBe("pro");
    expect(groupKind([{ kind: "pro" }, { kind: "event" }])).toBeUndefined();
  });
});
