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

  it("tour 2 : un prestataire retenu est annoncé ; une notification non livrée ne l'est jamais", () => {
    expect(notificationAnnounced("application_accepted", { screen: "provider_applications" })).toBe(true);
    expect(notificationAnnounced("offer_received", { delivered: false })).toBe(false);
    expect(notificationAnnounced("message_received", { delivered: true })).toBe(true);
  });
});
