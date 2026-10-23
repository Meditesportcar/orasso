import { describe, expect, it } from "vitest";

import { announceToneOf, notificationAnnounced } from "./announcements";

describe("bandeau d'annonce unique (lot M6)", () => {
  it("moutarde pour une bonne nouvelle, sobre pour une information", () => {
    expect(announceToneOf("offer_received")).toBe("good");
    expect(announceToneOf("certification_accepted")).toBe("good");
    expect(announceToneOf("message_received")).toBe("info");
    expect(announceToneOf("application_refused")).toBe("info");
  });

  it("« Retenue » est annoncée par l'appli elle-même ; l'actualité du Journal n'a pas de bandeau", () => {
    expect(notificationAnnounced("application_accepted")).toBe(false);
    expect(notificationAnnounced("message_received")).toBe(true);
    expect(notificationAnnounced("offer_received")).toBe(true);
  });
});
