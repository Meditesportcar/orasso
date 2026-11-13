import { describe, expect, it } from "vitest";

import { authorKeyOf, parseAuthorKey, parseMentionTargetKey } from "./authors";
import {
  type AttachFacts,
  attachPhase,
  deduceEventRole,
  displayRole,
  importantLeft,
  importantWindow,
  withinAttachWindow,
} from "./feedAttach";

const DAY = 86_400_000;
const NOW = new Date("2026-11-11T10:00:00Z");
const none: AttachFacts = {
  ownsEvent: false,
  pageAccepted: false,
  vehicleActive: false,
  ticketValid: false,
  presenceValidated: false,
};
const ev = (startOffsetH: number, lenH = 4, status = "published") => ({
  status,
  startsAt: new Date(NOW.getTime() + startOffsetH * 3_600_000),
  endsAt: new Date(NOW.getTime() + (startOffsetH + lenH) * 3_600_000),
});
const endedDaysAgo = (days: number, status = "published") => {
  const endsAt = new Date(NOW.getTime() - days * DAY);
  return { status, startsAt: new Date(endsAt.getTime() - 4 * 3_600_000), endsAt };
};

describe("clés d'auteur", () => {
  const uuid = "0b0c3a5e-6a47-4f0c-9c1e-2a1d1c0b0a01";
  it("écrit et relit chaque sorte", () => {
    for (const kind of ["structure", "pro", "provider", "media"] as const) {
      const key = authorKeyOf(kind, uuid);
      expect(parseAuthorKey(key)).toEqual({ kind, id: uuid, key });
    }
    expect(parseAuthorKey("u:Kenji_66")).toEqual({ kind: "user", id: "Kenji_66", key: "u:Kenji_66" });
  });
  it("les clés u: s: p: sont celles des stories", () => {
    expect(authorKeyOf("user", "abc")).toBe("u:abc");
    expect(authorKeyOf("structure", uuid)).toBe(`s:${uuid}`);
    expect(authorKeyOf("pro", uuid)).toBe(`p:${uuid}`);
  });
  it("un UUID est ramené en minuscules, une clé mal formée est refusée", () => {
    expect(parseAuthorKey(`s:${uuid.toUpperCase()}`)?.key).toBe(`s:${uuid}`);
    expect(parseAuthorKey("s:pas-un-uuid")).toBeNull();
    expect(parseAuthorKey("x:abc")).toBeNull();
    expect(parseAuthorKey("u:")).toBeNull();
    expect(parseAuthorKey(42)).toBeNull();
  });
  it("e: n'est pas un auteur mais une cible de mention", () => {
    expect(parseAuthorKey(`e:${uuid}`)).toBeNull();
    expect(parseMentionTargetKey(`e:${uuid}`)).toEqual({ kind: "event", id: uuid, key: `e:${uuid}` });
  });
});

describe("phase et fenêtre", () => {
  it("avant, pendant, après", () => {
    expect(attachPhase(ev(2), NOW)).toBe("before");
    expect(attachPhase(ev(-1), NOW)).toBe("running");
    expect(attachPhase(ev(-4), NOW)).toBe("after");
    expect(attachPhase(ev(-5), NOW)).toBe("after");
  });
  it("fini depuis 30 jours au plus : la borne est comprise", () => {
    expect(withinAttachWindow(endedDaysAgo(30), NOW)).toBe(true);
    expect(withinAttachWindow({ endsAt: new Date(NOW.getTime() - 30 * DAY - 1) }, NOW)).toBe(false);
    expect(withinAttachWindow(ev(5), NOW)).toBe(true);
  });
});

describe("rôle déduit", () => {
  it("organisateur : événement de sa structure, publié ou annulé, dans la fenêtre", () => {
    const f = { ...none, ownsEvent: true };
    expect(deduceEventRole("organizer", ev(24), f, NOW)).toBe("organizer");
    expect(deduceEventRole("organizer", ev(-1), f, NOW)).toBe("organizer");
    expect(deduceEventRole("organizer", endedDaysAgo(30), f, NOW)).toBe("organizer");
    expect(deduceEventRole("organizer", endedDaysAgo(31), f, NOW)).toBeNull();
    expect(deduceEventRole("organizer", ev(24, 4, "cancelled"), f, NOW)).toBe("organizer");
    expect(deduceEventRole("organizer", ev(24, 4, "draft"), f, NOW)).toBeNull();
    expect(deduceEventRole("organizer", ev(24), none, NOW)).toBeNull();
  });
  it("prestataire, média : candidature retenue, même fenêtre", () => {
    const f = { ...none, pageAccepted: true };
    for (const persona of ["provider", "media"] as const) {
      expect(deduceEventRole(persona, ev(24), f, NOW)).toBe("on_site");
      expect(deduceEventRole(persona, endedDaysAgo(30), f, NOW)).toBe("on_site");
      expect(deduceEventRole(persona, endedDaysAgo(31), f, NOW)).toBeNull();
      expect(deduceEventRole(persona, ev(24), none, NOW)).toBeNull();
    }
  });
  it("fiche pro : aucun rattachement", () => {
    expect(deduceEventRole("pro", ev(24), { ...none, ownsEvent: true, pageAccepted: true }, NOW)).toBeNull();
  });
  it("passionné : candidature acceptée ou en attente, ou billet valable, avant ou pendant", () => {
    expect(deduceEventRole("fan", ev(24), { ...none, vehicleActive: true }, NOW)).toBe("attendee");
    expect(deduceEventRole("fan", ev(-1), { ...none, ticketValid: true }, NOW)).toBe("attendee");
    expect(deduceEventRole("fan", ev(24), none, NOW)).toBeNull();
    expect(deduceEventRole("fan", ev(24, 4, "cancelled"), { ...none, vehicleActive: true }, NOW)).toBeNull();
  });
  it("passionné après la fin : présence validée seulement, 30 jours au plus", () => {
    const ok = { ...none, vehicleActive: true, ticketValid: true, presenceValidated: true };
    expect(deduceEventRole("fan", endedDaysAgo(1), ok, NOW)).toBe("attendee");
    expect(deduceEventRole("fan", endedDaysAgo(30), ok, NOW)).toBe("attendee");
    expect(deduceEventRole("fan", endedDaysAgo(31), ok, NOW)).toBeNull();
    expect(deduceEventRole("fan", endedDaysAgo(1), { ...ok, presenceValidated: false }, NOW)).toBeNull();
  });
  it("après la fin, un passionné sans présence validée n'a plus de verbe", () => {
    expect(displayRole("attendee", "after", false)).toBeNull();
    expect(displayRole("attendee", "after", true)).toBe("attendee");
    expect(displayRole("attendee", "before", false)).toBe("attendee");
    expect(displayRole("organizer", "after", false)).toBe("organizer");
    expect(displayRole("on_site", "after", false)).toBe("on_site");
    expect(displayRole(null, "before", false)).toBeNull();
  });
});

describe("jour et semaine civils de Paris", () => {
  it("minuit à Paris, pas à Greenwich (heure d'hiver)", () => {
    const w = importantWindow(new Date("2026-11-11T23:30:00Z")); // 00 h 30 le 12 à Paris
    expect(w.dayStart.toISOString()).toBe("2026-11-11T23:00:00.000Z");
    expect(w.dayEnd.toISOString()).toBe("2026-11-12T23:00:00.000Z");
    const before = importantWindow(new Date("2026-11-11T22:59:59Z")); // 23 h 59 le 11 à Paris
    expect(before.dayStart.toISOString()).toBe("2026-11-10T23:00:00.000Z");
  });
  it("la semaine commence le lundi", () => {
    // Mercredi 11 novembre 2026 : lundi 9, prochain lundi 16.
    const w = importantWindow(new Date("2026-11-11T10:00:00Z"));
    expect(w.weekStart.toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(w.weekEnd.toISOString()).toBe("2026-11-15T23:00:00.000Z");
    // Dimanche 15 à 23 h 30 (Paris) : encore la semaine du 9 ; lundi 16 à 0 h 30 : la suivante.
    expect(importantWindow(new Date("2026-11-15T22:30:00Z")).weekStart.toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(importantWindow(new Date("2026-11-15T23:30:00Z")).weekStart.toISOString()).toBe("2026-11-15T23:00:00.000Z");
  });
  it("changement d'heure : la semaine du 26 octobre 2026 (retour à l'heure d'hiver le dimanche 25)", () => {
    const w = importantWindow(new Date("2026-10-27T10:00:00Z"));
    expect(w.weekStart.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    // Le dimanche 25 octobre dure 25 heures.
    const sunday = importantWindow(new Date("2026-10-25T12:00:00Z"));
    expect(sunday.dayStart.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(sunday.dayEnd.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(sunday.weekStart.toISOString()).toBe("2026-10-18T22:00:00.000Z");
  });
  it("changement d'heure du printemps : le dimanche 29 mars 2026 dure 23 heures", () => {
    const d = importantWindow(new Date("2026-03-29T12:00:00Z"));
    expect(d.dayStart.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(d.dayEnd.toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });
  it("ce qu'il reste : une par jour, trois par semaine", () => {
    expect(importantLeft(0, 0)).toEqual({ leftToday: 1, leftWeek: 3 });
    expect(importantLeft(1, 1)).toEqual({ leftToday: 0, leftWeek: 2 });
    expect(importantLeft(0, 2)).toEqual({ leftToday: 1, leftWeek: 1 });
    expect(importantLeft(0, 3)).toEqual({ leftToday: 0, leftWeek: 0 });
    expect(importantLeft(5, 9)).toEqual({ leftToday: 0, leftWeek: 0 });
  });
});
