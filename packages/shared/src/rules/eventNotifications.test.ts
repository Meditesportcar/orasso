// Lot R8n1 : les trois niveaux de notification d'un événement. La liste de l'Essentiel est FERMÉE : un test la fige.
import { describe, expect, it } from "vitest";

import { notificationTypes } from "../enums";
import { eventNotifyLabels } from "../labels/eventNotifications.fr";
import {
  applicationDecisionTypes,
  deliversNotification,
  essentialNeedsPlace,
  essentialNotificationTypes,
  notificationLevel,
} from "./eventNotifications";
import { mutableTypesByFamily } from "./notifications";

describe("liste de l'Essentiel", () => {
  it("est exactement celle de la décision (y ajouter un type casse ce test)", () => {
    expect([...essentialNotificationTypes].sort()).toEqual(
      [
        "event_updated",
        "schedule_change",
        "event_cancelled",
        "event_outlook_changed",
        "event_reminder_eve",
        "event_instructions",
        "event_important",
        "application_accepted",
        "application_waitlisted",
        "application_refused",
        "offer_received",
      ].sort(),
    );
  });

  it("ne contient que des types déclarés, sans doublon", () => {
    for (const t of essentialNotificationTypes) expect(t in notificationTypes).toBe(true);
    expect(new Set(essentialNotificationTypes).size).toBe(essentialNotificationTypes.length);
  });

  it("un type hors liste n'est jamais Essentiel", () => {
    const outside = Object.keys(notificationTypes).filter(
      (t) => !(essentialNotificationTypes as readonly string[]).includes(t),
    );
    expect(outside.length).toBeGreaterThan(50);
    for (const t of outside) expect(notificationLevel(t)).not.toBe("essential");
    for (const t of ["event_announcement", "event_reminder_week", "new_event_followed", "feed_post_mention"]) {
      expect(notificationLevel(t)).toBe("other");
    }
    expect(notificationLevel("type_inconnu")).toBe("other");
  });

  it("le résumé est le niveau Nouveautés", () => {
    expect(notificationLevel("event_news_digest")).toBe("news");
    for (const t of essentialNotificationTypes) expect(notificationLevel(t)).toBe("essential");
  });

  it("ne se propose plus type par type dans les réglages", () => {
    const proposed = Object.values(mutableTypesByFamily()).flat();
    for (const t of essentialNotificationTypes) expect(proposed).not.toContain(t);
    expect(proposed).toContain("event_announcement");
    expect(proposed).toContain("event_news_digest");
    expect(mutableTypesByFamily().application).toContain("offer_expired");
  });
});

describe("deliversNotification", () => {
  const base = { prefs: { event: false, application: false }, mutedTypes: ["event_updated"], hasEventId: true };

  it("l'Essentiel passe malgré la famille et le type coupés, avec une place", () => {
    expect(deliversNotification({ ...base, type: "event_updated", hasPlace: true })).toBe(true);
    expect(deliversNotification({ ...base, type: "event_important", hasPlace: true })).toBe(true);
  });

  it("sans place, la règle ordinaire s'applique (coupé : pas livré ; non coupé : livré)", () => {
    expect(deliversNotification({ ...base, type: "event_updated", hasPlace: false })).toBe(false);
    expect(
      deliversNotification({ prefs: {}, mutedTypes: [], type: "event_updated", hasEventId: true, hasPlace: false }),
    ).toBe(true);
  });

  it("sans événement rattaché, l'Essentiel suit la règle ordinaire", () => {
    expect(deliversNotification({ ...base, type: "event_updated", hasEventId: false, hasPlace: true })).toBe(false);
  });

  it("les décisions sur la candidature passent sans condition de place", () => {
    for (const type of applicationDecisionTypes) {
      expect(deliversNotification({ ...base, type, hasPlace: false })).toBe(true);
      expect(essentialNeedsPlace(type, true)).toBe(false);
    }
  });

  it("le reste suit shouldDeliver, inchangé", () => {
    expect(deliversNotification({ ...base, type: "event_announcement", hasPlace: true })).toBe(false);
    expect(
      deliversNotification({
        prefs: { event: false },
        mutedTypes: [],
        type: "new_event_followed",
        hasEventId: true,
        hasPlace: true,
      }),
    ).toBe(false);
    expect(
      deliversNotification({
        prefs: {},
        mutedTypes: ["event_news_digest"],
        type: "event_news_digest",
        hasEventId: false,
        hasPlace: true,
      }),
    ).toBe(false);
    expect(
      deliversNotification({ prefs: {}, mutedTypes: [], type: "staff_alert", hasEventId: false, hasPlace: false }),
    ).toBe(true);
  });

  it("la place ne se lit que pour l'Essentiel rattaché à un événement, hors décisions", () => {
    expect(essentialNeedsPlace("event_updated", true)).toBe(true);
    expect(essentialNeedsPlace("event_updated", false)).toBe(false);
    expect(essentialNeedsPlace("event_announcement", true)).toBe(false);
    expect(essentialNeedsPlace("event_news_digest", true)).toBe(false);
  });
});

describe("textes du résumé", () => {
  it("singulier et pluriel du titre", () => {
    expect(eventNotifyLabels.digestTitle(1)).toBe("1 nouveauté pour tes sorties");
    expect(eventNotifyLabels.digestTitle(3)).toBe("3 nouveautés pour tes sorties");
  });
  it("corps : trois titres au plus, puis « et N autres »", () => {
    expect(eventNotifyLabels.digestBody(["A", "B"])).toBe("A, B");
    expect(eventNotifyLabels.digestBody(["A", "B", "C"])).toBe("A, B, C");
    expect(eventNotifyLabels.digestBody(["A", "B", "C", "D"])).toBe("A, B, C et 1 autre");
    expect(eventNotifyLabels.digestBody(["A", "B", "C", "D", "E"])).toBe("A, B, C et 2 autres");
  });
});
