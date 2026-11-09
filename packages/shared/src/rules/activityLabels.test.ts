import { describe, expect, it } from "vitest";

import { activityWhen, actorsLabel, groupedTitle } from "./activityLabels";

const person = (pseudo: string) => ({ pseudo, avatarUrl: null });
const now = new Date("2026-11-09T14:00:00Z");

describe("activityWhen (lot R7c2)", () => {
  it("aujourd'hui : à l'instant, minutes, heures", () => {
    expect(activityWhen(new Date("2026-11-09T13:59:40Z"), now, "today")).toBe("à l'instant");
    expect(activityWhen(new Date("2026-11-09T13:48:00Z"), now, "today")).toBe("il y a 12 min");
    expect(activityWhen(new Date("2026-11-09T11:55:00Z"), now, "today")).toBe("il y a 2 h");
  });
  it("cette semaine : hier, puis le nom du jour (heure de Paris)", () => {
    expect(activityWhen(new Date("2026-11-08T12:00:00Z"), now, "week")).toBe("hier");
    expect(activityWhen(new Date("2026-11-04T12:00:00Z"), now, "week")).toBe("mercredi");
  });
  it("plus tôt : la date, l'année hors de l'année en cours", () => {
    expect(activityWhen(new Date("2026-10-27T12:00:00Z"), now, "earlier")).toBe("27 octobre");
    expect(activityWhen(new Date("2026-10-01T12:00:00Z"), now, "earlier")).toBe("1er octobre");
    expect(activityWhen(new Date("2025-12-31T12:00:00Z"), now, "earlier")).toBe("31 décembre 2025");
  });
});

describe("noms et titre d'une ligne regroupée (lot R7c2)", () => {
  it("noms : un, deux, « et N autres »", () => {
    expect(actorsLabel([person("Kenji_66")], 1)).toBe("Kenji_66");
    expect(actorsLabel([person("Kenji_66"), person("Julie_66")], 2)).toBe("Kenji_66 et Julie_66");
    expect(actorsLabel([person("Kenji_66"), person("Julie_66"), person("Lea_11")], 5)).toBe("Kenji_66 et 4 autres");
    expect(actorsLabel([], 3)).toBe("");
  });
  it("le verbe s'accorde au pluriel", () => {
    const five = [person("Kenji_66"), person("Julie_66"), person("Lea_11")];
    expect(groupedTitle("Kenji_66 a aimé ta story", five, 5)).toEqual({
      names: "Kenji_66 et 4 autres",
      rest: " ont aimé ta story",
    });
    expect(groupedTitle("Kenji_66 t'a identifié dans une story", five, 3)).toEqual({
      names: "Kenji_66 et 2 autres",
      rest: " t'ont identifié dans une story",
    });
  });
  it("une seule personne : titre inchangé, pseudo en gras ; titre sans pseudo : tel quel", () => {
    expect(groupedTitle("Kenji_66 a aimé ta story", [person("Kenji_66")], 1)).toEqual({
      names: "Kenji_66",
      rest: " a aimé ta story",
    });
    expect(groupedTitle("Horaire modifié", [], 1)).toEqual({ names: "", rest: "Horaire modifié" });
    expect(groupedTitle("Un vote est ouvert", [person("Kenji_66")], 2)).toEqual({
      names: "",
      rest: "Un vote est ouvert",
    });
  });
});
