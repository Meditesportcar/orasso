import type { ApplicationForTriage } from "@orasso/shared";
import { triageAppLabels } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  bulkOutcome,
  COUNTER_ACTIVE,
  classifyDecisionError,
  counterCells,
  currentOf,
  decideBody,
  dragTargetIndex,
  dueArmed,
  emptyFilters,
  emptyQueue,
  exitTarget,
  listQuery,
  moveItem,
  needsRefill,
  queueReducer,
  refusalProblem,
  secondsLeft,
  swipeProgress,
  swipeRotation,
  swipeState,
  toggleId,
  triageEvents,
  UNDO_DELAY_MS,
  waitlistIds,
} from "./triage";

const card = (id: string, status: ApplicationForTriage["status"] = "pending") =>
  ({ id, status }) as ApplicationForTriage;
const W = 300; // seuil = 120 px

describe("glissement : étiquettes et seuil", () => {
  it("aucune étiquette sans translation, ni vers le bas", () => {
    expect(swipeState(0, 0, W)).toEqual({ leaning: null, progress: 0, decision: null });
    expect(swipeState(0, 80, W).leaning).toBeNull();
  });
  it("droite = retenir, gauche = refuser, haut = liste d'attente", () => {
    expect(swipeState(60, 5, W).leaning).toBe("accept");
    expect(swipeState(-60, 5, W).leaning).toBe("refuse");
    expect(swipeState(5, -60, W).leaning).toBe("waitlist");
  });
  it("la progression suit la distance, bornée à 1", () => {
    expect(swipeState(60, 0, W).progress).toBeCloseTo(0.5);
    expect(swipeState(600, 0, W).progress).toBe(1);
  });
  it("le seuil est à 40 % de la largeur : en dessous, retour élastique ; au-dessus, décision", () => {
    expect(swipeState(119, 0, W).decision).toBeNull();
    expect(swipeState(120, 0, W).decision).toBe("accept");
    expect(swipeState(-121, 0, W).decision).toBe("refuse");
    expect(swipeState(0, -130, W).decision).toBe("waitlist");
  });
  it("un seul sens à la fois : l'axe dominant l'emporte", () => {
    const s = swipeState(100, -90, W);
    expect(s.leaning).toBe("accept");
    expect(swipeProgress(100, -90, 120, 1)).toBe(0);
    expect(swipeState(90, -100, W).leaning).toBe("waitlist");
  });
  it("rotation légère, bornée", () => {
    expect(swipeRotation(0, W)).toBe(0);
    expect(swipeRotation(120, W)).toBeCloseTo(8);
    expect(swipeRotation(-1000, W)).toBe(-12);
  });
  it("la carte sort dans le sens du geste", () => {
    expect(exitTarget("accept", 300, 600).x).toBeGreaterThan(300);
    expect(exitTarget("refuse", 300, 600).x).toBeLessThan(-300);
    expect(exitTarget("waitlist", 300, 600).y).toBeLessThan(-600);
  });
});

describe("file locale des décisions", () => {
  const loaded = queueReducer(emptyQueue, { type: "load", items: [card("a"), card("b"), card("c")] });

  it("charge sans doublons ni candidatures qui ne sont plus à trier", () => {
    const again = queueReducer(loaded, { type: "load", items: [card("a"), card("d"), card("e", "accepted")] });
    expect(again.queue.map((q) => q.id)).toEqual(["a", "b", "c", "d"]);
    expect(currentOf(again)?.id).toBe("a");
  });

  it("armer retire la carte de la file et pose l'échéance à 5 s", () => {
    const s = queueReducer(loaded, { type: "arm", id: "a", decision: "accept", extra: {}, now: 1000 });
    expect(s.queue.map((q) => q.id)).toEqual(["b", "c"]);
    expect(s.armed[0]).toMatchObject({ decision: "accept", dueAt: 1000 + UNDO_DELAY_MS, sending: false });
    expect(dueArmed(s, 1000 + UNDO_DELAY_MS - 1)).toHaveLength(0);
    expect(dueArmed(s, 1000 + UNDO_DELAY_MS)).toHaveLength(1);
  });

  it("une carte armée n'est pas rechargée tant qu'elle n'est pas partie (pas de double carte)", () => {
    const s = queueReducer(loaded, { type: "arm", id: "a", decision: "accept", extra: {}, now: 0 });
    const reloaded = queueReducer(s, { type: "load", items: [card("a"), card("b"), card("z")] });
    expect(reloaded.queue.map((q) => q.id)).toEqual(["b", "c", "z"]);
  });

  it("annuler remet la carte en tête de file", () => {
    const s = queueReducer(loaded, { type: "arm", id: "a", decision: "refuse", extra: { reasons: ["full"] }, now: 0 });
    const undone = queueReducer(s, { type: "undo", id: "a" });
    expect(undone.queue.map((q) => q.id)).toEqual(["a", "b", "c"]);
    expect(undone.armed).toHaveLength(0);
  });

  it("une décision déjà partie ne s'annule plus (la décision reçue par l'API est définitive)", () => {
    const armed = queueReducer(loaded, { type: "arm", id: "a", decision: "accept", extra: {}, now: 0 });
    const sending = queueReducer(armed, { type: "sending", id: "a" });
    expect(dueArmed(sending, 99_999)).toHaveLength(0);
    expect(queueReducer(sending, { type: "undo", id: "a" })).toBe(sending);
  });

  it("envoyée : elle quitte les décisions armées avec un message", () => {
    let s = queueReducer(loaded, { type: "arm", id: "a", decision: "accept", extra: {}, now: 0 });
    s = queueReducer(s, { type: "sending", id: "a" });
    s = queueReducer(s, { type: "sent", id: "a", text: "Retenue." });
    expect(s.armed).toHaveLength(0);
    expect(s.notice).toEqual({ kind: "ok", text: "Retenue." });
    expect(s.queue.map((q) => q.id)).toEqual(["b", "c"]);
  });

  it("erreur 409 « plus de place » : la carte revient en tête avec le message", () => {
    let s = queueReducer(loaded, { type: "arm", id: "a", decision: "accept", extra: {}, now: 0 });
    s = queueReducer(s, { type: "sending", id: "a" });
    s = queueReducer(s, { type: "failed", id: "a", failure: "full", text: "Plus de place" });
    expect(s.queue.map((q) => q.id)).toEqual(["a", "b", "c"]);
    expect(s.notice?.kind).toBe("error");
    expect(s.needsReload).toBe(false);
  });

  it("hors connexion : la carte revient, rien n'est perdu", () => {
    let s = queueReducer(loaded, { type: "arm", id: "b", decision: "waitlist", extra: {}, now: 0 });
    s = queueReducer(s, { type: "failed", id: "b", failure: "offline", text: "Pas de connexion" });
    expect(s.queue.map((q) => q.id)).toEqual(["b", "a", "c"]);
  });

  it("décision prise ailleurs : la carte n'est pas remise, la file se recharge", () => {
    let s = queueReducer(loaded, { type: "arm", id: "a", decision: "accept", extra: {}, now: 0 });
    s = queueReducer(s, { type: "failed", id: "a", failure: "elsewhere", text: "Déjà traitée" });
    expect(s.queue.map((q) => q.id)).toEqual(["b", "c"]);
    expect(s.needsReload).toBe(true);
    expect(queueReducer(s, { type: "load", items: [card("n")] }).needsReload).toBe(false);
  });

  it("passer renvoie la carte en fin de file, et elle reste derrière à la prochaine charge", () => {
    let s = queueReducer(loaded, { type: "skip", id: "a" });
    expect(s.queue.map((q) => q.id)).toEqual(["b", "c", "a"]);
    s = queueReducer(s, { type: "load", items: [card("d")] });
    expect(s.queue.map((q) => q.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("passer la seule carte ne change rien", () => {
    const one = queueReducer(emptyQueue, { type: "load", items: [card("a")] });
    expect(queueReducer(one, { type: "skip", id: "a" })).toBe(one);
  });

  it("décision prise ailleurs pendant qu'on regarde la carte (canal) : elle quitte la file", () => {
    const s = queueReducer(loaded, { type: "external", id: "b", status: "accepted" });
    expect(s.queue.map((q) => q.id)).toEqual(["a", "c"]);
    expect(queueReducer(loaded, { type: "external", id: "b", status: "pending" })).toBe(loaded);
    expect(queueReducer(loaded, { type: "external", id: "zzz", status: "refused" })).toBe(loaded);
  });

  it("recharge quand la file se vide", () => {
    expect(needsRefill(loaded, 4)).toBe(true);
    expect(needsRefill(loaded, 3)).toBe(false);
  });

  it("compte à rebours arrondi au-dessus", () => {
    expect(secondsLeft({ dueAt: 5000 }, 0)).toBe(5);
    expect(secondsLeft({ dueAt: 5000 }, 4001)).toBe(1);
    expect(secondsLeft({ dueAt: 5000 }, 6000)).toBe(0);
  });

  it("deux décisions armées s'annulent chacune seule", () => {
    let s = queueReducer(loaded, { type: "arm", id: "a", decision: "accept", extra: {}, now: 0 });
    s = queueReducer(s, { type: "arm", id: "b", decision: "refuse", extra: { reasons: ["off_theme"] }, now: 1000 });
    s = queueReducer(s, { type: "undo", id: "a" });
    expect(s.armed.map((x) => x.item.id)).toEqual(["b"]);
    expect(s.queue.map((q) => q.id)).toEqual(["a", "c"]);
  });
});

describe("erreurs de décision", () => {
  it("classe selon le statut et le code de l'API", () => {
    expect(classifyDecisionError(0, "network")).toBe("offline");
    expect(classifyDecisionError(409, "event_full")).toBe("full");
    expect(classifyDecisionError(409, "invalid_transition")).toBe("elsewhere");
    expect(classifyDecisionError(404, "not_found")).toBe("elsewhere");
    expect(classifyDecisionError(409, "locked")).toBe("locked");
    expect(classifyDecisionError(403, "forbidden")).toBe("forbidden");
    expect(classifyDecisionError(500, "internal")).toBe("other");
  });
});

describe("corps de la requête et validation du refus", () => {
  it("retenir : zone facultative", () => {
    expect(decideBody("accept", {})).toEqual({ decision: "accept", sendReasons: true });
    expect(decideBody("accept", { zoneId: "z1" })).toMatchObject({ zoneId: "z1" });
    expect(decideBody("waitlist", { zoneId: "z1" })).not.toHaveProperty("zoneId");
  });
  it("refuser : motifs, note et envoi", () => {
    expect(decideBody("refuse", { reasons: ["full"], note: " x ", sendReasons: false })).toEqual({
      decision: "refuse",
      reasons: ["full"],
      note: "x",
      sendReasons: false,
    });
  });
  it("au moins un motif, et une note pour « Autre »", () => {
    expect(refusalProblem([], "", triageAppLabels)).toBe(triageAppLabels.refusalNeedReason);
    expect(refusalProblem(["other"], "  ", triageAppLabels)).toBe(triageAppLabels.refusalNeedNote);
    expect(refusalProblem(["other"], "ok", triageAppLabels)).toBeNull();
    expect(refusalProblem(["full"], "", triageAppLabels)).toBeNull();
  });
});

describe("compteurs", () => {
  it("cinq cellules, « à trier » active, places illimitées en ∞", () => {
    const cells = counterCells(
      { remaining: 34, accepted: 116, pending: 27, waitlisted: 9, refused: 12 },
      triageAppLabels,
    );
    expect(cells.map((c) => c.value)).toEqual([34, 116, 27, 9, 12]);
    expect(cells[COUNTER_ACTIVE]?.label).toBe("À trier");
    expect(
      counterCells({ remaining: null, accepted: 1, pending: 0, waitlisted: 0, refused: 0 }, triageAppLabels)[0]?.value,
    ).toBe("∞");
    expect(counterCells(null, triageAppLabels)[1]?.value).toBe("–");
  });
});

describe("liste d'attente réordonnable", () => {
  it("déplace sans muter", () => {
    const list = ["a", "b", "c", "d"];
    expect(moveItem(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
    expect(moveItem(list, 0, 9)).toEqual(list);
  });
  it("le glissement franchit les lignes voisines selon leur hauteur", () => {
    const h = [60, 60, 100, 60];
    expect(dragTargetIndex(h, 0, 20)).toBe(0);
    expect(dragTargetIndex(h, 0, 61)).toBe(1);
    // 30 + 60 + 50 = 140 pour dépasser le centre de la troisième ligne (la plus haute).
    expect(dragTargetIndex(h, 0, 139)).toBe(1);
    expect(dragTargetIndex(h, 0, 141)).toBe(2);
    expect(dragTargetIndex(h, 3, -79)).toBe(3);
    expect(dragTargetIndex(h, 3, -81)).toBe(2);
    expect(dragTargetIndex(h, 3, -500)).toBe(0);
    expect(dragTargetIndex(h, 1, 5000)).toBe(3);
  });
  it("renvoie toutes les candidatures, une fois chacune", () => {
    expect(waitlistIds([{ id: "x" }, { id: "y" }])).toEqual(["x", "y"]);
  });
});

describe("mode liste", () => {
  it("filtres → paramètres de l'API, les vides sont omis", () => {
    const q = listQuery({ ...emptyFilters, status: "pending", yearFrom: "1990", yearTo: "abc", q: " m3 " }, "vehicle");
    expect(q).toMatchObject({ kind: "vehicle", status: "pending", yearFrom: 1990, q: "m3", sort: "created_at" });
    expect(q.yearTo).toBeUndefined();
    expect(q.categoryId).toBeUndefined();
    expect(listQuery({ ...emptyFilters, status: "" }, "provider").status).toBeUndefined();
    expect(q.dayId).toBeUndefined();
    expect(listQuery({ ...emptyFilters, dayId: "whole" }, "vehicle").dayId).toBe("whole");
  });
  it("compte les filtres posés (hors statut)", () => {
    expect(activeFilterCount(emptyFilters)).toBe(0);
    expect(activeFilterCount({ ...emptyFilters, grade: "sport", yearFrom: "1980" })).toBe(2);
    expect(activeFilterCount({ ...emptyFilters, dayId: "whole" })).toBe(1);
  });
  it("sélection multiple", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });
  it("résultat individuel d'une décision en masse", () => {
    const out = bulkOutcome([
      { id: "1", ok: true },
      { id: "2", ok: false, error: "invalid_transition" },
      { id: "3", ok: false, error: "invalid_transition" },
    ]);
    expect(out).toMatchObject({ ok: 1, failed: 2, failedIds: ["2", "3"], errors: ["invalid_transition"] });
  });
});

describe("événements à trier", () => {
  const e = (id: string, status: string, start: string, end: string) => ({ id, status, startsAt: start, endsAt: end });
  it("publiés et pas encore passés, le plus proche d'abord", () => {
    const at = new Date("2026-10-17T12:00:00Z");
    const list = triageEvents(
      [
        e("late", "published", "2026-12-01T10:00:00Z", "2026-12-01T18:00:00Z"),
        e("past", "published", "2026-09-01T10:00:00Z", "2026-09-01T18:00:00Z"),
        e("draft", "draft", "2026-11-01T10:00:00Z", "2026-11-01T18:00:00Z"),
        e("soon", "published", "2026-10-20T10:00:00Z", "2026-10-20T18:00:00Z"),
        e("cancelled", "cancelled", "2026-10-25T10:00:00Z", "2026-10-25T18:00:00Z"),
      ],
      at,
    );
    expect(list.map((x) => x.id)).toEqual(["soon", "late"]);
  });
});
