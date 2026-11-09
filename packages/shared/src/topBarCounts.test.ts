import { describe, expect, it } from "vitest";

import { navLabels } from "./labels/nav.fr";
import { topBarCounts } from "./messaging";

const requests = { follow: 0, contact: 0, crew: 0, crewConfirmation: 0, staffInvitation: 0, eventInvitation: 0 };

describe("pastilles de la barre du haut (lot R7a1, tour 2)", () => {
  it("une demande seule : la cloche la compte, la bulle reste à 0", () => {
    expect(topBarCounts(0, { unreadMessages: 0, requests: { ...requests, follow: 1 } })).toEqual({
      activity: 1,
      messages: 0,
    });
  });
  it("une conversation non lue : la bulle affiche 1, la cloche rien", () => {
    expect(topBarCounts(0, { unreadMessages: 1, requests })).toEqual({ activity: 0, messages: 1 });
  });
  it("notifications et demandes s'additionnent à la cloche ; résumé indisponible : bulle à 0", () => {
    expect(topBarCounts(3, { unreadMessages: 0, requests: { ...requests, crew: 2 } }).activity).toBe(5);
    expect(topBarCounts(3, null)).toEqual({ activity: 3, messages: 0 });
  });
  it("les noms accessibles annoncent le nombre", () => {
    expect(navLabels.topCounted.activity(3)).toBe("Activité, 3 non lues");
    expect(navLabels.topCounted.activity(1)).toBe("Activité, 1 non lue");
    expect(navLabels.topCounted.messages(2)).toBe("Messages, 2 non lus");
    expect(navLabels.topCounted.activity(0)).toBe(navLabels.top.activity);
    expect(navLabels.topCounted.messages(150)).toBe("Messages, plus de 99 non lus");
  });
});
