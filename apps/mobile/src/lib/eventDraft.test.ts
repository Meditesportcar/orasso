// Lot 35b (lot 53 : huit temps, règles du site) : l'assistant d'événement de l'appli garde le brouillon d'une création
// et enregistre dans le même ordre que le site (événement, jours, zones, missions, affiche perso), puis relit.
import {
  afterNeedWrites,
  type EventDraft,
  type EventNeedView,
  type EventOrganizer,
  eventStepProblem,
  eventWizardSteps,
  initialEventDraft,
  withMultiDay,
} from "@orasso/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ api: {} }));

import {
  datePart,
  draftWorthKeeping,
  joinDateTime,
  normalizeTime,
  parseStoredDraft,
  serializeDraft,
  timePart,
} from "./eventDraft";
import { type EventEditorApi, saveEvent } from "./eventSave";

const NOW = new Date("2026-10-17T08:00:00Z");
/** Comme `ApiRequestError` (`status` 0 : pas de réponse), sans charger React Native. */
const apiError = (status: number, message: string) => Object.assign(new Error(message), { status });
const S = "11111111-1111-4111-8111-111111111111";

const draft = (over: Partial<EventDraft> = {}): EventDraft => ({
  ...initialEventDraft(NOW),
  title: "Rasso du port",
  startsAt: "2026-11-08T09:00",
  endsAt: "2026-11-08T13:00",
  addressLine: "Quai du port",
  city: "Port-Vendres",
  ...over,
});

describe("saisie de l'assistant", () => {
  it("recompose date et heure saisies au clavier", () => {
    expect(normalizeTime("9h")).toBe("09:00");
    expect(normalizeTime("9:30")).toBe("09:30");
    expect(normalizeTime("0930")).toBe("09:30");
    expect(normalizeTime("21h15")).toBe("21:15");
    expect(normalizeTime("25:00")).toBe("25:00");
    expect(joinDateTime("2026-11-08", "9h")).toBe("2026-11-08T09:00");
    expect(joinDateTime("", "")).toBe("");
    // Saisie en cours : la date partielle ne déborde pas sur l'heure.
    expect(joinDateTime("2026-1", "9", false)).toBe("2026-1T9");
    expect(datePart("2026-1T9")).toBe("2026-1");
    expect(timePart("2026-1T9")).toBe("9");
    expect(timePart("")).toBe("");
    expect(eventStepProblem("type", draft({ startsAt: joinDateTime("2026-11-08", "25:00") }))).toMatch(
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
      { step: eventWizardSteps.length - 1, createdId: "e1" },
    );
    // Index écrit avec l'ancien découpage (douze étapes, sans `steps`) : ignoré, l'assistant rouvre au temps calculé.
    expect(parseStoredDraft(JSON.stringify({ v: 1, draft: draft(), step: 9, savedAt: "x" }))?.step).toBeNull();
  });

  it("garde l'affiche choisie (lot 34) ; une affiche abîmée est ignorée", () => {
    const poster = { uri: "file:///doc/affiche.jpg", width: 1200, height: 1600 };
    const raw = serializeDraft({ draft: draft(), step: 2, createdId: null, savedAt: "x", poster });
    expect(parseStoredDraft(raw)?.poster).toEqual(poster);
    const broken = serializeDraft({ draft: draft(), step: 2, createdId: null, savedAt: "x" });
    expect(parseStoredDraft(broken)?.poster).toBeNull();
    expect(parseStoredDraft(JSON.stringify({ ...JSON.parse(broken), poster: { uri: 3 } }))?.poster).toBeNull();
  });

  it("n'est gardé qu'une fois quelque chose saisi", () => {
    expect(draftWorthKeeping(initialEventDraft(NOW))).toBe(false);
    expect(draftWorthKeeping({ ...initialEventDraft(NOW), title: "R" })).toBe(true);
  });
});

function fakeClient(fail: Partial<Record<keyof EventEditorApi, boolean | Error>> = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const saved = { id: "e1", days: [], zones: [] } as unknown as EventOrganizer;
  const make =
    (name: keyof EventEditorApi) =>
    async (...args: unknown[]) => {
      calls.push({ name, args });
      const f = fail[name];
      if (f) throw f instanceof Error ? f : new Error(`${name} refusé`);
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
    addNeed: make("addNeed"),
    updateNeed: make("updateNeed"),
    deleteNeed: make("deleteNeed"),
    orgEvent: make("orgEvent"),
    eventNeeds: async () => [],
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
    expect(calls.map((c) => c.name)).toEqual(["createEvent", "addZone", "uploadPoster", "orgEvent"]);
    expect(calls[0]?.args[0]).toBe(S);
    expect(calls[1]?.args[1]).toEqual({ code: "A", name: "Alpha", capacity: null, position: 0 });
  });

  it("refuse avant tout appel si un écran est en défaut", async () => {
    const { client, calls } = fakeClient();
    const res = await saveEvent(client, {
      structureId: S,
      draft: draft({ title: "" }),
      createdId: null,
      poster: null,
      validate: true,
    });
    expect(res).toMatchObject({ ok: false, step: "type" });
    expect(calls).toHaveLength(0);
  });

  it("jours refusés à la création : l'événement créé passe en modification (pas de second POST)", async () => {
    const multi = withMultiDay(draft(), true, NOW);
    const first = fakeClient({ putEventDays: apiError(409, "Ce jour a des candidatures.") });
    const res = await saveEvent(first.client, { structureId: S, draft: multi, createdId: null, poster: null });
    expect(res).toMatchObject({ ok: false, step: "type", createdId: "e1" });
    const second = fakeClient();
    const again = await saveEvent(second.client, { structureId: S, draft: multi, createdId: "e1", poster: null });
    expect(again.ok).toBe(true);
    expect(second.calls.map((c) => c.name)).toEqual(["updateEvent", "putEventDays", "orgEvent"]);
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
    expect(calls.map((c) => c.name)).toEqual(["putEventDays", "updateEvent", "deleteZone", "orgEvent"]);
    expect(calls[0]?.args).toEqual(["e9", { dayAccess: undefined, days: [] }]);
    expect(calls[1]?.args[1]).toHaveProperty("startsAt");
  });

  it("missions : créées, modifiées, retirées après l'événement (lot 53)", async () => {
    const { client, calls } = fakeClient();
    const res = await saveEvent(client, {
      structureId: S,
      draft: draft({
        needs: [
          { id: "n2", trade: "food_truck", quantity: "1", power: "none", water: false, frontageM: "", installTime: "" },
          { trade: "photographer", quantity: "2", power: "a16", water: true, frontageM: "4", installTime: "16:00" },
        ],
        knownNeedIds: ["n1", "n2"],
      }),
      event: { id: "e1", days: [], zones: [] } as unknown as EventOrganizer,
      savedNeeds: [{ id: "n1" }, { id: "n2" }] as never,
      createdId: null,
      poster: null,
    });
    expect(res.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(["updateEvent", "deleteNeed", "updateNeed", "addNeed", "orgEvent"]);
    expect(calls[3]?.args[1]).toMatchObject({
      trade: "photographer",
      quantity: 2,
      installAt: "2026-11-08T15:00:00.000Z",
    });
  });

  it("affiche refusée : l'événement est enregistré, l'affiche est dite refusée (gardée pour la renvoyer)", async () => {
    const { client } = fakeClient({ uploadPoster: true });
    const res = await saveEvent(client, { structureId: S, draft: draft(), createdId: null, poster: new FormData() });
    expect(res).toMatchObject({ ok: true, refused: { poster: true, zones: [], needs: [] } });
  });

  it("zone et mission refusées : rendues par leur ligne, l'enregistrement continue (relecture du lot 53)", async () => {
    const { client, calls } = fakeClient({ addZone: true, addNeed: true });
    const res = await saveEvent(client, {
      structureId: S,
      draft: draft({
        zones: [{ code: "A", name: "Alpha", capacity: "" }],
        needs: [{ trade: "photographer", quantity: "1", power: "none", water: false, frontageM: "", installTime: "" }],
      }),
      event: { id: "e1", days: [], zones: [] } as unknown as EventOrganizer,
      createdId: null,
      poster: null,
    });
    expect(res).toMatchObject({ ok: true, refused: { zones: [0], needs: [0], removals: 0, poster: false } });
    expect(calls.map((c) => c.name)).toEqual(["updateEvent", "addZone", "addNeed", "orgEvent"]);
  });

  it("hors réseau : l'assistant reste sur son temps (relecture du lot 53)", async () => {
    const offline = apiError(0, "Pas de réseau.");
    const event = { id: "e1", days: [], zones: [] } as unknown as EventOrganizer;
    const patch = fakeClient({ updateEvent: offline });
    const res = await saveEvent(patch.client, { structureId: S, draft: draft(), event, createdId: null, poster: null });
    expect(res).toMatchObject({ ok: false, step: null, createdId: null });
    const days = fakeClient({ putEventDays: offline });
    const multi = withMultiDay(draft(), true, NOW);
    const res2 = await saveEvent(days.client, { structureId: S, draft: multi, createdId: null, poster: null });
    expect(res2).toMatchObject({ ok: false, step: null, createdId: "e1" });
  });

  it("Publier exige l'affiche ; « Brouillon », non", async () => {
    const { client, calls } = fakeClient();
    const input = { structureId: S, draft: draft(), createdId: null, poster: null };
    expect(await saveEvent(client, { ...input, validate: "publish" })).toMatchObject({ ok: false, step: "affiche" });
    expect(calls).toHaveLength(0);
    expect((await saveEvent(client, { ...input, validate: true })).ok).toBe(true);
  });
});

describe("panne après l'écriture des missions (correctif 53c)", () => {
  it("la relecture échoue après la création : le nouvel essai ne recrée pas la mission", async () => {
    const event = { id: "e1", days: [], zones: [] } as unknown as EventOrganizer;
    const row = {
      trade: "photographer" as const,
      quantity: "1",
      power: "none" as const,
      water: false,
      frontageM: "",
      installTime: "",
    };
    const sent = draft({ needs: [row] });
    const created = { id: "n7", trade: "photographer", quantity: 1, position: 0 } as unknown as EventNeedView;
    const first = fakeClient({ orgEvent: apiError(0, "Pas de réseau.") });
    (first.client as { addNeed: unknown }).addNeed = async () => created;
    const res = await saveEvent(first.client, {
      structureId: S,
      draft: sent,
      event,
      savedNeeds: [],
      createdId: null,
      poster: null,
    });
    expect(res).toMatchObject({ ok: false, step: null });
    if (res.ok) return;
    expect(res.needWrites?.created).toEqual([{ position: 0, need: created }]);
    // L'assistant reporte la création avant de retenter (`afterNeedWrites`).
    const after = afterNeedWrites({
      savedNeeds: [],
      sent,
      current: sent,
      writes: res.needWrites ?? { created: [], removed: [] },
    });
    const second = fakeClient();
    const again = await saveEvent(second.client, {
      structureId: S,
      draft: after.draft,
      event,
      savedNeeds: after.savedNeeds,
      createdId: null,
      poster: null,
    });
    expect(again.ok).toBe(true);
    expect(second.calls.map((c) => c.name)).not.toContain("addNeed");
  });
});

describe("zones et clés de création (correctif 53c, tour 2)", () => {
  it("zone : un 409 (zone de ce code créée ailleurs) reste un refus ; une zone créée avant une panne est rendue (tour 3)", async () => {
    const event = { id: "e1", days: [], zones: [] } as unknown as EventOrganizer;
    const { client } = fakeClient({ addZone: apiError(409, "La zone A existe déjà") });
    const res = await saveEvent(client, {
      structureId: S,
      draft: draft({ zones: [{ code: "A", name: "Alpha", capacity: "" }] }),
      event,
      createdId: null,
      poster: null,
    });
    expect(res).toMatchObject({ ok: true, refused: { zones: [0] } });
    // Créée, puis relecture en panne : la zone créée est rendue pour être mise à jour au nouvel essai.
    const broken = fakeClient({ orgEvent: apiError(0, "Pas de réseau.") });
    const res3 = await saveEvent(broken.client, {
      structureId: S,
      draft: draft({ zones: [{ code: "A", name: "Alpha", capacity: "" }] }),
      event,
      createdId: null,
      poster: null,
    });
    expect(res3).toMatchObject({ ok: false, zoneWrites: { created: [{ position: 0, id: "e1" }] } });
    // Un autre refus de zone reste un refus.
    const other = fakeClient({ addZone: apiError(429, "Trop de modifications") });
    const res2 = await saveEvent(other.client, {
      structureId: S,
      draft: draft({ zones: [{ code: "A", name: "Alpha", capacity: "" }] }),
      event,
      createdId: null,
      poster: null,
    });
    expect(res2).toMatchObject({ ok: true, refused: { zones: [0] } });
  });

  it("une mission inconnue de la saisie n'est jamais supprimée ; la création envoie sa clé", async () => {
    const event = { id: "e1", days: [], zones: [] } as unknown as EventOrganizer;
    const { client, calls } = fakeClient();
    const res = await saveEvent(client, {
      structureId: S,
      draft: draft({
        needs: [
          {
            trade: "photographer",
            quantity: "1",
            power: "none",
            water: false,
            frontageM: "",
            installTime: "",
            clientKey: "11111111-1111-4111-8111-000000000001",
          },
        ],
      }),
      event,
      savedNeeds: [{ id: "n9" }] as never,
      createdId: null,
      poster: null,
    });
    expect(res.ok).toBe(true);
    expect(calls.map((c) => c.name)).not.toContain("deleteNeed");
    expect(calls.find((c) => c.name === "addNeed")?.args[1]).toMatchObject({
      clientKey: "11111111-1111-4111-8111-000000000001",
    });
  });
});

describe("clé déjà connue, valeurs changées entre deux essais (correctif 53c, tour 3)", () => {
  it("l'API rend l'ancienne mission : un PATCH part aussitôt avec la saisie", async () => {
    const event = { id: "e1", days: [], zones: [] } as unknown as EventOrganizer;
    const { client, calls } = fakeClient();
    const stale = { id: "n7", trade: "photographer", quantity: 1, power: "none", water: false, frontageM: null };
    (client as { addNeed: unknown }).addNeed = async (...args: unknown[]) => {
      calls.push({ name: "addNeed", args });
      return { ...stale, installAt: null, position: 0 };
    };
    const res = await saveEvent(client, {
      structureId: S,
      draft: draft({
        needs: [
          {
            trade: "photographer",
            quantity: "3",
            power: "none",
            water: false,
            frontageM: "",
            installTime: "",
            clientKey: "11111111-1111-4111-8111-000000000002",
          },
        ],
      }),
      event,
      createdId: null,
      poster: null,
    });
    expect(res.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(["updateEvent", "addNeed", "updateNeed", "orgEvent"]);
    expect(calls[2]?.args.slice(1)).toEqual(["n7", expect.objectContaining({ quantity: 3 })]);
    expect(calls[2]?.args[2]).not.toHaveProperty("clientKey");
  });
});
