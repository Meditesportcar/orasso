import type { EventCard, ProCard } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { eventPins, FRANCE_VIEW, OSM_STYLE, pinsKey, proPins, viewFor } from "./mapPins";

const event = (over: Partial<EventCard>): EventCard =>
  ({
    id: "e1",
    slug: "expo-rivesaltes",
    title: "Expo Rivesaltes",
    format: "exhibition",
    city: "Rivesaltes",
    lat: 42.77,
    lng: 2.87,
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
    const pins = eventPins([event({}), event({ id: "e2", slug: "sans-adresse", lat: null, lng: null })]);
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ id: "e1", href: "/e/expo-rivesaltes", lat: 42.77, lng: 2.87 });
    expect(pins[0]?.subtitle).toContain("Rivesaltes");
  });

  it("les pros : épingle sur la fiche, un pro sans adresse (zone d'intervention) n'en a pas", () => {
    const pins = proPins([pro({}), pro({ slug: "a-domicile", lat: null, lng: null })]);
    expect(pins.map((p) => p.href)).toEqual(["/p/garage-du-port"]);
  });
});

describe("vue de départ", () => {
  it("rien à montrer : la France", () => {
    expect(viewFor([])).toEqual(FRANCE_VIEW);
  });

  it("une épingle : un zoom de ville centré dessus", () => {
    expect(viewFor(eventPins([event({})]))).toEqual({ center: [2.87, 42.77], zoom: 10 });
  });

  it("plusieurs épingles : le cadre qui les contient (ouest, sud, est, nord)", () => {
    const pins = eventPins([
      event({ id: "a", lat: 42.7, lng: 2.9 }),
      event({ id: "b", lat: 43.6, lng: 1.4 }),
      event({ id: "c", lat: 43.2, lng: 3.0 }),
    ]);
    expect(viewFor(pins)).toEqual({ bounds: [1.4, 42.7, 3.0, 43.6] });
  });

  it("toutes au même endroit : pas de cadre vide", () => {
    const pins = eventPins([event({ id: "a" }), event({ id: "b" })]);
    expect(viewFor(pins)).toEqual({ center: [2.87, 42.77], zoom: 10 });
  });

  it("la clé change avec les épingles", () => {
    const a = eventPins([event({ id: "a" })]);
    const b = eventPins([event({ id: "a" }), event({ id: "b" })]);
    expect(pinsKey(a)).not.toBe(pinsKey(b));
  });
});

describe("fond de carte", () => {
  it("les mêmes tuiles OpenStreetMap que le site, avec leur mention", () => {
    expect(OSM_STYLE.sources.osm.tiles[0]).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(OSM_STYLE.sources.osm.attribution).toContain("OpenStreetMap");
  });
});
