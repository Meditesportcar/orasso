import { describe, expect, it } from "vitest";

import { notificationTypes } from "../enums";
import {
  structureActivityTypes,
  structureFilterTypes,
  structureRequestTypes,
  structureTopBarCounts,
} from "./structureActivity";

describe("filtres de l'Activité de la structure", () => {
  it("chaque filtre a ses types, « Tout » les réunit et ajoute la demande de staff", () => {
    expect(structureActivityTypes("triage")).toEqual(["application_received"]);
    expect(structureActivityTypes("mentions")).toEqual(["feed_post_mention"]);
    expect(structureActivityTypes("comments")).toEqual(["feed_comment", "feed_comment_reply"]);
    expect(structureActivityTypes("collaborations")).toEqual(["coauthor_invited"]);
    const all = structureActivityTypes("all");
    expect(all).toContain("staff_request");
    for (const types of Object.values(structureFilterTypes)) for (const t of types) expect(all).toContain(t);
    // staff_request n'est que dans « Tout ».
    expect(Object.values(structureFilterTypes).flat()).not.toContain("staff_request");
  });
  it("tous les types sont des types de notification existants (aucun type neuf `structure_*` pour l'Activité)", () => {
    for (const t of structureActivityTypes("all")) {
      expect(notificationTypes).toHaveProperty(t);
      expect(t.startsWith("structure_")).toBe(false);
    }
  });
  it("les demandes sont exclues des « non vus » : une demande ne compte qu'une fois", () => {
    expect(structureRequestTypes).toEqual(["staff_request", "coauthor_invited"]);
  });
});

describe("pastilles de la barre du haut d'un organisateur", () => {
  it("cloche = non vus + demandes de staff + demandes de collaboration ; bulle = conversations seulement", () => {
    expect(
      structureTopBarCounts({
        participantMessages: 2,
        staffDiscussions: 1,
        staffRequests: 1,
        activityUnseen: 4,
        coauthorRequests: 1,
      }),
    ).toEqual({ activity: 6, messages: 3 });
  });
  it("un résumé ancien (sans les champs neufs) ou absent donne zéro, sans planter", () => {
    expect(structureTopBarCounts({ participantMessages: 0, staffDiscussions: 0, staffRequests: 2 })).toEqual({
      activity: 2,
      messages: 0,
    });
    expect(structureTopBarCounts(null)).toEqual({ activity: 0, messages: 0 });
  });
});
