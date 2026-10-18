import { describe, expect, it } from "vitest";

import {
  type EventDraft,
  eventDaysPayload,
  eventPayload,
  eventStepProblem,
  eventStepSkipped,
  firstEventProblem,
  fromWallInput,
  initialEventDraft,
  toWallInput,
  withAddedDay,
  withMultiDay,
  zoneChanges,
} from "./eventWizard";
import { defaultEventRules } from "./labels/events.fr";
import type { EventOrganizer } from "./schemas/event";
import { eventCreateSchema, eventDaysPutSchema, eventUpdateSchema } from "./schemas/event";

const NOW = new Date("2026-10-17T08:00:00Z"); // 10 h à Paris

function filled(over: Partial<EventDraft> = {}): EventDraft {
  return {
    ...initialEventDraft(NOW),
    title: "Rasso du port",
    startsAt: "2026-11-08T09:00",
    endsAt: "2026-11-08T13:00",
    addressLine: "Quai du port",
    city: "Port-Vendres",
    ...over,
  };
}

describe("heure de Paris", () => {
  it("convertit dans les deux sens, été comme hiver", () => {
    expect(toWallInput("2026-07-05T16:00:00Z")).toBe("2026-07-05T18:00");
    expect(fromWallInput("2026-07-05T18:00")).toBe("2026-07-05T16:00:00.000Z");
    expect(fromWallInput("2026-12-05T18:00")).toBe("2026-12-05T17:00:00.000Z");
  });
  it("refuse une valeur illisible", () => {
    expect(fromWallInput("")).toBeNull();
    expect(fromWallInput("05/12/2026 18:00")).toBeNull();
    expect(fromWallInput("2026-13-05T18:00")).toBeNull();
    expect(fromWallInput("2026-12-05T25:00")).toBeNull();
  });
});

describe("brouillon neuf", () => {
  it("prend les valeurs par défaut des docs", () => {
    const d = initialEventDraft(NOW);
    expect(d.format).toBe("gathering");
    expect(d.vehicleTypes).toEqual(["car"]);
    expect(d.unlimited).toBe(true);
    expect(d.admission).toBe("filtered");
    expect(d.publicAccess).toBe("free");
    expect(d.previewHours).toBe("24");
    expect(d.lockOffsetMinutes).toBe("120");
    expect(d.highGradeMin).toBe("circuit");
    expect(d.rulesText).toBe(defaultEventRules);
    expect(d.registrationsOpenAt).toBe("2026-10-17T10:00");
  });
});

describe("validation par étape", () => {
  it("titre, dates, véhicules, places, billetterie externe, ouverture, zones", () => {
    expect(eventStepProblem("format", filled({ title: "ab" }))).toMatch(/titre/);
    expect(eventStepProblem("format", filled({ endsAt: "2026-11-08T08:00" }))).toMatch(/fin doit suivre/);
    expect(eventStepProblem("format", filled({ startsAt: "" }))).toMatch(/début et la fin/);
    expect(eventStepProblem("format", filled())).toBeNull();
    expect(eventStepProblem("vehicules", filled({ vehicleTypes: [] }))).toMatch(/au moins un type/);
    expect(eventStepProblem("places", filled({ unlimited: false, capacity: "0" }))).toMatch(/supérieur à zéro/);
    expect(eventStepProblem("places", filled({ unlimited: false, capacity: "80" }))).toBeNull();
    expect(
      eventStepProblem(
        "public",
        filled({ publicAccess: "paid_external", paymentMode: "link", externalTicketUrl: "x" }),
      ),
    ).toMatch(/billetterie/);
    expect(eventStepProblem("public", filled({ publicAccess: "paid_external", paymentMode: "on_site" }))).toBeNull();
    expect(eventStepProblem("avant-premiere", filled({ registrationsOpenAt: "" }))).toMatch(/ouverture/);
    expect(eventStepProblem("zones", filled({ zones: [{ code: "JDM!", name: "x", capacity: "" }] }))).toMatch(/code/);
    expect(
      eventStepProblem(
        "zones",
        filled({
          zones: [
            { code: "a", name: "A", capacity: "" },
            { code: "A", name: "B", capacity: "" },
          ],
        }),
      ),
    ).toMatch(/même code/);
  });

  it("plusieurs jours : au moins deux, complets, dates distinctes, places positives", () => {
    const multi = withMultiDay(filled(), true, NOW);
    expect(multi.days).toHaveLength(2);
    expect(multi.days[1]?.date).toBe("2026-11-09");
    expect(multi.days[0]?.startTime).toBe("09:00");
    expect(eventStepProblem("format", multi)).toBeNull();
    expect(eventStepProblem("format", { ...multi, days: multi.days.slice(0, 1) })).toMatch(/au moins deux/);
    expect(
      eventStepProblem("format", { ...multi, days: multi.days.map((x) => ({ ...x, date: "2026-11-08" })) }),
    ).toMatch(/même date/);
    expect(
      eventStepProblem("format", { ...multi, days: [{ ...multi.days[0]!, startTime: "9h" }, multi.days[1]!] }),
    ).toMatch(/illisible/);
    expect(
      eventStepProblem("format", { ...multi, days: [{ ...multi.days[0]!, capacity: "-2" }, multi.days[1]!] }),
    ).toMatch(/Places d'un jour/);
    const three = withAddedDay(multi, NOW);
    expect(three.days[2]).toMatchObject({ date: "2026-11-10", startTime: "09:00", endTime: "13:00" });
  });

  it("les critères sont sautés hors filtration ; la première étape en défaut est trouvée", () => {
    expect(eventStepSkipped("criteres", { admission: "open" })).toBe(true);
    expect(eventStepSkipped("criteres", { admission: "filtered" })).toBe(false);
    expect(firstEventProblem(filled())).toBeNull();
    expect(
      firstEventProblem(filled({ vehicleTypes: [], zones: [{ code: "", name: "", capacity: "" }] })),
    ).toMatchObject({
      step: "vehicules",
    });
  });
});

describe("corps envoyés à l'API", () => {
  it("passent les schémas de l'API (création, modification, jours)", () => {
    const d = filled({
      unlimited: false,
      capacity: "120",
      categoryIds: ["0b0c3a5e-6a47-4f0c-9c1e-2a1d1c0b0a01"],
      countries: ["JP"],
      lat: 42.7,
      lng: 3.03,
      vendorTypes: ["Food truck"],
    });
    const create = eventCreateSchema.safeParse(eventPayload(d));
    expect(create.success).toBe(true);
    expect(eventPayload(d)).toMatchObject({ capacity: 120, lat: 42.7, criteria: { countries: ["JP"] } });
    const open = eventPayload({ ...d, admission: "open" });
    expect(open.criteria).toBeNull();
    const multi = withMultiDay(d, true, NOW);
    // Modification d'un événement sur plusieurs jours : pas de dates dans le PATCH (une seule notification).
    const patch = eventPayload(multi, true);
    expect("startsAt" in patch).toBe(false);
    expect(eventUpdateSchema.safeParse(patch).success).toBe(true);
    // Création sur plusieurs jours : bornes approchées.
    expect(eventPayload(multi, false)).toMatchObject({
      startsAt: "2026-11-08T08:00:00.000Z",
      endsAt: "2026-11-09T12:00:00.000Z",
    });
    expect(eventDaysPutSchema.safeParse(eventDaysPayload(multi)).success).toBe(true);
    expect(eventDaysPayload(d)).toEqual({ dayAccess: undefined, days: [] });
  });

  it("zones : retirées, modifiées, créées, dans l'ordre de saisie", () => {
    const out = zoneChanges(
      [{ id: "z1" }, { id: "z2" }],
      [
        { id: "z2", code: "jdm", name: " JDM ", capacity: "" },
        { code: "B", name: "Euro", capacity: "12" },
      ],
    );
    expect(out.remove).toEqual(["z1"]);
    expect(out.update).toEqual([{ id: "z2", zone: { code: "JDM", name: "JDM", capacity: null, position: 0 } }]);
    expect(out.create).toEqual([{ code: "B", name: "Euro", capacity: 12, position: 1 }]);
  });

  it("préremplit la modification depuis l'événement enregistré", () => {
    const event = {
      format: "night",
      title: "Nocturne",
      description: null,
      startsAt: "2026-11-08T17:00:00.000Z",
      endsAt: "2026-11-08T22:00:00.000Z",
      lockAt: "2026-11-08T15:00:00.000Z",
      days: [],
      dayAccess: "whole",
      addressLine: null,
      postalCode: "66140",
      city: "Canet",
      lat: null,
      lng: null,
      admittedVehicleTypes: ["car", "moto"],
      maxVehiclesPerUser: 2,
      capacity: 50,
      vendorTypes: [],
      shopEnabled: true,
      publicAccess: "paid_external",
      externalTicketUrl: null,
      admission: "open",
      criteria: null,
      registrationsOpenAt: "2026-10-20T08:00:00.000Z",
      previewHours: 48,
      highGradePriority: true,
      highGradePreviewHours: 24,
      highGradeMin: "legende",
      rulesText: null,
      instructions: "Entrée nord",
      zones: [{ id: "z1", code: "A", name: "Alpha", capacity: null, position: 0 }],
    } as unknown as EventOrganizer;
    const d = initialEventDraft(NOW, event);
    expect(d).toMatchObject({
      startsAt: "2026-11-08T18:00",
      lockOffsetMinutes: "120",
      unlimited: false,
      capacity: "50",
      paymentMode: "on_site",
      multiDay: false,
      dayAccess: "both",
      zones: [{ id: "z1", code: "A", name: "Alpha", capacity: "" }],
    });
  });
});
