// Lot R8n2 : règles d'écran des notifications d'un événement (maquette R8.11). `now` toujours passé.
import { describe, expect, it } from "vitest";

import { initialEventDraft } from "../eventWizard";
import { eventNotifyLabels } from "../labels/eventNotifications.fr";
import {
  type NotifyFields,
  notifyChanged,
  notifyFieldsOfDraft,
  notifySavedCode,
  notifySavedMessage,
  notifyStart,
  notifyTiming,
  notifyTimingLine,
  settingsEventRows,
} from "./eventNotifyScreen";

// Novembre : Paris est à UTC+1.
const paris = (hhmm: string, day = "2026-11-10") => new Date(`${day}T${hhmm}:00+01:00`);
const HOUR = 3_600_000;

describe("notifyTiming : le moment de l'envoi", () => {
  const far = paris("12:00", "2026-11-20");
  it("dans la journée, tout de suite (21 h 59 et 8 h pile)", () => {
    expect(notifyTiming({ now: paris("21:59"), startsAt: far })).toBe("now");
    expect(notifyTiming({ now: paris("08:00"), startsAt: far })).toBe("now");
    expect(notifyTiming({ now: paris("14:30"), startsAt: far })).toBe("now");
  });
  it("la nuit, à 8 h quand l'événement est loin (22 h pile et 7 h 59)", () => {
    expect(notifyTiming({ now: paris("22:00"), startsAt: far })).toBe("at_8");
    expect(notifyTiming({ now: paris("07:59"), startsAt: far })).toBe("at_8");
    expect(notifyTiming({ now: paris("03:00"), startsAt: far })).toBe("at_8");
  });
  it("la nuit, tout de suite si l'événement commence dans moins de 12 h (11 h 59 oui, 12 h 01 non)", () => {
    const now = paris("23:00");
    expect(notifyTiming({ now, startsAt: new Date(now.getTime() + 11 * HOUR + 59 * 60_000) })).toBe("now");
    expect(notifyTiming({ now, startsAt: new Date(now.getTime() + 12 * HOUR + 60_000) })).toBe("at_8");
  });
  it("la nuit, un événement déjà commencé est prévenu tout de suite", () => {
    expect(notifyTiming({ now: paris("02:00"), startsAt: paris("20:00", "2026-11-09") })).toBe("now");
  });
  it("un changement d'heure : le plus tôt des deux débuts décide", () => {
    const now = paris("23:00");
    const soon = new Date(now.getTime() + 6 * HOUR);
    const later = new Date(now.getTime() + 30 * HOUR);
    // Avancé de 30 h à 6 h, ou repoussé de 6 h à 30 h : dans les deux cas l'ancien départ proche compte.
    expect(notifyTiming({ now, startsAt: notifyStart(later, soon) })).toBe("now");
    expect(notifyTiming({ now, startsAt: notifyStart(soon, later) })).toBe("now");
    expect(notifyTiming({ now, startsAt: notifyStart(later, new Date(later.getTime() + HOUR)) })).toBe("at_8");
  });
  it("un début illisible : la nuit, 8 h", () => {
    expect(notifyTiming({ now: paris("23:00"), startsAt: null })).toBe("at_8");
    expect(notifyStart(null, null)).toBeNull();
  });
});

describe("notifyTimingLine : ce que l'écran dit", () => {
  it("rien de plus dans la journée", () => {
    expect(notifyTimingLine("now", { now: paris("15:00") })).toBeNull();
  });
  it("la nuit : 8 h, ou tout de suite même la nuit", () => {
    expect(notifyTimingLine("at_8", { now: paris("23:00") })).toBe(eventNotifyLabels.timingLate);
    expect(notifyTimingLine("now", { now: paris("23:00") })).toBe(eventNotifyLabels.timingUrgentNight);
  });
});

describe("notifyChanged : le changement prévient-il les inscrits ?", () => {
  const base: NotifyFields = {
    startsAt: "2026-11-20T18:00:00.000Z",
    endsAt: "2026-11-20T22:00:00.000Z",
    addressLine: "Port de Canet",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    lat: 42.7,
    lng: 3.03,
  };
  it("la date ou l'heure de début", () => {
    expect(notifyChanged(base, { ...base, startsAt: "2026-11-21T18:00:00.000Z" })).toBe(true);
    expect(notifyChanged(base, { ...base, startsAt: "2026-11-20T17:00:00.000Z" })).toBe(true);
  });
  it("l'heure de fin", () => {
    expect(notifyChanged(base, { ...base, endsAt: "2026-11-20T23:00:00.000Z" })).toBe(true);
  });
  it("l'adresse, la ville, le code postal ou la position", () => {
    expect(notifyChanged(base, { ...base, addressLine: "Quai Sud" })).toBe(true);
    expect(notifyChanged(base, { ...base, city: "Perpignan" })).toBe(true);
    expect(notifyChanged(base, { ...base, postalCode: "66000" })).toBe(true);
    expect(notifyChanged(base, { ...base, lat: 42.8 })).toBe(true);
  });
  it("le titre seul, ou rien du tout : non", () => {
    expect(notifyChanged(base, { ...base })).toBe(false);
    // Le même instant écrit autrement, des espaces autour d'une adresse, une adresse vide ou absente : aucun changement.
    expect(notifyChanged(base, { ...base, startsAt: new Date("2026-11-20T18:00:00.000Z") })).toBe(false);
    expect(notifyChanged(base, { ...base, addressLine: "  Port de Canet " })).toBe(false);
    expect(notifyChanged({ ...base, addressLine: "" }, { ...base, addressLine: null })).toBe(false);
  });
});

describe("settingsEventRows : les deux lignes de la famille « Événements »", () => {
  it("l'Essentiel est verrouillé, quoi qu'il arrive", () => {
    expect(settingsEventRows({ event: true, eventNews: true }).essential).toEqual({ locked: true });
    expect(settingsEventRows({ event: false, eventNews: false }).essential).toEqual({ locked: true });
  });
  it("`eventNews` absent (compte d'avant la vague) : activé", () => {
    expect(settingsEventRows({ event: true }).news).toEqual({ on: true, disabled: false, reason: null });
    expect(settingsEventRows(undefined).news.on).toBe(true);
  });
  it("Nouveautés coupée : lue coupée", () => {
    expect(settingsEventRows({ event: true, eventNews: false }).news.on).toBe(false);
  });
  it("famille coupée : la seconde ligne est grisée, avec sa raison ; la première reste « toujours actif »", () => {
    const rows = settingsEventRows({ event: false, eventNews: true });
    expect(rows.news.disabled).toBe(true);
    expect(rows.news.reason).toBe(eventNotifyLabels.newsFamilyOff);
    expect(rows.essential.locked).toBe(true);
  });
});

describe("l'assistant de l'organisateur : champs lus et message de retour", () => {
  const draft = initialEventDraft(new Date("2026-11-10T10:00:00+01:00"));
  it("changer le titre ou la description ne prévient personne ; l'heure, si", () => {
    const before = notifyFieldsOfDraft(draft);
    expect(notifyChanged(before, notifyFieldsOfDraft({ ...draft, title: "Autre titre", description: "x" }))).toBe(
      false,
    );
    expect(notifyChanged(before, notifyFieldsOfDraft({ ...draft, startsAt: "2026-12-01T18:00" }))).toBe(true);
    expect(notifyChanged(before, notifyFieldsOfDraft({ ...draft, endsAt: "2026-12-01T23:00" }))).toBe(true);
    expect(notifyChanged(before, notifyFieldsOfDraft({ ...draft, city: "Elne" }))).toBe(true);
  });
  it("le code de retour se relit en message (inscrits prévenus, 8 h, nombre inconnu, illisible)", () => {
    expect(notifySavedMessage(notifySavedCode(148, "now"))).toBe("Enregistré : 148 inscrits prévenus");
    expect(notifySavedMessage(notifySavedCode(1, "now"))).toBe("Enregistré : 1 inscrit prévenu");
    expect(notifySavedMessage(notifySavedCode(148, "at_8"))).toBe("Enregistré : 148 inscrits seront prévenus à 8 h");
    expect(notifySavedMessage(notifySavedCode(null, "now"))).toBe(eventNotifyLabels.savedNotifiedFallback);
    expect(notifySavedMessage(notifySavedCode(null, "at_8"))).toBe(eventNotifyLabels.savedNotifiedFallbackAt8);
    expect(notifySavedMessage("<script>")).toBeNull();
    expect(notifySavedMessage(null)).toBeNull();
  });
});

describe("passage à l'heure d'été et d'hiver (Paris)", () => {
  const far = new Date("2026-12-31T12:00:00+01:00");
  it("29 mars 2026 (été, UTC+2) : nuit à 22 h, jour à 8 h", () => {
    expect(notifyTiming({ now: new Date("2026-03-29T21:59:00+02:00"), startsAt: far })).toBe("now");
    expect(notifyTiming({ now: new Date("2026-03-29T22:00:00+02:00"), startsAt: far })).toBe("at_8");
    expect(notifyTiming({ now: new Date("2026-03-29T07:59:00+02:00"), startsAt: far })).toBe("at_8");
    expect(notifyTiming({ now: new Date("2026-03-29T08:00:00+02:00"), startsAt: far })).toBe("now");
    // La veille (hiver, UTC+1) : 22 h reste la nuit.
    expect(notifyTiming({ now: new Date("2026-03-28T22:00:00+01:00"), startsAt: far })).toBe("at_8");
    expect(notifyTiming({ now: new Date("2026-03-28T21:59:00+01:00"), startsAt: far })).toBe("now");
  });
  it("25 octobre 2026 (hiver, UTC+1) : nuit à 22 h, jour à 8 h ; la veille en été", () => {
    expect(notifyTiming({ now: new Date("2026-10-25T21:59:00+01:00"), startsAt: far })).toBe("now");
    expect(notifyTiming({ now: new Date("2026-10-25T22:00:00+01:00"), startsAt: far })).toBe("at_8");
    expect(notifyTiming({ now: new Date("2026-10-25T07:59:00+01:00"), startsAt: far })).toBe("at_8");
    expect(notifyTiming({ now: new Date("2026-10-25T08:00:00+01:00"), startsAt: far })).toBe("now");
    expect(notifyTiming({ now: new Date("2026-10-24T22:00:00+02:00"), startsAt: far })).toBe("at_8");
  });
  it("la limite de 12 h se compte en durée réelle à travers le changement d'heure", () => {
    const now = new Date("2026-03-28T23:00:00+01:00");
    // 12 h plus tard en durée réelle : 12 h 00 pile (déjà en été).
    expect(notifyTiming({ now, startsAt: new Date(now.getTime() + 12 * HOUR) })).toBe("now");
    expect(notifyTiming({ now, startsAt: new Date(now.getTime() + 12 * HOUR + 60_000) })).toBe("at_8");
  });
});

describe("l'assistant : tous les changements de jours que l'API annonce (setDays)", () => {
  const base = initialEventDraft(new Date("2026-11-10T10:00:00+01:00"));
  const multi = (days: { date: string; startTime: string; endTime: string; capacity: string }[]) => ({
    ...base,
    multiDay: true,
    days,
  });
  const d = (date: string, startTime = "10:00", endTime = "18:00", capacity = "") => ({
    date,
    startTime,
    endTime,
    capacity,
  });
  const d1 = d("2027-01-09");
  const d3 = d("2027-01-11");
  const three = [d1, d("2027-01-10"), d3];
  const before = notifyFieldsOfDraft(multi(three));
  it("l'heure du jour du milieu change : annoncé", () => {
    expect(notifyChanged(before, notifyFieldsOfDraft(multi([d1, d("2027-01-10", "11:00"), d3])))).toBe(true);
    expect(notifyChanged(before, notifyFieldsOfDraft(multi([d1, d("2027-01-10", "10:00", "19:00"), d3])))).toBe(true);
  });
  it("un jour ajouté ou retiré : annoncé", () => {
    expect(notifyChanged(before, notifyFieldsOfDraft(multi([...three, d("2027-01-12")])))).toBe(true);
    expect(notifyChanged(before, notifyFieldsOfDraft(multi([d1, d3])))).toBe(true);
  });
  it("une date de jour déplacée : annoncé ; la capacité seule, le titre seul : rien", () => {
    expect(notifyChanged(before, notifyFieldsOfDraft(multi([d1, d("2027-01-13"), d3])))).toBe(true);
    expect(notifyChanged(before, notifyFieldsOfDraft(multi([d1, d("2027-01-10", "10:00", "18:00", "30"), d3])))).toBe(
      false,
    );
    expect(notifyChanged(before, notifyFieldsOfDraft({ ...multi(three), title: "Autre" }))).toBe(false);
  });
  it("passer de plusieurs jours à un seul créneau : annoncé", () => {
    expect(notifyChanged(before, notifyFieldsOfDraft({ ...multi(three), multiDay: false }))).toBe(true);
  });
});

describe("Nouveautés de mes sorties : le résumé coupé par type se lit coupé", () => {
  it("event_news_digest dans les types coupés : la ligne est coupée", () => {
    expect(settingsEventRows({ event: true, eventNews: true }, ["event_news_digest"]).news.on).toBe(false);
    expect(settingsEventRows({ event: true, eventNews: true }, ["event_announcement"]).news.on).toBe(true);
    expect(settingsEventRows({ event: true, eventNews: false }, []).news.on).toBe(false);
  });
});
