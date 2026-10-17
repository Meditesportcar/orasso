import { describe, expect, it } from "vitest";

import {
  BADGE_GRACE_DAYS,
  badgeDaysLeft,
  badgePlan,
  contactViewTraced,
  csvCell,
  csvLine,
  ensureReviewLink,
  exportFileName,
  gracedBadgeExpiry,
  renewedBadgeExpiry,
  reportRefreshAt,
  reviewLink,
  thanksBlockedReason,
} from "./afterEvent";
import { DAY } from "./time";

const at = (iso: string) => new Date(iso);

describe("bilan et remerciement", () => {
  const event = { endsAt: at("2026-10-10T20:00:00Z"), status: "published" };
  it("le bilan est rafraîchi à J+8", () => {
    expect(reportRefreshAt(event).toISOString()).toBe("2026-10-18T20:00:00.000Z");
  });
  it("remerciement : après la fin, jusqu'à J+7, une seule fois", () => {
    expect(thanksBlockedReason(event, at("2026-10-10T19:00:00Z"), false)).toBe("not_ended");
    expect(thanksBlockedReason(event, at("2026-10-11T08:00:00Z"), false)).toBeNull();
    expect(thanksBlockedReason(event, at("2026-10-17T19:59:00Z"), false)).toBeNull();
    expect(thanksBlockedReason(event, at("2026-10-17T20:01:00Z"), false)).toBe("too_late");
    expect(thanksBlockedReason(event, at("2026-10-11T08:00:00Z"), true)).toBe("sent");
    expect(thanksBlockedReason({ ...event, status: "cancelled" }, at("2026-10-11T08:00:00Z"), false)).toBe(
      "not_published",
    );
  });
  it("le lien d'avis est unique par candidature et le texte le contient toujours", () => {
    expect(reviewLink("https://dev.orasso.fr", "abc")).toBe("https://dev.orasso.fr/app/acces?avis=abc");
    expect(ensureReviewLink("Merci !")).toContain("{{review_link}}");
    expect(ensureReviewLink("Merci {{ review_link }}")).toBe("Merci {{ review_link }}");
  });
  it("les coordonnées sont tracées après J+7 seulement", () => {
    expect(contactViewTraced(event, at("2026-10-17T20:00:00Z"))).toBe(false);
    expect(contactViewTraced(event, at("2026-10-17T20:00:01Z"))).toBe(true);
  });
});

describe("export CSV", () => {
  it("échappe les formules (=, +, -, @, tabulation) et laisse les nombres", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+33612345678")).toBe("'+33612345678");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
  });
  it("met entre guillemets le séparateur et les retours à la ligne", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("ligne 1\nligne 2")).toBe('"ligne 1\nligne 2"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvLine(["Kenji", 3, null, "=1+1"])).toBe("Kenji;3;;'=1+1");
    // Aussi après un séparateur à l'intérieur de la cellule.
    expect(csvCell("a,=1+1")).toBe("a,'=1+1");
    expect(csvCell("a;@SUM(A1)")).toBe('"a;\'@SUM(A1)"');
    expect(csvCell("a, b")).toBe("a, b");
  });
  it("nom du fichier", () => {
    expect(exportFileName("nocturne-de-rentree-2026", "2026-10-17")).toBe(
      "orasso-nocturne-de-rentree-2026-participants-2026-10-17.csv",
    );
    expect(exportFileName("a/b..c", "2026-10-17")).toBe("orasso-a-b--c-participants-2026-10-17.csv");
  });
});

describe("badge de structure", () => {
  const expires = at("2027-01-31T00:00:00Z");
  it("jours restants arrondis au jour supérieur", () => {
    expect(badgeDaysLeft(expires, at("2027-01-30T12:00:00Z"))).toBe(1);
    expect(badgeDaysLeft(expires, at("2027-01-31T00:00:00Z"))).toBe(0);
    expect(badgeDaysLeft(expires, at("2027-02-05T00:00:00Z"))).toBe(0);
  });
  it("rien avant J-30, puis un rappel par palier, une fois chacun", () => {
    const reminded: Record<string, string> = {};
    expect(badgePlan(expires, new Date(expires.getTime() - 31 * DAY), reminded)).toEqual({ action: "none" });
    const first = badgePlan(expires, new Date(expires.getTime() - 30 * DAY), reminded);
    expect(first).toEqual({ action: "remind", day: 30, mark: [30] });
    reminded["30"] = "x";
    expect(badgePlan(expires, new Date(expires.getTime() - 29 * DAY), reminded)).toEqual({ action: "none" });
    const week = badgePlan(expires, new Date(expires.getTime() - 7 * DAY), reminded);
    expect(week).toEqual({ action: "remind", day: 7, mark: [7] });
    reminded["7"] = "x";
    expect(badgePlan(expires, new Date(expires.getTime() - 6 * DAY), reminded)).toEqual({ action: "none" });
    const eve = badgePlan(expires, new Date(expires.getTime() - 1 * DAY), reminded);
    expect(eve).toEqual({ action: "remind", day: 1, mark: [1] });
    reminded["1"] = "x";
    expect(badgePlan(expires, new Date(expires.getTime() - 0.5 * DAY), reminded)).toEqual({ action: "none" });
  });
  it("une tâche manquée n'envoie qu'un rappel, le plus urgent, et marque tous les paliers franchis", () => {
    const plan = badgePlan(expires, new Date(expires.getTime() - 5 * DAY), {});
    expect(plan).toEqual({ action: "remind", day: 7, mark: [30, 7] });
  });
  it("suspension à l'échéance", () => {
    expect(badgePlan(expires, expires, { "1": "x" })).toEqual({ action: "suspend" });
    expect(badgePlan(expires, new Date(expires.getTime() + DAY), { "1": "x" })).toEqual({ action: "suspend" });
  });
  it("jamais de suspension sans le rappel de la veille : rappel tardif d'abord", () => {
    expect(badgePlan(expires, new Date(expires.getTime() + DAY), {})).toEqual({
      action: "remind",
      day: 1,
      mark: [30, 7, 1],
      overdue: true,
    });
    expect(badgePlan(expires, new Date(expires.getTime() + DAY), { "30": "x", "7": "x" })).toMatchObject({
      overdue: true,
      mark: [1],
    });
  });
  it("jours calendaires de Paris : la veille ne part pas le jour même", () => {
    // Échéance le 31/01 à 20:00 Paris ; balayage du 31/01 à 09:00 : 0 jour, pas de rappel « demain ».
    const evening = new Date("2027-01-31T19:00:00Z");
    expect(badgeDaysLeft(evening, new Date("2027-01-31T08:00:00Z"))).toBe(0);
    expect(badgePlan(evening, new Date("2027-01-31T08:00:00Z"), { "30": "x", "7": "x" })).toEqual({ action: "none" });
    expect(badgeDaysLeft(evening, new Date("2027-01-30T08:00:00Z"))).toBe(1);
    expect(badgePlan(evening, new Date("2027-01-30T08:00:00Z"), { "30": "x", "7": "x" })).toMatchObject({ day: 1 });
  });
  it("renouvellement : un an à partir de la plus tardive des deux dates", () => {
    const now = at("2026-12-20T09:00:00Z");
    expect(renewedBadgeExpiry(expires, now).toISOString()).toBe("2028-01-31T00:00:00.000Z");
    expect(renewedBadgeExpiry(at("2026-11-01T00:00:00Z"), now).toISOString()).toBe("2027-12-20T09:00:00.000Z");
    expect(renewedBadgeExpiry(null, now).toISOString()).toBe("2027-12-20T09:00:00.000Z");
  });
  it("levée sans renouvellement : au moins 30 jours de grâce", () => {
    const now = at("2027-02-10T09:00:00Z");
    expect(gracedBadgeExpiry(expires, now).getTime()).toBe(now.getTime() + BADGE_GRACE_DAYS * DAY);
    const far = at("2027-12-01T00:00:00Z");
    expect(gracedBadgeExpiry(far, now)).toEqual(far);
  });
});
