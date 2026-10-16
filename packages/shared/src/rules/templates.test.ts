import { describe, expect, it } from "vitest";

import {
  FOLLOWER_QUOTA_WINDOW_MS,
  followerQuotaRemaining,
  followerQuotaResetsAt,
  renderTemplate,
  segmentNeedsEvent,
  segmentReachable,
  staffChatClosesAt,
  staffChatReadableUntil,
  unknownTemplateVariables,
} from "./templates";

const DAY = 86_400_000;

describe("modèles de messages (lot 20)", () => {
  it("remplace les variables connues, espaces tolérés", () => {
    const out = renderTemplate("Bonjour {{pseudo}}, rendez-vous à {{ event.city }} pour « {{event.title}} ».", {
      pseudo: "Kenji",
      "event.city": "Canet",
      "event.title": "Nocturne de Canet",
    });
    expect(out).toBe("Bonjour Kenji, rendez-vous à Canet pour « Nocturne de Canet ».");
  });

  it("laisse telles quelles les variables inconnues et celles sans valeur", () => {
    expect(renderTemplate("{{inconnue}} · {{review_link}} · {{structure.name}}", { "structure.name": "MSC" })).toBe(
      "{{inconnue}} · {{review_link}} · MSC",
    );
    expect(renderTemplate("{{pseudo}}", { pseudo: "" })).toBe("{{pseudo}}");
  });

  it("ne réinterprète jamais une valeur (pas d'injection de variable)", () => {
    expect(renderTemplate("{{pseudo}} {{event.title}}", { pseudo: "{{event.title}}", "event.title": "X" })).toBe(
      "{{event.title}} X",
    );
  });

  it("liste les variables inconnues", () => {
    expect(unknownTemplateVariables("{{pseudo}} {{nom}} {{ event.date }} {{x.y}}")).toEqual(["nom", "x.y"]);
  });
});

describe("quota des abonnés (S18)", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * DAY);

  it("4 envois sur 30 jours glissants", () => {
    expect(followerQuotaRemaining([], now)).toBe(4);
    expect(followerQuotaRemaining([ago(1), ago(2), ago(29)], now)).toBe(1);
    expect(followerQuotaRemaining([ago(1), ago(2), ago(3), ago(4)], now)).toBe(0);
    // Un envoi de plus de 30 jours ne compte plus.
    expect(followerQuotaRemaining([ago(1), ago(2), ago(3), ago(31)], now)).toBe(1);
    expect(followerQuotaRemaining([ago(1)], now, 1)).toBe(0);
  });

  it("date de la prochaine place libre", () => {
    expect(followerQuotaResetsAt([ago(1)], now)).toBeNull();
    const sent = [ago(10), ago(2), ago(3), ago(4)];
    expect(followerQuotaResetsAt(sent, now)?.getTime()).toBe(ago(10).getTime() + FOLLOWER_QUOTA_WINDOW_MS);
  });
});

describe("segments et discussion du staff", () => {
  it("staff et abonnés sans événement, le reste avec", () => {
    expect(segmentNeedsEvent("followers")).toBe(false);
    expect(segmentNeedsEvent("staff")).toBe(false);
    expect(segmentNeedsEvent("accepted")).toBe(true);
    expect(segmentNeedsEvent("checked_in")).toBe(true);
  });

  it("inscrits joignables jusqu'à 7 jours après la fin", () => {
    const endsAt = new Date("2026-10-17T23:00:00Z");
    expect(segmentReachable({ endsAt }, new Date("2026-10-24T22:00:00Z"))).toBe(true);
    expect(segmentReachable({ endsAt }, new Date("2026-10-25T00:00:00Z"))).toBe(false);
  });

  it("fermée à J+1, lisible jusqu'à J+7", () => {
    const endsAt = new Date("2026-10-17T23:00:00Z");
    expect(staffChatClosesAt({ endsAt }).toISOString()).toBe("2026-10-18T23:00:00.000Z");
    expect(staffChatReadableUntil({ endsAt }).toISOString()).toBe("2026-10-24T23:00:00.000Z");
  });
});
