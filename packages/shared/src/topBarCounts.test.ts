import { describe, expect, it } from "vitest";

import { navLabels } from "./labels/nav.fr";
import { inboxRowCounts, requestRowCounts, topBarCounts } from "./messaging";

const base = { unreadMessages: 0, unseenActivity: 0, pendingRequests: 0, requests: { contact: 0 } };

describe("pastilles de la barre du haut (lots R7a1 et R7c2)", () => {
  it("une demande seule : la cloche la compte une fois, la bulle reste à 0", () => {
    expect(topBarCounts({ ...base, pendingRequests: 1 })).toEqual({ activity: 1, messages: 0 });
  });
  it("une demande de message : la bulle, pas la cloche", () => {
    const s = { ...base, pendingRequests: 2, requests: { contact: 2 } };
    expect(topBarCounts(s)).toEqual({ activity: 0, messages: 2 });
    expect(inboxRowCounts(s)).toEqual({ activityRequests: 0, messageRequests: 2 });
  });
  it("une conversation non lue : la bulle affiche 1, la cloche rien", () => {
    expect(topBarCounts({ ...base, unreadMessages: 1 })).toEqual({ activity: 0, messages: 1 });
  });
  it("nouveautés et demandes s'additionnent à la cloche ; résumé indisponible : tout à 0", () => {
    expect(topBarCounts({ ...base, unseenActivity: 3, pendingRequests: 2 }).activity).toBe(5);
    expect(topBarCounts(null)).toEqual({ activity: 0, messages: 0 });
  });
  it("les noms accessibles annoncent le nombre", () => {
    expect(navLabels.topCounted.activity(3)).toBe("Activité, 3 non lues");
    expect(navLabels.topCounted.activity(1)).toBe("Activité, 1 non lue");
    expect(navLabels.topCounted.messages(2)).toBe("Messages, 2 non lus");
    expect(navLabels.topCounted.activity(0)).toBe(navLabels.top.activity);
    expect(navLabels.topCounted.messages(150)).toBe("Messages, plus de 99 non lus");
  });

  it("résumé en panne : le compteur est inconnu (null), pas zéro ; on se rabat sur la liste des demandes", () => {
    expect(requestRowCounts(null)).toEqual({ activityRequests: null, messageRequests: null });
    const page = { total: 3, items: [{ kind: "follow" }, { kind: "contact" }, { kind: "crew" }] };
    expect(requestRowCounts(null, page)).toEqual({ activityRequests: 2, messageRequests: 1 });
    expect(requestRowCounts(null, { total: 0, items: [] })).toEqual({ activityRequests: 0, messageRequests: 0 });
  });
  it("résumé disponible : il prime sur la liste", () => {
    const s = { ...base, pendingRequests: 4, requests: { contact: 1 } };
    expect(requestRowCounts(s, { total: 9, items: [] })).toEqual({ activityRequests: 3, messageRequests: 1 });
  });
});
