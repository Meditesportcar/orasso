import type { EventCard, HomeData, HomeSponsored } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { homeRail, scrubSpot, splitSponsored } from "./rail";

const NOW = new Date("2026-10-22T10:00:00Z");
const sponsored: HomeSponsored = {
  id: "s1",
  title: "Polish avant saison",
  body: "-15 %",
  imageUrl: null,
  linkUrl: "https://exemple.fr",
  pro: { slug: "detailing", name: "Detailing", logoUrl: null },
};
const event = (slug: string, days: number) =>
  ({ id: slug, slug, title: slug, startsAt: new Date(NOW.getTime() + days * 864e5).toISOString() }) as EventCard;

describe("Accueil : emplacement sponsorisé et rail", () => {
  it("la réponse gardée dans le cache ne porte jamais le sponsorisé ; seule la réponse fraîche le donne", () => {
    const fresh = { sponsored, nearby: null } as unknown as HomeData;
    const { cacheable, sponsored: shown } = splitSponsored(fresh);
    expect(cacheable.sponsored).toBeNull();
    expect(shown?.id).toBe("s1");
    // Servie depuis le cache (sans réponse fraîche), l'Accueil n'a donc rien à montrer.
    expect(homeRail([], splitSponsored(cacheable).sponsored, null, NOW).visible).toBe(false);
  });

  it("le rendez-vous au spot (son lieu) n'est jamais dans la copie gardée ; une copie ancienne est nettoyée", () => {
    const spot = {
      others: 0,
      meetup: { id: "m1", place: { label: "Port de Saint-Cyprien", lat: 42.62, lng: 3.03 } },
    } as unknown as HomeData["spotMeetup"];
    const fresh = { sponsored: null, nearby: null, spotMeetup: spot } as unknown as HomeData;
    const { cacheable, spotMeetup } = splitSponsored(fresh);
    expect(spotMeetup).toBe(spot);
    expect(JSON.stringify(cacheable)).not.toMatch(/Saint-Cyprien|42.62|"lat"/);
    expect(scrubSpot(cacheable)).toBeNull();
    // Une copie déjà enregistrée avec un lieu : relue sans lui.
    const old = scrubSpot(fresh);
    expect(old?.spotMeetup).toBeNull();
    expect(JSON.stringify(old)).not.toMatch(/Saint-Cyprien|42.62/);
  });

  it("rail vide : l'affiche sponsorisée seule le rend visible", () => {
    const rail = homeRail([], sponsored, null, NOW);
    expect(rail.events).toEqual([]);
    expect(rail.visible).toBe(true);
    expect(rail.sponsored?.title).toBe("Polish avant saison");
  });

  it("le rail garde le mois qui vient, sans l'événement de la carte", () => {
    const rail = homeRail([event("carte", 2), event("proche", 5), event("loin", 40)], null, "carte", NOW);
    expect(rail.events.map((e) => e.slug)).toEqual(["proche"]);
    expect(rail.visible).toBe(true);
  });
});
