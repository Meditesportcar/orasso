import type { MyCrew } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { carsOf, crewLastKey, pickCrew, tabOfParam } from "./crewTabModel";

const crew = (slug: string): MyCrew => ({
  id: slug,
  slug,
  name: slug,
  logoUrl: null,
  department: "66",
  membersCount: 3,
  role: "member",
});

describe("onglet Crew : quel crew s'affiche (lot R7b2)", () => {
  const mine = [crew("roussillon-drift"), crew("cote-vermeille")];
  it("le crew du lien, sinon le dernier ouvert, sinon le premier", () => {
    expect(pickCrew(mine, "cote-vermeille", "roussillon-drift")?.slug).toBe("cote-vermeille");
    expect(pickCrew(mine, null, "cote-vermeille")?.slug).toBe("cote-vermeille");
    expect(pickCrew(mine, undefined, undefined)?.slug).toBe("roussillon-drift");
  });
  it("ignore un crew dont je ne suis plus membre (jamais montré)", () => {
    expect(pickCrew(mine, "ancien", "disparu")?.slug).toBe("roussillon-drift");
    expect(pickCrew([], "ancien", "disparu")).toBeNull();
  });
  it("le dernier ouvert est rangé par compte", () => {
    expect(crewLastKey("a")).not.toBe(crewLastKey("b"));
  });
  it("les onglets des liens ; l'ancien Garage mène aux Membres", () => {
    expect(tabOfParam("sorties")).toBe("outings");
    expect(tabOfParam("garage")).toBe("members");
    expect(tabOfParam("membres")).toBe("members");
    expect(tabOfParam("spots")).toBe("spots");
    expect(tabOfParam("n'importe quoi")).toBe("feed");
    expect(tabOfParam(undefined)).toBe("feed");
  });
  it("les voitures d'un membre", () => {
    const garage = [{ ownerPseudo: "Kenji_66" }, { ownerPseudo: "Lea_11" }, { ownerPseudo: "kenji_66" }];
    expect(carsOf(garage, "Kenji_66")).toHaveLength(2);
    expect(carsOf(garage, "Nina_34")).toEqual([]);
  });
});
