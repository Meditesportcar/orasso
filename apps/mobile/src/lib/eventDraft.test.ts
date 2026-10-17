// Lot 35b : l'assistant d'événement de l'appli valide chaque écran avec les règles du site (modèle partagé), garde le
// brouillon d'une création et enregistre dans le même ordre que le site (événement, jours, zones, affiche).
import { appWizardSteps, type EventDraft, type EventOrganizer, initialEventDraft, withMultiDay } from "@orasso/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ api: {} }));

import {
  appStepProblem,
  draftWorthKeeping,
  firstAppProblem,
  joinDateTime,
  moveStep,
  normalizeTime,
  parseStoredDraft,
  progressOf,
  serializeDraft,
  siteStepOf,
} from "./eventDraft";
import { type EventEditorApi, saveEvent } from "./eventSave";

const NOW = new Date("2026-10-17T08:00:00Z");
const S = "11111111-1111-4111-8111-111111111111";

const draft = (over: Partial<EventDraft> = {}): EventDraft => ({
  ...initialEventDraft(NOW),
  title: "Rasso du port",
  startsAt: "2026-11-08T09:00",
  endsAt: "2026-11-08T13:00",
  ...over,
});

const at = (step: (typeof appWizardSteps)[number]) => appWizardSteps.indexOf(step);

describe("écrans de l'assistant", () => {
  it("la première étape du site est découpée en format, dates et lieu", () => {
    expect(appWizardSteps.slice(0, 3)).toEqual(["format", "dates", "lieu"]);
    expect(siteStepOf("dates")).toBe("format");
    expect(siteStepOf("zones")).toBe("zones");
    expect(appStepProblem("format", draft({ title: "x" }))).toMatch(/titre/);
    expect(appStepProblem("format", draft({ startsAt: "" }))).toBeNull();
    expect(appStepProblem("dates", draft({ startsAt: "" }))).toMatch(/début et la fin/);
    expect(appStepProblem("lieu", draft())).toBeNull();
    expect(appStepProblem("places", draft({ unlimited: false, capacity: "" }))).toMatch(/places/);
  });

  it("saute les critères hors filtration, dans les deux sens", () => {
    const admission = at("admission");
    expect(moveStep(admission, 1, { admission: "filtered" })).toBe(at("criteres"));
    expect(moveStep(admission, 1, { admission: "open" })).toBe(at("avant-premiere"));
    expect(moveStep(at("avant-premiere"), -1, { admission: "invite_only" })).toBe(admission);
    expect(moveStep(0, -1, { admission: "open" })).toBe(0);
    expect(progressOf(at("avant-premiere"), { admission: "open" })).toEqual({ n: 9, total: 13 });
    expect(progressOf(at("avant-premiere"), { admission: "filtered" })).toEqual({ n: 10, total: 14 });
  });

  it("trouve le premier écran en défaut avant d'enregistrer", () => {
    expect(firstAppProblem(draft())).toBeNull();
    expect(firstAppProblem(draft({ endsAt: "2026-11-08T08:00" }))).toMatchObject({ index: at("dates") });
    expect(firstAppProblem(draft({ zones: [{ code: "?", name: "", capacity: "" }] }))).toMatchObject({
      index: at("zones"),
    });
  });

  it("recompose date et heure saisies au clavier", () => {
    expect(normalizeTime("9h")).toBe("09:00");
    expect(normalizeTime("9:30")).toBe("09:30");
    expect(normalizeTime("0930")).toBe("09:30");
    expect(normalizeTime("21h15")).toBe("21:15");
    expect(normalizeTime("25:00")).toBe("25:00");
    expect(joinDateTime("2026-11-08", "9h")).toBe("2026-11-08T09:00");
    expect(joinDateTime("", "")).toBe("");
    expect(appStepProblem("dates", draft({ startsAt: joinDateTime("2026-11-08", "25:00") }))).toMatch(
      /début et la fin/,
    );
  });
});

describe("brouillon gardé sur le téléphone", () => {
  it("s'écrit et se relit ; un brouillon abîmé ou d'une autre version est ignoré", () => {
    const raw = serializeDraft({ draft: draft(), step: 4, createdId: null, savedAt: NOW.toISOString() });
    expect(parseStoredDraft(raw)).toMatchObject({ v: 1, step: 4, createdId: null, draft: { title: "Rasso du port" } });
    expect(parseStoredDraft(null)).toBeNull();
    expect(parseStoredDraft("{")).toBeNull();
    expect(parseStoredDraft(JSON.stringify({ v: 2, draft: draft(), step: 0, savedAt: "x" }))).toBeNull();
    expect(parseStoredDraft(JSON.stringify({ v: 1, draft: { title: 3 }, step: 0, savedAt: "x" }))).toBeNull();
    expect(parseStoredDraft(serializeDraft({ draft: draft(), step: 99, createdId: "e1", savedAt: "x" }))).toMatchObject(
      { step: appWizardSteps.length - 1, createdId: "e1" },
    );
  });

  it("n'est gardé qu'une fois quelque chose saisi", () => {
    expect(draftWorthKeeping(initialEventDraft(NOW))).toBe(false);
    expect(draftWorthKeeping({ ...initialEventDraft(NOW), title: "R" })).toBe(true);
  });
});

function fakeClient(fail: Partial<Record<keyof EventEditorApi, boolean>> = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const saved = { id: "e1", days: [], zones: [] } as unknown as EventOrganizer;
  const make =
    (name: keyof EventEditorApi) =>
    async (...args: unknown[]) => {
      calls.push({ name, args });
      if (fail[name]) throw new Error(`${name} refusé`);
      return saved;
    };
  const client = {
    createEvent: make("createEvent"),
    updateEvent: make("updateEvent"),
    putEventDays: make("putEventDays"),
    addZone: make("addZone"),
    updateZone: make("updateZone"),
    deleteZone: make("deleteZone"),
    uploadPoster: make("uploadPoster"),
  } as unknown as EventEditorApi;
  return { client, calls };
}

describe("enregistrement", () => {
  it("crée un événement d'un jour, ses zones et son affiche", async () => {
    const { client, calls } = fakeClient();
    const poster = new FormData();
    const res = await saveEvent(client, {
      structureId: S,
      draft: draft({ zones: [{ code: "a", name: "Alpha", capacity: "" }] }),
      createdId: null,
      poster,
    });
    expect(res.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(["createEvent", "addZone", "uploadPoster"]);
    expect(calls[0]?.args[0]).toBe(S);
    expect(calls[1]?.args[1]).toEqual({ code: "A", name: "Alpha", capacity: null, position: 0 });
  });

  it("refuse avant tout appel si un écran est en défaut", async () => {
    const { client, calls } = fakeClient();
    const res = await saveEvent(client, { structureId: S, draft: draft({ title: "" }), createdId: null, poster: null });
    expect(res).toMatchObject({ ok: false, index: 0 });
    expect(calls).toHaveLength(0);
  });

  it("jours refusés à la création : l'événement créé passe en modification (pas de second POST)", async () => {
    const multi = withMultiDay(draft(), true, NOW);
    const first = fakeClient({ putEventDays: true });
    const res = await saveEvent(first.client, { structureId: S, draft: multi, createdId: null, poster: null });
    expect(res).toMatchObject({ ok: false, index: 1, createdId: "e1" });
    const second = fakeClient();
    const again = await saveEvent(second.client, { structureId: S, draft: multi, createdId: "e1", poster: null });
    expect(again.ok).toBe(true);
    expect(second.calls.map((c) => c.name)).toEqual(["updateEvent", "putEventDays"]);
    // Événement existant sur plusieurs jours : pas de dates dans le PATCH (une seule notification, celle des jours).
    expect(second.calls[0]?.args[1]).not.toHaveProperty("startsAt");
  });

  it("modification : un événement de plusieurs jours repassé à un seul enregistre les jours d'abord", async () => {
    const event = {
      id: "e9",
      days: [{ id: "d1" }, { id: "d2" }],
      zones: [{ id: "z1" }],
    } as unknown as EventOrganizer;
    const { client, calls } = fakeClient();
    const res = await saveEvent(client, { structureId: S, draft: draft(), event, createdId: null, poster: null });
    expect(res.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(["putEventDays", "updateEvent", "deleteZone"]);
    expect(calls[0]?.args).toEqual(["e9", { dayAccess: undefined, days: [] }]);
    expect(calls[1]?.args[1]).toHaveProperty("startsAt");
  });

  it("affiche refusée : l'événement est enregistré, avec un avertissement", async () => {
    const { client } = fakeClient({ uploadPoster: true });
    const res = await saveEvent(client, { structureId: S, draft: draft(), createdId: null, poster: new FormData() });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.warnings[0]).toMatch(/affiche/);
  });
});
