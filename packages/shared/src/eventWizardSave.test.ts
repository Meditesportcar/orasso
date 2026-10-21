// Corrections des relectures du lot 53 (21/10/2026) : enregistrement à chaque temps réconcilié avec le serveur, temps
// où rouvrir un brouillon, récurrence, missions sur plusieurs jours, créneaux après un changement d'horaires, saisie
// de date en cours.
import { describe, expect, it } from "vitest";

import {
  afterNeedWrites,
  type EventDraft,
  eventArrivalsProblem,
  eventPayload,
  eventPublishProblem,
  eventResumeStep,
  eventStepProblem,
  eventWizardSteps,
  initialEventDraft,
  type NeedDraft,
  needChanges,
  needsFromSaved,
  newClientKey,
  noNeedWrites,
  noRefusals,
  parseWizardMemo,
  reconcileDraft,
  refusalMessage,
  rulesReplaceNeedsConfirm,
  sameDraft,
  serializeWizardMemo,
  serverDraft,
  storedStepIndex,
  withArrivalSlot,
  withArrivalsInHours,
  withDefaultPoster,
  withEventKind,
  withLoadedNeeds,
  withMultiDay,
  withNeedKeys,
  withSingleDate,
} from "./eventWizard";
import { defaultEventRules } from "./labels/events.fr";
import { createPreviewCache, posterPreviewKey } from "./rules/poster";
import type { EventOrganizer } from "./schemas/event";
import type { EventNeedView } from "./schemas/provider";

const NOW = new Date("2026-10-17T08:00:00Z");
const POSTER = { photoKey: null, style: "minimal" as const, title: "Rasso du port" };

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

/** L'événement tel que l'API le rend après avoir enregistré `d` (`over` : ce que le serveur a changé). */
function savedEvent(d: EventDraft, over: Partial<EventOrganizer> = {}): EventOrganizer {
  const body = eventPayload(d);
  return {
    id: "e1",
    status: "draft",
    format: d.format,
    title: body.title,
    description: body.description,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    lockAt: new Date(Date.parse(body.startsAt ?? "") - 120 * 60_000).toISOString(),
    days: [],
    dayAccess: "whole",
    addressLine: body.addressLine,
    postalCode: body.postalCode,
    city: body.city,
    lat: d.lat,
    lng: d.lng,
    admittedVehicleTypes: d.vehicleTypes,
    maxVehiclesPerUser: body.maxVehiclesPerUser,
    capacity: body.capacity,
    vendorTypes: d.vendorTypes,
    shopEnabled: d.shopEnabled,
    publicAccess: d.publicAccess,
    externalTicketUrl: body.externalTicketUrl,
    admission: d.admission,
    criteria: body.criteria,
    registrationsOpenAt: body.registrationsOpenAt,
    previewHours: body.previewHours,
    highGradePriority: d.highGradePriority,
    highGradePreviewHours: body.highGradePreviewHours,
    highGradeMin: d.highGradeMin,
    rulesText: body.rulesText,
    instructions: body.instructions,
    entranceNote: body.entranceNote,
    zones: [],
    arrivals: d.arrivals ?? { exhibitors: null, public: null },
    posterSettings: d.poster ? { ...d.poster, photoUrl: null } : null,
    ...over,
  } as unknown as EventOrganizer;
}

const need = (over: Partial<EventNeedView> = {}): EventNeedView => ({
  id: "n1",
  trade: "food_truck",
  tradeLabel: "Food truck",
  quantity: 1,
  filled: 0,
  remaining: 1,
  power: "none",
  water: false,
  frontageM: null,
  installAt: null,
  notes: null,
  position: 0,
  ...over,
});

describe("réconciliation après un enregistrement", () => {
  it("reprend les métiers ajoutés par une mission (deux enregistrements de suite ne les retirent pas)", () => {
    const sent = filled({
      needs: [{ trade: "food_truck", quantity: "1", power: "none", water: false, frontageM: "", installTime: "" }],
    });
    // L'API ajoute le métier de la mission aux prestataires attendus (`ensureVendorType`).
    const server = serverDraft(savedEvent(sent, { vendorTypes: ["Food truck"] }), [need()]);
    const { draft, pristine } = reconcileDraft({ sent, current: sent, server });
    expect(draft.vendorTypes).toEqual(["Food truck"]);
    expect(draft.needs).toEqual([expect.objectContaining({ id: "n1", trade: "food_truck" })]);
    expect(sameDraft(draft, pristine)).toBe(true);
    // Deuxième enregistrement : le corps garde le métier, la mission inchangée ne part pas.
    expect(eventPayload(draft).vendorTypes).toEqual(["Food truck"]);
    expect(needChanges([need()], draft)).toEqual({ remove: [], update: [], create: [] });
  });

  it("garde les zones et missions refusées dans la saisie, sans les marquer enregistrées", () => {
    const sent = filled({
      zones: [
        { code: "a", name: "Allée A", capacity: "" },
        { code: "B", name: "Allée B", capacity: "" },
      ],
      needs: [
        { trade: "food_truck", quantity: "1", power: "none", water: false, frontageM: "", installTime: "" },
        { trade: "photographer", quantity: "1", power: "none", water: false, frontageM: "", installTime: "" },
      ],
    });
    // Zone B et mission 2 refusées (limite d'écritures) : seules A et la mission 1 existent côté serveur.
    const event = savedEvent(sent, {
      zones: [{ id: "z1", code: "A", name: "Allée A", capacity: null, position: 0 }] as EventOrganizer["zones"],
    });
    const refused = { ...noRefusals(), zones: [1], needs: [1] };
    const { draft, pristine } = reconcileDraft({ sent, current: sent, server: serverDraft(event, [need()]), refused });
    expect(draft.zones).toEqual([
      { id: "z1", code: "A", name: "Allée A", capacity: "" },
      { code: "B", name: "Allée B", capacity: "" },
    ]);
    expect(draft.needs?.map((n) => [n.id, n.trade])).toEqual([
      ["n1", "food_truck"],
      [undefined, "photographer"],
    ]);
    // Pas « enregistré » : la saisie diffère de ce que le serveur garde, donc elle reste à renvoyer.
    expect(sameDraft(draft, pristine)).toBe(false);
    expect(pristine.zones).toHaveLength(1);
    expect(refusalMessage(sent, refused)).toBe(
      "Brouillon enregistré, sauf la zone B, la mission 2 : la saisie est gardée, touche « Continuer » pour renvoyer.",
    );
  });

  it("garde la saisie tapée pendant l'envoi, et l'identifiant d'une ligne créée", () => {
    const sent = filled({ zones: [{ code: "A", name: "Allée", capacity: "" }] });
    const current = {
      ...sent,
      rulesText: "Tapé pendant l'envoi",
      zones: [{ code: "A", name: "Allée nord", capacity: "" }],
    };
    const event = savedEvent(sent, {
      zones: [{ id: "z9", code: "A", name: "Allée", capacity: null, position: 0 }] as EventOrganizer["zones"],
      lat: 42.5,
      lng: 3.1,
    });
    const { draft } = reconcileDraft({ sent, current, server: serverDraft(event, []) });
    expect(draft.rulesText).toBe("Tapé pendant l'envoi");
    expect(draft.zones).toEqual([{ id: "z9", code: "A", name: "Allée nord", capacity: "" }]);
    // Ce que le serveur a changé (géocodage) arrive dans la saisie.
    expect([draft.lat, draft.lng]).toEqual([42.5, 3.1]);
  });

  it("garde la récurrence, que le serveur ne connaît pas avant la création de la série", () => {
    const sent = withEventKind(filled(), "rec", NOW);
    const { draft, pristine } = reconcileDraft({ sent, current: sent, server: serverDraft(savedEvent(sent), []) });
    expect(draft.recurrence).toEqual(sent.recurrence);
    expect(sameDraft(draft, pristine)).toBe(true);
  });
});

describe("temps où rouvrir un brouillon", () => {
  it("jamais au-delà du temps atteint, ni de l'affiche tant qu'il n'y en a pas ; Publier exige l'affiche", () => {
    const left = filled();
    expect(eventResumeStep(left, true, null, eventWizardSteps.indexOf("arrivees"))).toBe("arrivees");
    expect(eventResumeStep(left, true)).toBe("affiche");
    expect(eventResumeStep({ ...left, poster: POSTER }, true, null, 7)).toBe("publier");
    expect(eventResumeStep({ ...left, addressLine: "" }, true, null, 6)).toBe("lieu");
    expect(eventResumeStep(left, true, "reglement", 2)).toBe("reglement");
    expect(eventPublishProblem(left)).toEqual({ step: "affiche", problem: "Choisis ton affiche avant de publier." });
    expect(eventPublishProblem({ ...left, poster: POSTER })).toBeNull();
    // Les réglages par défaut ne sont posés qu'en quittant le temps de l'affiche.
    expect(withDefaultPoster(left).poster).toEqual({ photoKey: null, style: "minimal", title: "Rasso du port" });
    expect(withDefaultPoster({ ...left, poster: { ...POSTER, style: "jdm" } }).poster?.style).toBe("jdm");
  });

  it("un index gardé sur l'ancien découpage (douze étapes) est ignoré", () => {
    expect(storedStepIndex(8, 3)).toBe(3);
    expect(storedStepIndex(undefined, 9)).toBeNull();
    expect(storedStepIndex(12, 3)).toBeNull();
    const memo = parseWizardMemo(serializeWizardMemo({ reached: 2, recurrence: { nth: 1, weekday: 0, count: 6 } }));
    expect(memo).toEqual({ reached: 2, recurrence: { nth: 1, weekday: 0, count: 6 } });
    expect(parseWizardMemo('{"v":1,"reached":9}')).toEqual({ reached: -1, recurrence: null });
    expect(parseWizardMemo("abîmé")).toBeNull();
  });
});

describe("type : retour à « Ponctuel »", () => {
  it("rend la date d'avant « Récurrent »", () => {
    const one = filled({ startsAt: "2026-11-12T19:00", endsAt: "2026-11-12T23:30" });
    const rec = withEventKind(one, "rec", NOW);
    expect(rec.startsAt).toBe("2026-11-01T19:00");
    const back = withEventKind(rec, "one", NOW);
    expect(back).toMatchObject({ startsAt: "2026-11-12T19:00", endsAt: "2026-11-12T23:30", recurrence: null });
    expect(withEventKind(rec, "rec", NOW)).toBe(rec);
  });
});

describe("missions sur plusieurs jours", () => {
  it("une installation le 2e jour reste le 2e jour, et une mission inchangée ne part pas", () => {
    const d = withMultiDay(filled({ startsAt: "2026-11-08T09:00", endsAt: "2026-11-08T18:00" }), true, NOW);
    const saved = need({ installAt: "2026-11-09T06:00:00.000Z" }); // 9 novembre, 7 h à Paris
    const event = { ...savedEvent(d), startsAt: "2026-11-08T08:00:00.000Z" } as EventOrganizer;
    const needs = needsFromSaved([saved], event.startsAt);
    expect(needs[0]).toMatchObject({ installTime: "07:00", installDay: 1 });
    const out = needChanges([saved], { ...d, needs });
    expect(out).toEqual({ remove: [], update: [], create: [] });
    // L'heure changée garde le jour.
    const moved = needChanges([saved], { ...d, needs: [{ ...needs[0]!, installTime: "08:00" }] });
    expect(moved.update[0]?.need.installAt).toBe("2026-11-09T07:00:00.000Z");
  });
});

describe("créneaux après un changement d'horaires", () => {
  it("le créneau des exposants hors des nouveaux horaires est retiré avant d'enregistrer", () => {
    const d = withArrivalSlot(filled({ startsAt: "2026-11-08T19:00", endsAt: "2026-11-08T23:30" }), "exhibitors", {
      from: "18:30",
      to: "19:15",
      strict: true,
      note: null,
    });
    // Horaires passés à 9 h – 13 h : le temps « Type » est valide, mais l'API refuserait le créneau de 18 h 30.
    const changed = { ...d, startsAt: "2026-11-08T09:00", endsAt: "2026-11-08T13:00" };
    expect(eventStepProblem("type", changed)).toBeNull();
    expect(eventArrivalsProblem(changed)).not.toBeNull();
    const { draft, cleared } = withArrivalsInHours(changed);
    expect(cleared).toEqual(["exhibitors"]);
    expect(draft.arrivals).toEqual({ exhibitors: null, public: null });
    expect(eventArrivalsProblem(draft)).toBeNull();
    expect(withArrivalsInHours(d).cleared).toEqual([]);
  });
});

describe("saisie de date en cours", () => {
  it("ne lève pas d'exception sur une date incomplète (nocturne qui passe minuit)", () => {
    const d = filled({ startsAt: "2026-11-08T22:00", endsAt: "2026-11-09T02:00" });
    expect(() => withSingleDate(d, { date: "2026-1" })).not.toThrow();
    expect(withSingleDate(d, { date: "2026-1" })).toMatchObject({ startsAt: "2026-1T22:00", endsAt: "2026-1T02:00" });
    expect(withSingleDate(d, { date: "2026-11-30" }).endsAt).toBe("2026-12-01T02:00");
    expect(() => withMultiDay(filled({ startsAt: "2026-1" }), true, NOW)).not.toThrow();
  });
});

describe("modèles de règlement", () => {
  it("demandent avant de remplacer un règlement saisi", () => {
    expect(rulesReplaceNeedsConfirm("", "Modèle")).toBe(false);
    expect(rulesReplaceNeedsConfirm(defaultEventRules, "Modèle")).toBe(false);
    expect(rulesReplaceNeedsConfirm("Modèle\n", "Modèle")).toBe(false);
    expect(rulesReplaceNeedsConfirm("Mon règlement", "Modèle")).toBe(true);
  });
});

describe("aperçus d'affiche", () => {
  it("garde les rendus déjà faits, libère les plus anciens", () => {
    const dropped: string[] = [];
    const cache = createPreviewCache<string>(2, (u) => dropped.push(u));
    const k = (style: string) => posterPreviewKey({ style, format: "post", photoKey: null });
    cache.set(k("neon"), "u1");
    cache.set(k("jdm"), "u2");
    expect(cache.get(k("neon"))).toBe("u1");
    cache.set(k("swiss"), "u3");
    expect(dropped).toEqual(["u2"]);
    expect(cache.get(k("jdm"))).toBeUndefined();
    expect(posterPreviewKey({ a: 1, b: 2 })).toBe(posterPreviewKey({ b: 2, a: 1 }));
  });
});

// Correctif 53c : une mission n'est supprimée que si la saisie la connaissait et que l'organisateur l'a retirée.
const row = (over: Partial<NeedDraft> = {}): NeedDraft => ({
  trade: "food_truck",
  quantity: "1",
  power: "none",
  water: false,
  frontageM: "",
  installTime: "",
  ...over,
});
const n2 = need({ id: "n2", trade: "photographer", position: 1 });

describe("missions chargées après l'ouverture (correctif 53c)", () => {
  it("rejoignent la saisie même si un autre champ a changé : l'enregistrement suivant ne les supprime pas", () => {
    const typed = { ...filled(), title: "Titre tapé avant le chargement" };
    const loaded = needsFromSaved([need(), n2], null);
    const merged = withLoadedNeeds(typed, loaded);
    expect(merged.title).toBe("Titre tapé avant le chargement");
    expect(merged.needs?.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(merged.knownNeedIds).toEqual(["n1", "n2"]);
    expect(needChanges([need(), n2], merged).remove).toEqual([]);
    // Appliquée deux fois, même résultat ; une ligne ajoutée entre-temps est gardée.
    const added = { ...typed, needs: [row({ trade: "barber" })] };
    const twice = withLoadedNeeds(withLoadedNeeds(added, loaded), loaded);
    expect(twice.needs?.map((n) => n.id ?? n.trade)).toEqual(["barber", "n1", "n2"]);
  });

  it("ne remplace pas une mission modifiée et pas encore enregistrée (rechargement sans démontage)", () => {
    const opened = withLoadedNeeds(filled(), needsFromSaved([need()], null));
    const edited = { ...opened, needs: [{ ...(opened.needs?.[0] as NeedDraft), quantity: "3" }] };
    const again = withLoadedNeeds(edited, needsFromSaved([need()], null));
    expect(again.needs?.[0]?.quantity).toBe("3");
    expect(needChanges([need()], again).update).toHaveLength(1);
  });
});

describe("saisie gardée restaurée (correctif 53c)", () => {
  it("une saisie gardée d'avant le correctif (missions vides, rien de connu) ne supprime rien", () => {
    const stored = { ...filled(), title: "Gardée", needs: [] };
    const restored = withLoadedNeeds(stored, needsFromSaved([need(), n2], null));
    expect(restored.title).toBe("Gardée");
    expect(restored.needs?.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(needChanges([need(), n2], restored).remove).toEqual([]);
  });

  it("une mission retirée dans la saisie gardée le reste ; une mission ajoutée ailleurs depuis revient", () => {
    // Gardée sur le téléphone : n1 connue, retirée par l'organisateur (pas encore synchronisé).
    const stored = { ...filled(), needs: [], knownNeedIds: ["n1"] };
    // Pendant ce temps, n2 a été ajoutée depuis le site.
    const restored = withLoadedNeeds(stored, needsFromSaved([need(), n2], null));
    expect(restored.needs?.map((n) => n.id)).toEqual(["n2"]);
    expect(needChanges([need(), n2], restored).remove).toEqual(["n1"]);
  });
});

describe("deux onglets (correctif 53c)", () => {
  it("la mission créée dans A n'est pas supprimée par les enregistrements de B", () => {
    // B a ouvert l'événement sans mission ; A en crée une (n2) ; B change le titre et enregistre.
    const opened = withLoadedNeeds(filled(), []);
    const sent = { ...opened, title: "Renommé par B" };
    const { draft } = reconcileDraft({ sent, current: sent, server: serverDraft(savedEvent(sent), [n2]) });
    expect(draft.needs?.map((n) => n.id)).toEqual(["n2"]);
    // Deuxième enregistrement de B : n2 n'est ni supprimée, ni recréée.
    expect(needChanges([n2], draft)).toMatchObject({ remove: [], create: [] });
  });

  it("une mission que B a retirée pendant l'enregistrement n'est pas ramenée", () => {
    const sent = withLoadedNeeds(filled(), needsFromSaved([need()], null));
    const current = { ...sent, needs: [] };
    const { draft } = reconcileDraft({ sent, current, server: serverDraft(savedEvent(sent), [need()]) });
    expect(draft.needs).toEqual([]);
    expect(needChanges([need()], draft).remove).toEqual(["n1"]);
  });
});

describe("clé de création (correctif 53c)", () => {
  it("chaque nouvelle mission reçoit une clé, une seule fois ; la création l'envoie", () => {
    let i = 0;
    const make = () => `00000000-0000-4000-8000-00000000000${++i}`;
    const d = { ...filled(), needs: [row(), row({ id: "n1" })] };
    const keyed = withNeedKeys(d, make);
    expect(keyed.needs?.[0]?.clientKey).toBe("00000000-0000-4000-8000-000000000001");
    expect(keyed.needs?.[1]?.clientKey).toBeUndefined();
    expect(withNeedKeys(keyed, make)).toBe(keyed);
    expect(needChanges([], keyed).create[0]?.clientKey).toBe("00000000-0000-4000-8000-000000000001");
    expect(newClientKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("modifiée pendant l'envoi puis relecture en panne : elle prend son identifiant par sa clé, rien n'est recréé", () => {
    const sent = { ...filled(), needs: [row({ clientKey: "k1" })] };
    const current = { ...sent, needs: [row({ clientKey: "k1", quantity: "2" })] };
    const writes = { ...noNeedWrites(), created: [{ position: 0, need: need({ id: "n7", clientKey: "k1" }) }] };
    const { savedNeeds, draft } = afterNeedWrites({ savedNeeds: [], sent, current, writes });
    expect(draft.needs?.[0]).toMatchObject({ id: "n7", quantity: "2" });
    const again = needChanges(savedNeeds, draft);
    expect(again).toMatchObject({ remove: [], create: [] });
    expect(again.update).toHaveLength(1);
  });

  it("réponse perdue (création dite refusée, mais sur le serveur) : la relecture la rattache par sa clé", () => {
    const sent = { ...filled(), needs: [row({ clientKey: "k1" })] };
    const server = serverDraft(savedEvent(sent), [need({ id: "n7", clientKey: "k1" })]);
    const refused = { ...noRefusals(), needs: [0] };
    const { draft } = reconcileDraft({ sent, current: sent, server, refused });
    expect(draft.needs?.map((n) => n.id)).toEqual(["n7"]);
    expect(needChanges([need({ id: "n7", clientKey: "k1" })], draft)).toMatchObject({ remove: [], create: [] });
  });
});

describe("panne après l'écriture des missions (correctif 53c)", () => {
  it("une mission créée prend son identifiant : le nouvel essai ne la recrée pas", () => {
    const sent = filled({ needs: [row()] });
    expect(needChanges([], sent).create).toHaveLength(1);
    const writes = { ...noNeedWrites(), created: [{ position: 0, need: need({ id: "n7" }) }] };
    const { savedNeeds, draft } = afterNeedWrites({ savedNeeds: [], sent, current: sent, writes });
    expect(draft.needs?.[0]?.id).toBe("n7");
    expect(needChanges(savedNeeds, draft)).toMatchObject({ remove: [], create: [] });
  });

  it("une mission supprimée n'est pas supprimée deux fois ; la saisie tapée pendant l'envoi est gardée", () => {
    const sent = filled({ needs: [], knownNeedIds: ["n1"] });
    const current = { ...sent, title: "Changé pendant l'envoi" };
    const writes = { ...noNeedWrites(), removed: ["n1"] };
    const { savedNeeds, draft } = afterNeedWrites({ savedNeeds: [need()], sent, current, writes });
    expect(savedNeeds).toEqual([]);
    expect(draft.title).toBe("Changé pendant l'envoi");
    expect(needChanges(savedNeeds, draft).remove).toEqual([]);
  });
});
