// Lot 40 : six casquettes (exposant ou visiteur, organisateur, pro, prestataire, média) et l'Administration, chacune
// avec son groupe de routes et ses cinq onglets ; exposant ↔ visiteur selon les véhicules actifs (V5).
import { tabSets } from "@orasso/design-system";
import type { PersonaEntry } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { neighbourRoute, shouldCaptureSwipe, swipeDirection } from "../features/nav/swipe";
import {
  type AppPersonaKind,
  baseOf,
  FAN,
  homeOf,
  isBaseKind,
  kindOfSegment,
  landingOf,
  misplacedGroup,
  parsePersona,
  personaGroups,
  personaKindLabels,
  personaOfEntry,
  personaTabSets,
  personaTabs,
  resolvePersona,
  serializePersona,
  tabHref,
  VISITOR,
} from "./personaModel";

const fan: PersonaEntry = { kind: "fan", id: "fan", label: "Passionné · exposant", logoUrl: null, badge: 0 };
const visitor: PersonaEntry = { kind: "visitor", id: "visitor", label: "Visiteur", logoUrl: null, badge: 0 };
const orga: PersonaEntry = { kind: "organizer", id: "s-1", label: "MéditeSportCar", logoUrl: null, badge: 3 };
const media: PersonaEntry = { kind: "media", id: "m-1", label: "Sud Cars", logoUrl: null, badge: 0 };

describe("casquette de base : exposant ou visiteur (V5)", () => {
  it("la base est celle que renvoie l'API ; l'exposant avant la réponse", () => {
    expect(baseOf([fan, orga])).toEqual(FAN);
    expect(baseOf([visitor, orga])).toEqual(VISITOR);
    expect(baseOf([])).toEqual(FAN);
    expect(isBaseKind("fan")).toBe(true);
    expect(isBaseKind("visitor")).toBe(true);
    expect(isBaseKind("organizer")).toBe(false);
  });

  it("un exposant mémorisé sans véhicule devient visiteur, et inversement", () => {
    expect(resolvePersona(FAN, [visitor])).toEqual(VISITOR);
    expect(resolvePersona(VISITOR, [fan])).toEqual(FAN);
    expect(resolvePersona(null, [visitor, orga])).toEqual(VISITOR);
  });

  it("une casquette disparue revient à la base du compte, visiteur compris", () => {
    expect(resolvePersona({ kind: "organizer", structureId: "s-9" }, [visitor, orga])).toEqual(VISITOR);
    expect(resolvePersona({ kind: "media", mediaProfileId: "m-1" }, [visitor, media])).toEqual({
      kind: "media",
      mediaProfileId: "m-1",
    });
    expect(resolvePersona({ kind: "media", mediaProfileId: "m-2" }, [fan, media])).toEqual(FAN);
  });

  it("chaque ligne de l'API donne sa casquette", () => {
    expect(personaOfEntry(visitor)).toEqual(VISITOR);
    expect(personaOfEntry(media)).toEqual({ kind: "media", mediaProfileId: "m-1" });
    expect(personaOfEntry(fan)).toEqual(FAN);
  });
});

describe("six groupes de routes, cinq onglets chacun", () => {
  const kinds = ["fan", "visitor", "pro", "provider", "media", "organizer"] as const;

  it("un groupe par casquette, sans doublon", () => {
    const groups = Object.values(personaGroups);
    expect(new Set(groups).size).toBe(groups.length);
    expect(personaGroups.visitor).toBe("(visitor)");
    expect(personaGroups.media).toBe("(media)");
    for (const kind of Object.keys(personaGroups) as AppPersonaKind[]) {
      expect(kindOfSegment(personaGroups[kind])).toBe(kind);
    }
  });

  it("les onglets suivent les barres v2 du système de design, dans l'ordre", () => {
    for (const kind of kinds) {
      const ids = Object.values(personaTabs[kind]);
      expect(ids).toEqual(tabSets[personaTabSets[kind]].map((tab) => tab.id));
      expect(ids).toHaveLength(5);
    }
  });

  it("l'Accueil d'une casquette est l'onglet central de sa barre (Direct pour l'organisateur)", () => {
    for (const kind of kinds) {
      const routes = Object.keys(personaTabs[kind]);
      expect(homeOf({ kind } as never)).toBe(`/${personaGroups[kind]}/${routes[2]}`);
    }
    expect(homeOf({ kind: "visitor" })).toBe("/(visitor)/accueil");
    expect(homeOf({ kind: "media", mediaProfileId: "m-1" })).toBe("/(media)/accueil");
    expect(homeOf({ kind: "organizer", structureId: "s-1" })).toBe("/(orga)/direct");
  });

  it("on ouvre une casquette sur un onglet rempli tant que son Accueil est « Bientôt »", () => {
    expect(landingOf({ kind: "pro", proProfileId: "p-1" })).toBe("/(pro)/scanner");
    expect(landingOf({ kind: "provider" })).toBe("/(provider)/candidatures");
    expect(landingOf(VISITOR)).toBe("/(visitor)/accueil");
    expect(landingOf({ kind: "organizer", structureId: "s-1" })).toBe("/(orga)/direct");
  });

  it("chemin d'un onglet, `null` quand la barre ne l'a pas", () => {
    expect(tabHref("visitor", "sorties")).toBe("/(visitor)/sorties");
    expect(tabHref("fan", "garage")).toBe("/(tabs)/garage");
    expect(tabHref("visitor", "garage")).toBeNull();
    expect(tabHref("pro", "explorer")).toBeNull();
    expect(tabHref("organizer", "equipe")).toBe("/(orga)/equipe");
    expect(tabHref("admin", "profil")).toBeNull();
  });

  it("onglet voisin pour le glissement, rien au bord ; une page masquée ne glisse pas", () => {
    const ids = (kind: keyof typeof personaTabs) => Object.values(personaTabs[kind]);
    const fanRoutes = personaTabs.fan as Record<string, string>;
    expect(neighbourRoute(ids("fan"), fanRoutes, "accueil", 1)).toBe("garage");
    expect(neighbourRoute(ids("fan"), fanRoutes, "accueil", -1)).toBe("sorties");
    expect(neighbourRoute(ids("fan"), fanRoutes, "explorer", -1)).toBeNull();
    expect(neighbourRoute(ids("fan"), fanRoutes, "profil", 1)).toBeNull();
    const proRoutes = { ...personaTabs.pro, modifier: "card" } as Record<string, string>;
    expect(neighbourRoute(ids("pro"), proRoutes, "modifier", 1)).toBeNull();
    expect(neighbourRoute(ids("pro"), proRoutes, "fiche", 1)).toBe("accueil");
    expect(neighbourRoute(ids("pro"), proRoutes, "inconnue", 1)).toBeNull();
  });

  it("le geste : horizontal franc, un quart de l'écran ou 600 px/s", () => {
    expect(shouldCaptureSwipe(13, 2)).toBe(true);
    expect(shouldCaptureSwipe(11, 0)).toBe(false);
    expect(shouldCaptureSwipe(-40, 9)).toBe(false);
    expect(swipeDirection(-100, 0, 390)).toBe(1);
    expect(swipeDirection(100, 0, 390)).toBe(-1);
    expect(swipeDirection(-60, 0, 390)).toBe(0);
    expect(swipeDirection(-30, -700, 390)).toBe(1);
    // Un geste vif dans l'autre sens que le déplacement ne compte pas.
    expect(swipeDirection(-30, 700, 390)).toBe(0);
    expect(swipeDirection(0, 900, 390)).toBe(0);
  });

  it("le visiteur dans le groupe de l'exposant est mal placé, et inversement", () => {
    expect(misplacedGroup(VISITOR, "(tabs)")).toBe(true);
    expect(misplacedGroup(FAN, "(visitor)")).toBe(true);
    expect(misplacedGroup(VISITOR, "(visitor)")).toBe(false);
    expect(misplacedGroup({ kind: "media", mediaProfileId: "m-1" }, "(media)")).toBe(false);
    expect(misplacedGroup(VISITOR, "boite")).toBe(false);
  });
});

describe("mémorisation et libellés", () => {
  it("relit le visiteur et le média", () => {
    expect(parsePersona(serializePersona(VISITOR))).toEqual(VISITOR);
    const m = { kind: "media", mediaProfileId: "m-1" } as const;
    expect(parsePersona(serializePersona(m))).toEqual(m);
    expect(parsePersona('{"kind":"media"}')).toBeNull();
  });

  it("un seul jeu de libellés : ceux du prototype, plus l'Administration", () => {
    expect(personaKindLabels.fan).toBe("Exposant");
    expect(personaKindLabels.visitor).toBe("Visiteur");
    expect(personaKindLabels.admin).toBe("Administration");
  });
});
