import { describe, expect, it } from "vitest";

import { nearestDepartment } from "./geo";
import {
  addHomeWidget,
  defaultHomeWidgets,
  HOME_FIXED_WIDGET,
  homeWidgetIds,
  homeWidgetOffered,
  moveHomeWidget,
  moveVisibleHomeWidget,
  normalizeHomeWidgets,
  outingDetail,
  toggleHomeWidget,
  visibleHomeWidgets,
} from "./home";
import { pickWeighted, placementMatch, seededUnit } from "./rules/sponsored";
import { homeQuerySchema, homeWidgetsSchema, sponsoredPlacementCreateSchema } from "./schemas/home";

describe("réglage des widgets de l'accueil", () => {
  it("vaut l'ordre par défaut sans réglage ou avec un ancien format", () => {
    expect(normalizeHomeWidgets(null)).toEqual(defaultHomeWidgets);
    expect(normalizeHomeWidgets([{ id: "meteo", visible: true }])).toEqual(defaultHomeWidgets);
    expect(normalizeHomeWidgets("n'importe quoi")).toEqual(defaultHomeWidgets);
  });

  it("tour 2 : un garage favori reste affiché par défaut ; Agenda et Candidatures en attente restent masqués", () => {
    const withGarage = normalizeHomeWidgets(null, { favoriteGarage: true });
    expect(withGarage.hidden).toEqual(["agenda", "pending"]);
    expect(normalizeHomeWidgets(null).hidden).toContain("favorite_garage");
    // Un réglage enregistré prime : le garage masqué à la main le reste.
    expect(normalizeHomeWidgets({ order: [], hidden: ["favorite_garage"] }, { favoriteGarage: true }).hidden).toEqual([
      "favorite_garage",
    ]);
  });

  it("retire les inconnus et les doublons, complète les manquants, garde « Prochain accès » en tête", () => {
    const c = normalizeHomeWidgets({
      order: ["fuel", "x", "fuel", "weather", "next_access"],
      hidden: ["fuel", "nope"],
    });
    expect(c.order[0]).toBe(HOME_FIXED_WIDGET);
    // Les blocs qui manquent au réglage enregistré (« En cours », lot R7d1 ; Mes sorties… Souvenirs, lot R7a2) prennent leur
    // place par défaut : juste après « Prochaine sortie », avant « Autour de moi » et avant les blocs du réglage.
    expect(c.order.slice(1, 9)).toEqual([
      "event_weather",
      "live",
      "my_outings",
      "my_crew",
      "friends_news",
      "spot_meetup",
      "memories",
      "nearby",
    ]);
    expect(c.order.slice(9, 12)).toEqual(["fuel", "weather", "practical"]);
    expect([...c.order].sort()).toEqual([...homeWidgetIds].sort());
    expect(c.hidden).toEqual(["fuel"]);
  });

  it("lot R8e1 : un réglage R7 enregistré reçoit « Météo de l'événement » juste après « Prochaine sortie », visible", () => {
    const c = normalizeHomeWidgets({ order: ["next_access", "live", "my_outings", "weather"], hidden: ["agenda"] });
    expect(c.order.slice(0, 3)).toEqual(["next_access", "event_weather", "live"]);
    expect(c.hidden).not.toContain("event_weather");
    expect(visibleHomeWidgets(c)).toContain("event_weather");
    // Par défaut : visible, juste après « Prochaine sortie ».
    expect(defaultHomeWidgets.order.slice(0, 2)).toEqual(["next_access", "event_weather"]);
    expect(defaultHomeWidgets.hidden).not.toContain("event_weather");
  });

  it("lot R8e1, tour 2 : « Météo de l'événement » ne se déplace pas et aucun bloc ne s'échange avec lui", () => {
    const c = defaultHomeWidgets;
    expect(moveVisibleHomeWidget(c, "event_weather", 1)).toBe(c);
    expect(moveHomeWidget(c, "event_weather", 1)).toBe(c);
    // « En cours » est le premier bloc qui bouge : il ne monte pas (rien à échanger avec la ligne météo).
    expect(moveVisibleHomeWidget(c, "live", -1)).toBe(c);
    expect(moveHomeWidget(c, "live", -1)).toBe(c);
    // Descendre un bloc ne passe jamais par-dessus la ligne météo, qui garde sa place.
    const down = moveVisibleHomeWidget(c, "live", 1);
    expect(down.order.slice(0, 3)).toEqual(["next_access", "event_weather", "my_outings"]);
    expect(down.order[3]).toBe("live");
  });

  it("ne masque jamais « Prochain accès » et ne le déplace pas", () => {
    const c = normalizeHomeWidgets({ order: [], hidden: ["next_access", "wash"] });
    expect(c.hidden).toEqual(["wash"]);
    expect(toggleHomeWidget(c, "next_access")).toBe(c);
    expect(moveHomeWidget(c, "next_access", 1)).toBe(c);
    expect(moveHomeWidget(c, "event_weather", -1)).toBe(c);
  });

  it("monte, descend et masque", () => {
    let c = defaultHomeWidgets;
    c = moveHomeWidget(c, "weather", -1);
    expect(c.order.indexOf("weather")).toBeLessThan(c.order.indexOf("nearby"));
    // Stations proposées (le jour où `NEARBY_STATIONS_ENABLED` revient) : elles se déplacent comme les autres.
    c = moveHomeWidget(c, "fuel", 1, () => true);
    expect(c.order.at(-1)).toBe("fuel");
    c = moveHomeWidget(c, "wash", 1, () => true);
    expect(c.order.at(-1)).toBe("wash");
    c = toggleHomeWidget(c, "wash");
    expect(visibleHomeWidgets(c)).not.toContain("wash");
    c = toggleHomeWidget(c, "wash");
    expect(visibleHomeWidgets(c)).toContain("wash");
  });

  it("lot R1, tour 2 : stations retirées, on ne déplace qu'entre widgets proposés ; les stations gardent leur place", () => {
    // Un ancien ordre personnalisé : une station entre deux widgets proposés.
    const old = normalizeHomeWidgets({
      order: [
        "next_access",
        "live",
        "my_outings",
        "my_crew",
        "friends_news",
        "spot_meetup",
        "memories",
        "pending",
        "wash",
        "agenda",
        "fuel",
        "nearby",
        "weather",
        "favorite_garage",
      ],
      hidden: [],
    });
    const down = moveHomeWidget(old, "pending", 1);
    expect(down.order).toEqual([
      "next_access",
      "event_weather",
      "live",
      "my_outings",
      "my_crew",
      "friends_news",
      "spot_meetup",
      "memories",
      "agenda",
      "wash",
      "pending",
      "fuel",
      "nearby",
      "weather",
      "practical",
      "favorite_garage",
    ]);
    const up = moveHomeWidget(down, "nearby", -1);
    expect(up.order).toEqual([
      "next_access",
      "event_weather",
      "live",
      "my_outings",
      "my_crew",
      "friends_news",
      "spot_meetup",
      "memories",
      "agenda",
      "wash",
      "nearby",
      "fuel",
      "pending",
      "weather",
      "practical",
      "favorite_garage",
    ]);
    // Une station ne se déplace pas ; le premier proposé ne monte pas au-dessus de « Prochain accès ».
    expect(moveHomeWidget(old, "wash", 1)).toBe(old);
    expect(moveHomeWidget(down, "event_weather", -1)).toBe(down);
    // Le dernier proposé ne descend pas (les stations derrière lui ne comptent pas).
    expect(defaultHomeWidgets.order.slice(-3)).toEqual(["pending", "wash", "fuel"]);
    expect(moveHomeWidget(defaultHomeWidgets, "pending", 1)).toBe(defaultHomeWidgets);
  });

  it("lot R7a2 : ordre par défaut validé, blocs masqués par défaut, nouveaux blocs proposés", () => {
    expect(defaultHomeWidgets.order).toEqual([
      "next_access",
      "event_weather",
      "live",
      "my_outings",
      "my_crew",
      "friends_news",
      "spot_meetup",
      "memories",
      "nearby",
      "weather",
      "practical",
      "agenda",
      "favorite_garage",
      "pending",
      "wash",
      "fuel",
    ]);
    // Les blocs par défaut sont ceux que Damien a validés ; les trois autres se retrouvent dans « Ajouter ».
    expect(defaultHomeWidgets.hidden).toEqual(["agenda", "favorite_garage", "pending"]);
    expect(visibleHomeWidgets(defaultHomeWidgets).slice(0, 5)).toEqual([
      "next_access",
      "event_weather",
      "live",
      "my_outings",
      "my_crew",
    ]);
    // Au spot et Souvenirs sont proposés (vides tant que R7i et R7j n'existent pas), les stations non.
    for (const id of ["my_outings", "my_crew", "friends_news", "spot_meetup", "memories"] as const) {
      expect(homeWidgetOffered(id)).toBe(true);
      expect(homeWidgetsSchema.safeParse({ order: [id], hidden: [id] }).success).toBe(true);
    }
    expect(homeWidgetOffered("wash")).toBe(false);
  });

  it("lot R7a2 : un réglage d'avant (R7d1, ou l'ancien) reçoit les nouveaux blocs à leur place, sans rien perdre", () => {
    // Réglage enregistré avant R7a2 : l'ordre et les masqués de la personne sont gardés, les nouveaux blocs apparaissent.
    const before = normalizeHomeWidgets({
      order: ["next_access", "live", "weather", "pending", "nearby", "agenda", "favorite_garage", "wash", "fuel"],
      hidden: ["agenda"],
    });
    expect(before.order).toEqual([
      "next_access",
      "event_weather",
      "live",
      "my_outings",
      "my_crew",
      "friends_news",
      "spot_meetup",
      "memories",
      "weather",
      "practical",
      "pending",
      "nearby",
      "agenda",
      "favorite_garage",
      "wash",
      "fuel",
    ]);
    expect(before.hidden).toEqual(["agenda"]);
    // Une liste de masqués enregistrée, même vide, est respectée ; absente, ce sont les masqués par défaut.
    expect(normalizeHomeWidgets({ order: [], hidden: [] }).hidden).toEqual([]);
    expect(normalizeHomeWidgets({ order: ["weather"] }).hidden).toEqual(["agenda", "favorite_garage", "pending"]);
    // Normaliser deux fois ne change rien.
    expect(normalizeHomeWidgets(before)).toEqual(before);
  });

  it("lot R7a2 : « Personnaliser » monte et descend parmi les blocs affichés, jamais avec un bloc masqué", () => {
    // Par défaut, Agenda, Garage favori et Candidatures en attente sont masqués : « Pratique » descend jusqu'à la fin, pas plus.
    const c = defaultHomeWidgets;
    expect(moveVisibleHomeWidget(c, "practical", 1)).toBe(c);
    const up = moveVisibleHomeWidget(c, "practical", -1);
    const shown = (cfg: typeof c) => visibleHomeWidgets(cfg).filter((id) => homeWidgetOffered(id));
    expect(shown(up).slice(-2)).toEqual(["practical", "weather"]);
    const down = moveVisibleHomeWidget(up, "practical", 1);
    expect(down.order).toEqual(c.order);
    // Le premier bloc affiché sous « Prochaine sortie » ne monte pas ; « Prochaine sortie » ne bouge pas.
    expect(moveVisibleHomeWidget(c, "event_weather", -1)).toBe(c);
    expect(moveVisibleHomeWidget(c, "next_access", 1)).toBe(c);
    // Un bloc masqué ne se déplace pas ; un identifiant inconnu non plus.
    expect(moveVisibleHomeWidget(c, "agenda", -1)).toBe(c);
    // Les blocs masqués gardent leur place dans l'ordre enregistré.
    expect(up.hidden).toEqual(c.hidden);
  });

  it("lot R7a2 : « Ajouter » affiche un bloc masqué à la fin des blocs affichés ; ne fait rien s'il est déjà affiché", () => {
    const added = addHomeWidget(defaultHomeWidgets, "favorite_garage");
    expect(added.hidden).toEqual(["agenda", "pending"]);
    expect(
      visibleHomeWidgets(added)
        .filter((id) => homeWidgetOffered(id))
        .at(-1),
    ).toBe("favorite_garage");
    expect([...added.order].sort()).toEqual([...homeWidgetIds].sort());
    expect(addHomeWidget(added, "favorite_garage")).toBe(added);
    expect(addHomeWidget(defaultHomeWidgets, "next_access")).toBe(defaultHomeWidgets);
  });

  it("valide strictement ce qui s'enregistre", () => {
    expect(homeWidgetsSchema.safeParse({ order: ["weather"], hidden: [] }).success).toBe(true);
    expect(homeWidgetsSchema.safeParse({ order: ["inconnu"], hidden: [] }).success).toBe(false);
    expect(homeWidgetsSchema.safeParse({ order: [], hidden: [], extra: 1 }).success).toBe(false);
    expect(homeWidgetsSchema.safeParse([{ id: "meteo" }]).success).toBe(false);
    expect(homeWidgetsSchema.safeParse({ order: Array(30).fill("weather"), hidden: [] }).success).toBe(false);
  });
});

describe("paramètres de GET /me/home", () => {
  it("borne le rayon et exige lat et lng ensemble", () => {
    expect(homeQuerySchema.safeParse({ radiusKm: "150" }).success).toBe(true);
    expect(homeQuerySchema.safeParse({ radiusKm: "5" }).success).toBe(false);
    expect(homeQuerySchema.safeParse({ radiusKm: "301" }).success).toBe(false);
    expect(homeQuerySchema.safeParse({ lat: "42.7" }).success).toBe(false);
    expect(homeQuerySchema.safeParse({ lat: "42.7", lng: "2.9" }).success).toBe(true);
  });

  it("refuse un lien d'emplacement qui n'est pas http(s)", () => {
    const base = {
      proProfileId: "11111111-1111-4111-8111-111111111111",
      title: "Offre",
      body: "Texte",
      startsOn: "2026-10-01",
      endsOn: "2026-11-01",
    };
    expect(sponsoredPlacementCreateSchema.safeParse({ ...base, linkUrl: "https://exemple.fr/offre" }).success).toBe(
      true,
    );
    expect(sponsoredPlacementCreateSchema.safeParse({ ...base, linkUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(
      sponsoredPlacementCreateSchema.safeParse({ ...base, linkUrl: "https://exemple.fr", endsOn: "2026-09-01" })
        .success,
    ).toBe(false);
  });
});

describe("département le plus proche", () => {
  it("retrouve le département d'un point", () => {
    expect(nearestDepartment({ lat: 42.7, lng: 2.9 })).toBe("66");
    expect(nearestDepartment({ lat: 48.85, lng: 2.35 })).toBe("75");
  });
});

describe("emplacement sponsorisé", () => {
  const base = {
    id: "a",
    status: "active" as const,
    startsOn: "2026-10-01",
    endsOn: "2026-10-31",
    departments: [] as string[],
    categoryIds: [] as string[],
    dailyCap: null as number | null,
  };
  const ctx = { today: "2026-10-17", sector: ["66"], interests: ["jdm"], impressionsToday: 0 };

  it("respecte statut, période et plafond du jour", () => {
    expect(placementMatch(base, ctx)).toEqual({ eligible: true, weight: 1 });
    expect(placementMatch({ ...base, status: "paused" }, ctx).eligible).toBe(false);
    expect(placementMatch({ ...base, status: "draft" }, ctx).eligible).toBe(false);
    expect(placementMatch(base, { ...ctx, today: "2026-09-30" }).eligible).toBe(false);
    expect(placementMatch(base, { ...ctx, today: "2026-11-01" }).eligible).toBe(false);
    expect(placementMatch(base, { ...ctx, today: "2026-10-31" }).eligible).toBe(true);
    expect(placementMatch({ ...base, dailyCap: 3 }, { ...ctx, impressionsToday: 3 }).eligible).toBe(false);
    expect(placementMatch({ ...base, dailyCap: 3 }, { ...ctx, impressionsToday: 2 }).eligible).toBe(true);
  });

  it("cible par département et par centre d'intérêt, et pèse plus quand le ciblage touche", () => {
    expect(placementMatch({ ...base, departments: ["66"] }, ctx)).toEqual({ eligible: true, weight: 2 });
    expect(placementMatch({ ...base, departments: ["31"] }, ctx).eligible).toBe(false);
    expect(placementMatch({ ...base, departments: ["66"], categoryIds: ["jdm"] }, ctx)).toEqual({
      eligible: true,
      weight: 3,
    });
    expect(placementMatch({ ...base, categoryIds: ["moto"] }, ctx).eligible).toBe(false);
    expect(placementMatch({ ...base, departments: ["66"] }, { ...ctx, sector: [] }).eligible).toBe(false);
  });

  it("tire de façon déterministe avec une graine, proportionnellement au poids", () => {
    expect(seededUnit("x")).toBe(seededUnit("x"));
    expect(seededUnit("x")).not.toBe(seededUnit("y"));
    const list = [
      { id: "a", weight: 1 },
      { id: "b", weight: 3 },
    ];
    expect(pickWeighted(list, "graine")?.id).toBe(pickWeighted([...list].reverse(), "graine")?.id);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) counts[pickWeighted(list, `s${i}`)?.id as "a" | "b"]++;
    expect(counts.b / counts.a).toBeGreaterThan(2);
    expect(counts.b / counts.a).toBeLessThan(4.5);
    expect(pickWeighted([], "s")).toBeNull();
    expect(pickWeighted([{ id: "z", weight: 0 }], "s")).toBeNull();
  });
});

describe("Mes sorties : ligne de détail", () => {
  const v = (label: string, status: "accepted" | "pending" = "accepted") => ({ label, status });
  const day = (d: string, status: "accepted" | "pending" = "accepted") => ({
    date: d,
    startsAt: `${d}T10:00:00Z`,
    endsAt: `${d}T18:00:00Z`,
    status,
  });
  it("véhicules puis journées ; vide sans l'un ni l'autre", () => {
    expect(outingDetail({ status: "accepted", vehicles: [], days: [] })).toBe("");
    expect(outingDetail({ status: "accepted", vehicles: [v("Golf GTI 1995"), v("Clio V6 2001")], days: [] })).toBe(
      "Golf GTI 1995 · Clio V6 2001",
    );
    expect(
      outingDetail({
        status: "accepted",
        vehicles: [v("Golf GTI 1995")],
        days: [day("2026-11-12"), day("2026-11-13")],
      }),
    ).toBe("Golf GTI 1995 · jeu 12 · ven 13");
  });

  it("tour 3 : un véhicule ou une journée au statut différent de la ligne porte le sien", () => {
    expect(outingDetail({ status: "accepted", vehicles: [v("911"), v("Golf", "pending")], days: [] })).toBe(
      "911 · Golf (en attente)",
    );
    expect(
      outingDetail({ status: "accepted", vehicles: [], days: [day("2026-11-12"), day("2026-11-13", "pending")] }),
    ).toBe("jeu 12 · ven 13 (en attente)");
  });
});
