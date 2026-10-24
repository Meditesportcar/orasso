import { describe, expect, it } from "vitest";
import { defaultChoice, type ExplorerChoice, readChoice, storeChoice } from "./explorerChoice";

const chosen: ExplorerChoice = {
  segment: "pros",
  where: { kind: "dept", code: "11" },
  sort: "seats",
  filters: { format: "exhibition", when: "weekend", affinity: true, followed: true },
  prefFormatsOn: false,
  job: "detailing",
  proSort: "name",
  peopleWhere: { kind: "dept", code: "66" },
  show: "crews",
  people: { categoryId: "3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", grade: "sport" },
};

describe("le choix de l'Explorer reste (lots R1, R2)", () => {
  it("se garde et se relit tel quel (aller-retour par JSON, comme le trousseau)", () => {
    expect(readChoice(JSON.parse(JSON.stringify(storeChoice(chosen))))).toEqual(chosen);
    // Les réglages habituels (`null`) restent `null`.
    expect(readChoice(JSON.parse(JSON.stringify(storeChoice({ ...chosen, where: null }))))?.where).toBeNull();
    const all = readChoice(JSON.parse(JSON.stringify(storeChoice({ ...chosen, where: { kind: "all" } }))));
    expect(all?.where).toEqual({ kind: "all" });
  });

  it("par défaut : par date (événements), par distance (pros), mon coin et tout (Personnes et crews)", () => {
    expect(defaultChoice).toMatchObject({ sort: "date", proSort: "distance", where: null, show: "all" });
    // Lot R2, tour 2 : rien de choisi (recherche élargie d'elle-même) ; « Mon coin » choisi est gardé tel quel.
    expect(defaultChoice.peopleWhere).toBeNull();
    const mine = readChoice(JSON.parse(JSON.stringify(storeChoice({ ...chosen, peopleWhere: { kind: "mine" } }))));
    expect(mine?.peopleWhere).toEqual({ kind: "mine" });
    expect(
      readChoice(JSON.parse(JSON.stringify(storeChoice({ ...chosen, peopleWhere: null }))))?.peopleWhere,
    ).toBeNull();
    // Un identifiant de centre d'intérêt abîmé est ignoré.
    expect(readChoice({ v: 2, people: { categoryId: "x'); drop" } })?.people.categoryId).toBe("");
  });

  it("« Autour de moi » ne garde que le mode et la distance, jamais de coordonnées", () => {
    const stored = storeChoice({ ...chosen, where: { kind: "me", km: 75 } });
    expect(stored.where).toEqual({ kind: "me", km: 75 });
    expect(JSON.stringify(stored)).not.toMatch(/lat|lng|position|coords/i);
    // Une valeur enregistrée qui en porterait (version modifiée) les perd à la lecture ; la distance revient sur le curseur.
    expect(readChoice({ v: 2, where: { kind: "me", km: 333, lat: 42.7, lng: 2.9 } })?.where).toEqual({
      kind: "me",
      km: 200,
    });
  });

  it("rien de gardé : `null` ; valeur illisible : chaque champ reprend sa valeur par défaut", () => {
    expect(readChoice(null)).toBeNull();
    expect(readChoice("x")).toBeNull();
    expect(readChoice([])).toBeNull();
    expect(
      readChoice({
        v: 2,
        segment: "annuaire",
        where: { kind: "dept", code: "999" },
        sort: "prix",
        filters: { format: "drift", when: "demain", affinity: "oui", followed: 1 },
        prefFormatsOn: "non",
        job: "boulangerie",
        proSort: "remise",
        peopleWhere: { kind: "me" },
        show: "amis",
        people: { categoryId: 7, grade: "pilote" },
      }),
    ).toEqual({ ...defaultChoice, prefFormatsOn: true });
  });

  it("une valeur d'avant le lot R2 : le segment, les filtres et le métier restent ; le lieu et le tri repartent", () => {
    const legacy = {
      segment: "pros",
      sort: "distance",
      around: { kind: "dept", code: "11" },
      radius: 50,
      filters: { format: "exhibition", when: "weekend", affinity: false, followed: true },
      prefFormatsOn: false,
      pros: { activity: "garage", department: "66", radiusKm: 25 },
    };
    expect(readChoice(legacy)).toEqual({
      ...defaultChoice,
      segment: "pros",
      filters: { format: "exhibition", when: "weekend", affinity: false, followed: true },
      prefFormatsOn: false,
      job: "garage",
    });
  });
});
