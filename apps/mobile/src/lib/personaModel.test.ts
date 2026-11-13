// Lot 40 : six casquettes (exposant ou visiteur, organisateur, pro, prestataire, média) et l'Administration, chacune
// avec son groupe de routes et ses cinq onglets ; exposant ↔ visiteur selon les véhicules actifs (V5).
import { tabSets } from "@orasso/design-system";
import type { PersonaEntry } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { neighbourRoute, shouldCaptureSwipe, swipeDirection } from "../features/nav/swipe";
import {
  type AppPersonaKind,
  baseOf,
  destinationHref,
  FAN,
  homeOf,
  isBaseKind,
  isHiddenPage,
  kindOfSegment,
  landingOf,
  misplacedGroup,
  misplacedTarget,
  parsePersona,
  personaGroups,
  personaHiddenPages,
  personaKindLabels,
  personaLegacyRoutes,
  personaOfEntry,
  personaTabSets,
  personaTabs,
  profileHref,
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

describe("la barre du passionné (lot R7a1, D38)", () => {
  it("Explorer · Le Fil · Accueil · Crew · Profil, pour l'exposant comme pour le visiteur", () => {
    expect(Object.keys(personaTabs.fan)).toEqual(["explorer", "fil", "accueil", "crew", "profil"]);
    expect(Object.keys(personaTabs.visitor)).toEqual(["explorer", "fil", "accueil", "crew", "profil"]);
    expect(tabSets.exhibitor.map((tab) => tab.label)).toEqual(["Explorer", "Le Fil", "Accueil", "Crew", "Profil"]);
    expect(tabSets.visitor.map((tab) => tab.label)).toEqual(["Explorer", "Le Fil", "Accueil", "Crew", "Profil"]);
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

  it("on ouvre une casquette sur son Accueil (lot 43 : le pro et le prestataire ont le leur)", () => {
    expect(landingOf({ kind: "pro", proProfileId: "p-1" })).toBe("/(pro)/accueil");
    expect(landingOf({ kind: "provider" })).toBe("/(provider)/accueil");
    expect(landingOf(VISITOR)).toBe("/(visitor)/accueil");
    expect(landingOf({ kind: "organizer", structureId: "s-1" })).toBe("/(orga)/direct");
  });

  it("exposant ↔ visiteur : même onglet dans la nouvelle barre, sinon le Profil ; ailleurs l'écran d'ouverture", () => {
    expect(misplacedTarget(FAN, ["(visitor)", "profil"])).toBe("/(tabs)/profil");
    // Lot R7a1 : même barre pour l'exposant et le visiteur ; l'ancien Passeport du visiteur n'est plus un onglet.
    expect(misplacedTarget(FAN, ["(visitor)", "passeport"])).toBe("/(tabs)/profil");
    expect(misplacedTarget(FAN, ["(visitor)", "fil"])).toBe("/(tabs)/fil");
    expect(misplacedTarget(VISITOR, ["(tabs)", "crew"])).toBe("/(visitor)/crew");
    expect(misplacedTarget(VISITOR, ["(tabs)", "explorer"])).toBe("/(visitor)/explorer");
    expect(misplacedTarget(VISITOR, ["(tabs)", "garage"])).toBe("/(visitor)/profil");
    expect(misplacedTarget(VISITOR, ["(tabs)", "sorties"])).toBe("/(visitor)/profil");
    expect(misplacedTarget({ kind: "pro", proProfileId: "p" }, ["(orga)", "tri"])).toBe("/(pro)/accueil");
    // `/explorer` résolu dans le groupe média, `/accueil` dans celui du pro : l'onglet de la casquette active.
    expect(misplacedTarget(VISITOR, ["(media)", "explorer"])).toBe("/(visitor)/explorer");
    expect(misplacedTarget(FAN, ["(pro)", "accueil"])).toBe("/(tabs)/accueil");
    expect(misplacedTarget(FAN, ["(tabs)", "profil"])).toBeNull();
    expect(misplacedTarget(FAN, ["boite"])).toBeNull();
  });

  it("chemin d'un onglet, `null` quand la barre ne l'a pas", () => {
    expect(tabHref("visitor", "fil")).toBe("/(visitor)/fil");
    expect(tabHref("fan", "crew")).toBe("/(tabs)/crew");
    // Lot R7a1 : Sorties, Garage et Passeport ne sont plus des onglets, mais des pages qui gardent leur adresse.
    expect(tabHref("visitor", "sorties")).toBeNull();
    expect(tabHref("fan", "garage")).toBeNull();
    expect(destinationHref("fan", "sorties")).toBe("/sorties");
    expect(destinationHref("fan", "garage")).toBeNull();
    // Lot R7b1 : le Garage et le Passeport vivent dans le Profil de la casquette de base.
    expect(profileHref("fan", "garage")).toBe("/(tabs)/profil?onglet=garage");
    expect(profileHref("visitor", "sorties")).toBe("/(visitor)/profil?onglet=sorties");
    expect(destinationHref("visitor", "sorties")).toBe("/sorties");
    expect(destinationHref("visitor", "passeport")).toBeNull();
    expect(destinationHref("visitor", "garage")).toBeNull();
    expect(destinationHref("fan", "profil")).toBe("/(tabs)/profil");
    expect(destinationHref("pro", "sorties")).toBeNull();
    expect(tabHref("pro", "explorer")).toBeNull();
    // Lot R9n : l'Équipe n'est plus un onglet de l'organisateur, mais une page masquée qui garde son adresse.
    expect(tabHref("organizer", "equipe")).toBeNull();
    expect(destinationHref("organizer", "equipe")).toBe("/(orga)/equipe");
    expect(tabHref("admin", "profil")).toBeNull();
  });

  it("onglet voisin pour le glissement, rien au bord ; une page masquée ne glisse pas", () => {
    const ids = (kind: keyof typeof personaTabs) => Object.values(personaTabs[kind]);
    const fanRoutes = personaTabs.fan as Record<string, string>;
    expect(neighbourRoute(ids("fan"), fanRoutes, "accueil", 1)).toBe("crew");
    expect(neighbourRoute(ids("fan"), fanRoutes, "accueil", -1)).toBe("fil");
    expect(neighbourRoute(ids("fan"), fanRoutes, "fil", -1)).toBe("explorer");
    expect(neighbourRoute(ids("fan"), fanRoutes, "explorer", -1)).toBeNull();
    expect(neighbourRoute(ids("fan"), fanRoutes, "profil", 1)).toBeNull();
    // Lot R9n : Ma fiche et Modifier sont des pages masquées rangées sous « Page » : elles ne glissent pas.
    const proRoutes = { ...personaTabs.pro, fiche: "page", modifier: "page" } as Record<string, string>;
    expect(neighbourRoute(ids("pro"), proRoutes, "modifier", 1)).toBeNull();
    expect(neighbourRoute(ids("pro"), proRoutes, "fiche", -1)).toBeNull();
    expect(neighbourRoute(ids("pro"), proRoutes, "fil", 1)).toBe("accueil");
    expect(neighbourRoute(ids("pro"), proRoutes, "page", 1)).toBeNull();
    expect(neighbourRoute(ids("pro"), proRoutes, "page", -1)).toBe("stats");
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

describe("les quatre barres des casquettes (lot R9n, maquette R9.1)", () => {
  const labels = (kind: Exclude<AppPersonaKind, "admin" | "fan" | "visitor">) =>
    tabSets[personaTabSets[kind]].map((tab) => tab.label);

  it("organisateur : Événements · Tri · Direct · Le Fil · Page", () => {
    expect(labels("organizer")).toEqual(["Événements", "Tri", "Direct", "Le Fil", "Page"]);
    expect(Object.keys(personaTabs.organizer)).toEqual(["evenements", "tri", "direct", "fil", "page"]);
  });
  it("pro : Scanner · Le Fil · Accueil · Stats · Page", () => {
    expect(labels("pro")).toEqual(["Scanner", "Le Fil", "Accueil", "Stats", "Page"]);
    expect(Object.keys(personaTabs.pro)).toEqual(["scanner", "fil", "accueil", "stats", "page"]);
  });
  it("prestataire : Missions · Le Fil · Accueil · Candidatures · Page", () => {
    expect(labels("provider")).toEqual(["Missions", "Le Fil", "Accueil", "Candidatures", "Page"]);
    expect(Object.keys(personaTabs.provider)).toEqual(["missions", "fil", "accueil", "candidatures", "page"]);
  });
  it("média : Explorer · Le Fil · Accueil · Presse · Page", () => {
    expect(labels("media")).toEqual(["Explorer", "Le Fil", "Accueil", "Presse", "Page"]);
    expect(Object.keys(personaTabs.media)).toEqual(["explorer", "fil", "accueil", "presse", "page"]);
  });
  it("le centre reste le troisième onglet : Direct pour l'organisateur, Accueil pour les trois autres", () => {
    for (const kind of ["organizer", "pro", "provider", "media"] as const) {
      expect(tabSets[personaTabSets[kind]][2]?.center).toBe(true);
      expect(homeOf({ kind } as never)).toBe(`/${personaGroups[kind]}/${Object.keys(personaTabs[kind])[2]}`);
    }
    expect(homeOf({ kind: "organizer", structureId: "s" })).toBe("/(orga)/direct");
  });
  it("les anciennes adresses d'onglet restent joignables comme pages masquées : pas d'onglet, mais une destination", () => {
    const olds: [Exclude<AppPersonaKind, "admin">, string, string][] = [
      ["organizer", "equipe", "/(orga)/equipe"],
      ["organizer", "structure", "/(orga)/structure"],
      ["organizer", "bannis", "/(orga)/bannis"],
      ["organizer", "modeles", "/(orga)/modeles"],
      ["organizer", "notes", "/(orga)/notes"],
      ["pro", "fiche", "/(pro)/fiche"],
      ["pro", "modifier", "/(pro)/modifier"],
      ["pro", "publier", "/(pro)/publier"],
      ["provider", "vitrine", "/(provider)/vitrine"],
      ["media", "contenus", "/(media)/contenus"],
    ];
    for (const [kind, route, href] of olds) {
      expect(tabHref(kind, route)).toBeNull();
      expect(isHiddenPage(kind, route)).toBe(true);
      expect(destinationHref(kind, route)).toBe(href);
    }
    // L'ancien « Profil » du pro, du prestataire et du média : une page masquée (adresse valable), plus une destination.
    for (const kind of ["pro", "provider", "media"] as const) {
      expect(personaLegacyRoutes[kind]).toEqual(["profil"]);
      expect(tabHref(kind, "profil")).toBeNull();
      expect(destinationHref(kind, "profil")).toBeNull();
    }
    expect(personaHiddenPages.organizer).toContain("equipe");
  });
  it("« Profil » depuis une casquette de page : pas de Profil à elle, le repli est celui de la base (goTab)", () => {
    for (const kind of ["organizer", "pro", "provider", "media"] as const) {
      expect(destinationHref(kind, "profil")).toBeNull();
      expect(destinationHref("fan", "profil")).toBe("/(tabs)/profil");
      expect(destinationHref("visitor", "profil")).toBe("/(visitor)/profil");
    }
  });
  it("une page masquée n'est ni un onglet de la barre ni une page d'une autre casquette", () => {
    expect(isHiddenPage("pro", "vitrine")).toBe(false);
    expect(isHiddenPage("fan", "fiche")).toBe(false);
    expect(destinationHref("provider", "fiche")).toBeNull();
  });
  it("une ancienne adresse d'un autre groupe se redirige sans boucle vers la barre de la casquette active", () => {
    // Le pro tombe sur /(provider)/vitrine : pas de « vitrine » dans sa barre, on l'envoie à son Accueil.
    expect(misplacedTarget({ kind: "pro", proProfileId: "p" }, ["(provider)", "vitrine"])).toBe("/(pro)/accueil");
    // Le Fil existe chez les quatre casquettes : même onglet.
    expect(misplacedTarget({ kind: "pro", proProfileId: "p" }, ["(tabs)", "fil"])).toBe("/(pro)/fil");
    expect(misplacedTarget({ kind: "organizer", structureId: "s" }, ["(media)", "fil"])).toBe("/(orga)/fil");
    expect(misplacedTarget({ kind: "media", mediaProfileId: "m" }, ["(pro)", "page"])).toBe("/(media)/page");
    // Dans son propre groupe, jamais de redirection (y compris sur une page masquée).
    expect(misplacedTarget({ kind: "pro", proProfileId: "p" }, ["(pro)", "fiche"])).toBeNull();
    expect(misplacedTarget({ kind: "organizer", structureId: "s" }, ["(orga)", "equipe"])).toBeNull();
    // Une casquette qui perd son Profil : un lien du passionné vers /(tabs)/profil ne la ramène pas à un Profil inexistant.
    // (tour 1, point 9) : un lien vers « profil » pris en casquette mène à la Page de la casquette.
    expect(misplacedTarget({ kind: "pro", proProfileId: "p" }, ["(tabs)", "profil"])).toBe("/(pro)/page");
    expect(misplacedTarget({ kind: "organizer", structureId: "s" }, ["(visitor)", "profil"])).toBe("/(orga)/page");
    expect(misplacedTarget({ kind: "admin" }, ["(tabs)", "profil"])).toBe("/(admin)/administration");
  });
  it("la barre du passionné n'a pas bougé", () => {
    expect(Object.keys(personaTabs.fan)).toEqual(["explorer", "fil", "accueil", "crew", "profil"]);
    expect(Object.keys(personaTabs.visitor)).toEqual(["explorer", "fil", "accueil", "crew", "profil"]);
  });
});
