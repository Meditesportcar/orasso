import { describe, expect, it } from "vitest";

import { journalOnlyNotificationTypes, notificationTypes, pushOnlyNotificationTypes } from "../enums";
import { notificationTypeLabels } from "../labels/notifications.fr";
import { r7DefaultContent, r7NotificationTable, r7QuietOverride } from "../notifications/r7";
import { mutableTypesByFamily, shouldDeliver } from "./notifications";

describe("types de notification de la vague R7 (lot R7c1)", () => {
  const r7 = Object.keys(r7NotificationTable) as (keyof typeof r7NotificationTable)[];

  it("tous déclarés : famille, libellé, textes par défaut", () => {
    expect(r7).toHaveLength(17);
    for (const type of r7) {
      expect(notificationTypes[type], type).toBe(r7NotificationTable[type].family);
      expect(notificationTypeLabels[type], type).toBeTruthy();
      expect(r7DefaultContent(type, "Kenji_66").title, type).toBeTruthy();
      expect(r7DefaultContent(type, "Kenji_66").body, type).not.toContain("{name}");
    }
    expect(r7DefaultContent("story_like", "Kenji_66").title).toBe("Kenji_66 a aimé ta story");
  });

  it("familles de la fiche", () => {
    expect(notificationTypes.schedule_change).toBe("event");
    expect(notificationTypes.story_like).toBe("social");
    expect(notificationTypes.story_published).toBe("social");
    expect(notificationTypes.vote_opened).toBe("event");
    expect(notificationTypes.vote_won).toBe("event");
    expect(notificationTypes.vote_podium).toBe("event");
    expect(notificationTypes.presence_validated).toBe("event");
    expect(notificationTypes.memory).toBe("social");
    expect(notificationTypes.spot_meetup_new).toBe("social");
  });

  it("Journal seul : ni push ni e-mail", () => {
    for (const t of [
      "story_like",
      "story_published",
      "partner_mention",
      "partnership_accepted",
      "partnership_declined",
      "partnership_ended",
      "vote_podium",
      "spot_meetup_reply",
      "presence_validated",
    ]) {
      expect(journalOnlyNotificationTypes, t).toContain(t);
    }
  });

  it("push : sans e-mail de repli, sauf l'horaire modifié et le vote gagné", () => {
    for (const t of [
      "story_mention",
      "story_shared_by_organizer",
      "partnership_proposed",
      "vote_opened",
      "memory",
      "spot_meetup_new",
    ]) {
      expect(journalOnlyNotificationTypes, t).not.toContain(t);
      expect(pushOnlyNotificationTypes, t).toContain(t);
    }
    for (const t of ["schedule_change", "vote_won"]) {
      expect(journalOnlyNotificationTypes, t).not.toContain(t);
      expect(pushOnlyNotificationTypes, t).not.toContain(t);
    }
  });

  it("heures calmes levées pour l'horaire modifié, le rendez-vous proche et le vote lancé (tour 2 de R7l1) seulement", () => {
    expect(r7QuietOverride("schedule_change")).toEqual({ days: 1 });
    expect(r7QuietOverride("spot_meetup_new")).toEqual({ within: 2 * 3_600_000 });
    expect(r7QuietOverride("vote_opened")).toEqual({ within: 7 * 24 * 3_600_000 });
    expect(r7QuietOverride("event_updated")).toBeUndefined();
  });

  it("« vote lancé » se coupe seul dans les réglages, avec son libellé", () => {
    expect(mutableTypesByFamily().event).toContain("vote_opened");
    expect(notificationTypeLabels.vote_opened).toBe("Un vote s'ouvre à l'événement");
    expect(shouldDeliver({ event: true }, ["vote_opened"], "vote_opened")).toBe(false);
    expect(shouldDeliver({ event: true }, ["vote_opened"], "vote_won")).toBe(true);
    expect(shouldDeliver({ event: false }, [], "vote_opened")).toBe(false);
  });
});
