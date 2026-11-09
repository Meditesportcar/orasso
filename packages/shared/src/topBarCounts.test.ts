import { describe, expect, it } from "vitest";

import { navLabels } from "./labels/nav.fr";
import {
  inboxRowCounts,
  messageRowCount,
  requestCountSpoken,
  requestCountText,
  requestRowCounts,
  requestRowShown,
  topBarCounts,
} from "./messaging";

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

  it("résumé en panne et liste complète : on lit la liste (exact), jamais zéro par défaut", () => {
    const page = { total: 3, items: [{ kind: "follow" }, { kind: "contact" }, { kind: "crew" }] };
    expect(requestRowCounts(null, page)).toEqual({
      activityRequests: 2,
      messageRequests: 1,
      atLeast: false,
      status: "ready",
    });
    expect(requestRowCounts(null, { total: 0, items: [] })).toMatchObject({ activityRequests: 0, messageRequests: 0 });
  });
  it("premier chargement : rien n'a répondu, aucune erreur (la ligne attend) ; un échec seul n'en est pas une", () => {
    expect(requestRowCounts(null, null)).toMatchObject({ activityRequests: null, status: "loading" });
    expect(requestRowCounts(null, null, { summary: true, list: false })).toMatchObject({ status: "loading" });
    expect(requestRowCounts(null, null, { summary: false, list: true })).toMatchObject({ status: "loading" });
    expect(requestRowShown(null, "loading")).toBe(false);
  });
  it("échec du résumé seul : la liste donne les nombres, pas d'erreur", () => {
    const page = { total: 2, items: [{ kind: "follow" }, { kind: "contact" }] };
    const counts = requestRowCounts(null, page, { summary: true, list: false });
    expect(counts).toMatchObject({ activityRequests: 1, messageRequests: 1, status: "ready" });
  });
  it("échec des deux : compteur inconnu (ligne sans nombre, avec Réessayer), pas zéro", () => {
    const counts = requestRowCounts(null, null, { summary: true, list: true });
    expect(counts).toEqual({ activityRequests: null, messageRequests: null, atLeast: false, status: "failed" });
    expect(requestRowShown(counts.activityRequests, counts.status)).toBe(true);
  });
  it("résumé en panne et liste incomplète : « au moins N » (jamais total moins la page), 0 devient sans nombre", () => {
    // 50 sur la page (49 demandes + 1 message), 80 en tout : la page suivante peut porter d'autres messages.
    const items = [...Array.from({ length: 49 }, () => ({ kind: "follow" })), { kind: "contact" }];
    const counts = requestRowCounts(null, { total: 80, items });
    expect(counts).toEqual({ activityRequests: 49, messageRequests: 1, atLeast: true, status: "ready" });
    expect(requestCountText(49, true)).toBe("49+");
    expect(requestCountText(4, false)).toBe("4");
    expect(requestCountSpoken(49, true)).toBe("au moins 49 en attente");
    // Une page de messages seuls : le nombre de demandes est inconnu mais la ligne reste.
    const onlyMessages = requestRowCounts(null, {
      total: 80,
      items: Array.from({ length: 50 }, () => ({ kind: "contact" })),
    });
    expect(onlyMessages).toMatchObject({ activityRequests: null, messageRequests: 50, atLeast: true, status: "ready" });
    expect(requestRowShown(onlyMessages.activityRequests, onlyMessages.status)).toBe(true);
    expect(requestRowShown(0, "ready")).toBe(false);
  });
  it("Messages : premier chargement sans erreur, un échec seul n'en est pas une, les deux échecs donnent l'inconnu", () => {
    expect(messageRowCount(null, null, { summary: false, list: false })).toEqual({ count: null, status: "loading" });
    expect(messageRowCount(null, null, { summary: true, list: false })).toEqual({ count: null, status: "loading" });
    expect(messageRowCount(null, 2, { summary: true, list: false })).toEqual({ count: 2, status: "ready" });
    expect(messageRowCount(null, null, { summary: true, list: true })).toEqual({ count: null, status: "failed" });
    expect(
      messageRowCount({ ...base, pendingRequests: 3, requests: { contact: 3 } }, null, { summary: false, list: true }),
    ).toEqual({
      count: 3,
      status: "ready",
    });
    expect(requestRowShown(0, "ready")).toBe(false);
  });
  it("résumé disponible : il prime sur la liste", () => {
    const s = { ...base, pendingRequests: 4, requests: { contact: 1 } };
    expect(requestRowCounts(s, { total: 9, items: [] })).toEqual({
      activityRequests: 3,
      messageRequests: 1,
      atLeast: false,
      status: "ready",
    });
  });
});
