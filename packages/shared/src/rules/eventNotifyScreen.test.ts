// Lot R8n2 : règles d'écran des notifications d'un événement (maquette R8.11). `now` toujours passé.
import { describe, expect, it } from "vitest";

import { eventNotifyLabels } from "../labels/eventNotifications.fr";
import {
  type NotifyFields,
  notifyChanged,
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
