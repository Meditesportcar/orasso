import { describe, expect, it } from "vitest";

import {
  type EventDraft,
  eventDaysPayload,
  eventKindOf,
  eventPayload,
  eventResumeStep,
  eventStepProblem,
  eventWizardStepOf,
  eventWizardSteps,
  firstEventProblem,
  firstRecurrenceDate,
  fromWallInput,
  initialEventDraft,
  needChanges,
  needsFromSaved,
  previewTimeline,
  recurrenceDates,
  recurrenceRuleOf,
  rulesCount,
  summaryOfCriteria,
  toWallInput,
  withAddedDay,
  withArrivalSlot,
  withEventKind,
  withMultiDay,
  zoneChanges,
} from "./eventWizard";
import { eventStepLabels } from "./labels/event-editor.fr";
import { defaultEventRules } from "./labels/events.fr";
import type { EventOrganizer } from "./schemas/event";
import { eventCreateSchema, eventDaysPutSchema, eventUpdateSchema, recurrenceRuleSchema } from "./schemas/event";
import { eventNeedSchema, eventNeedUpdateSchema } from "./schemas/provider";

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
    expect(d).toMatchObject({ entranceNote: "", needs: [], recurrence: null });
  });
});

describe("huit temps (lot 53)", () => {
  it("dans l'ordre du prototype, chacun nommé", () => {
    expect(eventWizardSteps).toEqual([
      "type",
      "lieu",
      "arrivees",
      "criteres",
      "avant-premiere",
      "reglement",
      "affiche",
      "publier",
    ]);
    for (const step of eventWizardSteps) expect(eventStepLabels[step]).toBeTruthy();
    expect(eventWizardStepOf("lieu")).toBe("lieu");
    expect(eventWizardStepOf("zones")).toBeNull();
    expect(eventWizardStepOf(null)).toBeNull();
  });

  it("type : titre, dates, véhicules, places (le volet « Public et places »)", () => {
    expect(eventStepProblem("type", filled({ title: "ab" }))).toMatch(/titre/);
    expect(eventStepProblem("type", filled({ endsAt: "2026-11-08T08:00" }))).toMatch(/fin doit suivre/);
    expect(eventStepProblem("type", filled({ startsAt: "" }))).toMatch(/début et la fin/);
    expect(eventStepProblem("type", filled({ vehicleTypes: [] }))).toMatch(/au moins un type/);
    expect(eventStepProblem("type", filled({ unlimited: false, capacity: "0" }))).toMatch(/supérieur à zéro/);
    expect(eventStepProblem("type", filled({ unlimited: false, capacity: "80" }))).toBeNull();
    // L'adresse n'est plus au premier temps : elle a le sien.
    expect(eventStepProblem("type", filled({ addressLine: "" }))).toBeNull();
  });

  it("lieu : adresse obligatoire, zones et missions du volet « Sur place »", () => {
    expect(eventStepProblem("lieu", filled({ addressLine: "" }))).toMatch(/adresse/i);
    expect(eventStepProblem("lieu", filled({ city: " " }))).toMatch(/ville/i);
    expect(eventStepProblem("lieu", filled({ zones: [{ code: "JDM!", name: "x", capacity: "" }] }))).toMatch(/code/);
    expect(
      eventStepProblem(
        "lieu",
        filled({
          zones: [
            { code: "a", name: "A", capacity: "" },
            { code: "A", name: "B", capacity: "" },
          ],
        }),
      ),
    ).toMatch(/même code/);
    const need = { trade: "food_truck" as const, quantity: "1", power: "none" as const, water: false, frontageM: "", installTime: "" };
    expect(eventStepProblem("lieu", filled({ needs: [need] }))).toBeNull();
    expect(eventStepProblem("lieu", filled({ needs: [{ ...need, quantity: "0" }] }))).toMatch(/de 1 à 9/);
    expect(eventStepProblem("lieu", filled({ needs: [{ ...need, frontageM: "40" }] }))).toMatch(/façade/);
    expect(eventStepProblem("lieu", filled({ needs: [{ ...need, installTime: "16h" }] }))).toMatch(/HH:MM/);
  });

  it("arrivées : créneaux (mêmes règles que l'API) et lien de billetterie du volet « Public »", () => {
    const withSlot = withArrivalSlot(filled(), "exhibitors", { from: "08:00", to: "08:45", strict: true, note: null });
    expect(eventStepProblem("arrivees", withSlot)).toBeNull();
    const bad = withArrivalSlot(filled(), "exhibitors", { from: "10:00", to: "10:00", strict: true, note: null });
    expect(eventStepProblem("arrivees", bad)).toMatch(/exposants/);
    expect(withArrivalSlot(bad, "exhibitors", null).arrivals).toEqual({ exhibitors: null, public: null });
    expect(
      eventStepProblem(
        "arrivees",
        filled({ publicAccess: "paid_external", paymentMode: "link", externalTicketUrl: "x" }),
      ),
    ).toMatch(/billetterie/);
    expect(eventStepProblem("arrivees", filled({ publicAccess: "paid_external", paymentMode: "on_site" }))).toBeNull();
  });

  it("avant-première, affiche ; critères, règlement et récapitulatif sans blocage", () => {
    expect(eventStepProblem("avant-premiere", filled({ registrationsOpenAt: "" }))).toMatch(/ouverture/);
    expect(eventStepProblem("affiche", filled({ poster: { photoKey: "k", style: "jdm", title: " " } }))).toMatch(
      /titre/,
    );
    expect(
      eventStepProblem("affiche", filled({ poster: { photoKey: "k", style: "jdm", title: "x".repeat(35) } })),
    ).toMatch(/34/);
    expect(eventStepProblem("affiche", filled({ poster: null }))).toBeNull();
    for (const step of ["criteres", "reglement", "publier"] as const) {
      expect(eventStepProblem(step, filled({ rulesText: "", admission: "open" }))).toBeNull();
    }
  });

  it("plusieurs jours : au moins deux, complets, dates distinctes, places positives", () => {
    const multi = withMultiDay(filled(), true, NOW);
    expect(multi.days).toHaveLength(2);
    expect(multi.days[1]?.date).toBe("2026-11-09");
    expect(multi.days[0]?.startTime).toBe("09:00");
    expect(eventStepProblem("type", multi)).toBeNull();
    expect(eventStepProblem("type", { ...multi, days: multi.days.slice(0, 1) })).toMatch(/au moins deux/);
    expect(eventStepProblem("type", { ...multi, days: multi.days.map((x) => ({ ...x, date: "2026-11-08" })) })).toMatch(
      /même date/,
    );
    expect(
      eventStepProblem("type", { ...multi, days: [{ ...multi.days[0]!, startTime: "9h" }, multi.days[1]!] }),
    ).toMatch(/illisible/);
    expect(
      eventStepProblem("type", { ...multi, days: [{ ...multi.days[0]!, capacity: "-2" }, multi.days[1]!] }),
    ).toMatch(/Places d'un jour/);
    const three = withAddedDay(multi, NOW);
    expect(three.days[2]).toMatchObject({ date: "2026-11-10", startTime: "09:00", endTime: "13:00" });
  });

  it("premier temps en défaut, et temps où rouvrir un brouillon", () => {
    expect(firstEventProblem(filled())).toBeNull();
    expect(firstEventProblem(filled({ vehicleTypes: [], zones: [{ code: "", name: "", capacity: "" }] }))).toMatchObject(
      { step: "type" },
    );
    // Brouillon sans adresse : il rouvre au lieu.
    const noAddress = filled({ addressLine: "", city: "" });
    expect(firstEventProblem(noAddress)).toMatchObject({ step: "lieu", problem: expect.stringMatching(/adresse/i) });
    expect(eventResumeStep(noAddress, true)).toBe("lieu");
    expect(eventResumeStep(filled(), true)).toBe("publier");
    expect(eventResumeStep(filled(), false)).toBe("type");
    expect(eventResumeStep(filled(), false, "affiche")).toBe("affiche");
  });
});

describe("type : ponctuel, récurrent, plusieurs jours", () => {
  it("récurrent : cale la première date sur la règle, aux heures saisies", () => {
    expect(firstRecurrenceDate({ nth: 1, weekday: 0, count: 6 }, NOW)).toBe("2026-11-01");
    expect(firstRecurrenceDate({ nth: 3, weekday: 6, count: 6 }, NOW)).toBe("2026-10-17");
    expect(firstRecurrenceDate({ nth: -1, weekday: 0, count: 6 }, NOW)).toBe("2026-10-25");
    const rec = withEventKind(filled({ startsAt: "2026-11-08T09:00", endsAt: "2026-11-08T12:00" }), "rec", NOW);
    expect(eventKindOf(rec)).toBe("rec");
    expect(rec).toMatchObject({ startsAt: "2026-11-01T09:00", endsAt: "2026-11-01T12:00", multiDay: false });
    const dates = recurrenceDates(rec);
    expect(dates).toHaveLength(7);
    expect(toWallInput(dates[1]!)).toBe("2026-12-06T09:00");
    expect(recurrenceRuleSchema.safeParse(recurrenceRuleOf(rec.recurrence!)).success).toBe(true);
    expect(eventStepProblem("type", { ...rec, recurrence: { ...rec.recurrence!, count: 13 } })).toMatch(/12/);
    const multi = withEventKind(rec, "multi", NOW);
    expect(eventKindOf(multi)).toBe("multi");
    expect(multi.recurrence).toBeNull();
    expect(eventKindOf(withEventKind(multi, "one", NOW))).toBe("one");
  });
});

describe("critères en trois questions", () => {
  it("se résument en une phrase (prototype)", () => {
    expect(summaryOfCriteria({ countries: ["DE", "JP"], styles: ["JDM", "Sportive"], makes: [] })).toBe(
      "Tu acceptes les japonaises et les allemandes, de style JDM ou sportive, toutes marques.",
    );
    expect(summaryOfCriteria({ countries: [], styles: [], makes: [] })).toBe(
      "Tu acceptes tous les véhicules, tous styles, toutes marques.",
    );
    expect(summaryOfCriteria({ countries: ["FR", "IT", "GB"], styles: ["Youngtimer"], makes: ["Porsche", "Nissan"] })).toBe(
      "Tu acceptes les françaises, les italiennes et les britanniques, de style youngtimer, de marque Porsche ou Nissan.",
    );
  });
});

describe("avant-première, règlement", () => {
  it("frise : abonnés avant tout le monde, puis le début", () => {
    const t = previewTimeline(filled({ registrationsOpenAt: "2026-10-23T18:00", previewHours: "48" }));
    expect(t).toEqual({
      subscribers: "2026-10-21T16:00:00.000Z",
      everyone: "2026-10-23T16:00:00.000Z",
      start: "2026-11-08T08:00:00.000Z",
    });
    expect(previewTimeline(filled({ previewHours: "0" })).subscribers).toBeNull();
  });
  it("compte les lignes et les caractères", () => {
    expect(rulesCount("Un.\n\nDeux.\n")).toEqual({ lines: 2, chars: 10 });
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
      entranceNote: " Quai Nord ",
    });
    const create = eventCreateSchema.safeParse(eventPayload(d));
    expect(create.success).toBe(true);
    expect(eventPayload(d)).toMatchObject({
      capacity: 120,
      lat: 42.7,
      criteria: { countries: ["JP"] },
      entranceNote: "Quai Nord",
    });
    const open = eventPayload({ ...d, admission: "open", entranceNote: undefined });
    expect(open.criteria).toBeNull();
    expect(open.entranceNote).toBeNull();
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

  it("missions : retirées, modifiées, créées ; installation le jour de l'événement", () => {
    const d = filled({
      startsAt: "2026-11-08T19:00",
      endsAt: "2026-11-08T23:30",
      needs: [
        { id: "n2", trade: "food_truck", quantity: "2", power: "a16", water: true, frontageM: "6", installTime: "16:00" },
        { trade: "photographer", quantity: "1", power: "none", water: false, frontageM: "", installTime: "" },
      ],
    });
    const out = needChanges([{ id: "n1" }, { id: "n2" }], d);
    expect(out.remove).toEqual(["n1"]);
    expect(out.update[0]).toEqual({
      id: "n2",
      need: {
        trade: "food_truck",
        quantity: 2,
        power: "a16",
        water: true,
        frontageM: 6,
        installAt: "2026-11-08T15:00:00.000Z",
        position: 0,
      },
    });
    expect(out.create[0]).toMatchObject({ trade: "photographer", installAt: null, frontageM: null, position: 1 });
    expect(eventNeedSchema.safeParse(out.create[0]).success).toBe(true);
    expect(eventNeedUpdateSchema.safeParse(out.update[0]?.need).success).toBe(true);
    const back = needsFromSaved([
      {
        id: "n2",
        trade: "food_truck",
        tradeLabel: "Food truck",
        quantity: 2,
        filled: 0,
        remaining: 2,
        power: "a16",
        water: true,
        frontageM: 6,
        installAt: "2026-11-08T15:00:00.000Z",
        notes: null,
        position: 0,
      },
    ]);
    expect(back).toEqual([d.needs?.[0]]);
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
      entranceNote: "Barrière levée à 18 h",
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
      entranceNote: "Barrière levée à 18 h",
    });
  });
});
