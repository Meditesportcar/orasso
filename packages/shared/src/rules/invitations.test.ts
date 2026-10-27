import { describe, expect, it } from "vitest";

import { highGradesText, previewSummary } from "../labels/invitations.fr";
import { canTransition } from "./applicationTransitions";
import { isHighGrade, waitlistInsertRank } from "./invitations";
import { canApply, previewHoursFor, registrationOpensAt } from "./registrationWindow";
import { HOUR } from "./time";

describe("hauts grades : liste d'attente (§ 9.2)", () => {
  const on = { highGradePriority: true, highGradeMin: "circuit" as const };
  const off = { highGradePriority: false, highGradeMin: "circuit" as const };
  const rodages = [1, 2, 3].map((rank) => ({ rank, grade: "rodage" as const }));

  it("sans priorité : toujours à la fin", () => {
    expect(waitlistInsertRank(rodages, "legende", off)).toBe(4);
    expect(waitlistInsertRank([], "legende", off)).toBe(1);
  });
  it("un Légende passe devant trois Rodage", () => {
    expect(waitlistInsertRank(rodages, "legende", on)).toBe(1);
  });
  it("mais pas devant un autre Légende arrivé avant", () => {
    const entries = [{ rank: 1, grade: "legende" as const }, ...rodages.map((e) => ({ ...e, rank: e.rank + 1 }))];
    expect(waitlistInsertRank(entries, "legende", on)).toBe(2);
  });
  it("un grade sous le seuil reste à la fin, même avec la priorité", () => {
    expect(waitlistInsertRank(rodages, "sport", on)).toBe(4);
    expect(waitlistInsertRank(rodages, "circuit", on)).toBe(1);
  });
  it("après le dernier haut grade, même déplacé par l'équipe organisatrice", () => {
    const entries = [
      { rank: 1, grade: "rodage" as const },
      { rank: 2, grade: "circuit" as const },
      { rank: 3, grade: "route" as const },
    ];
    expect(waitlistInsertRank(entries, "legende", on)).toBe(3);
  });
  it("seuil", () => {
    expect(isHighGrade("legende", "circuit")).toBe(true);
    expect(isHighGrade("sport", "circuit")).toBe(false);
    expect(isHighGrade("rodage", "rodage")).toBe(true);
  });
});

describe("avant-premières (S26 : la plus longue l'emporte)", () => {
  const open = new Date("2026-11-10T10:00:00Z");
  const e = {
    status: "published" as const,
    startsAt: new Date("2026-12-01T10:00:00Z"),
    lockOffsetMinutes: 120,
    registrationsOpenAt: open,
    previewHours: 24,
    highGradePreviewHours: 48,
    highGradeMin: "circuit" as const,
  };
  const before = (h: number) => new Date(open.getTime() - h * HOUR);

  it("abonné Rodage : 24 h", () => {
    expect(previewHoursFor(e, { follower: true, grade: "rodage" })).toBe(24);
    expect(registrationOpensAt(e, { follower: true, grade: "rodage" })).toEqual(before(24));
  });
  it("non abonné Circuit : 48 h", () => {
    expect(registrationOpensAt(e, { follower: false, grade: "circuit" })).toEqual(before(48));
    expect(canApply(e, { follower: false, grade: "circuit" }, before(47))).toEqual({ ok: true });
    expect(canApply(e, { follower: false, grade: "sport" }, before(47))).toEqual({ ok: false, reason: "not_open" });
  });
  it("abonné Circuit : 48 h, pas 72", () => {
    expect(previewHoursFor(e, { follower: true, grade: "legende" })).toBe(48);
    expect(canApply(e, { follower: true, grade: "legende" }, before(49))).toEqual({ ok: false, reason: "not_open" });
  });
  it("abonné avec une avant-première plus longue que celle des grades", () => {
    expect(previewHoursFor({ ...e, previewHours: 72 }, { follower: true, grade: "circuit" })).toBe(72);
  });
  it("forme booléenne inchangée (sans grade)", () => {
    expect(registrationOpensAt(e, true)).toEqual(before(24));
    expect(registrationOpensAt(e, false)).toEqual(open);
  });
  it("résumé affiché sur la page", () => {
    // Lot R6-police : l'unité ne se sépare jamais de son nombre (espace insécable).
    expect(previewSummary(e)).toBe("Avant-première abonnés 24\u00a0h · grades Circuit et Légende 48\u00a0h");
    expect(previewSummary({ ...e, previewHours: 0, highGradePreviewHours: 0 })).toBeNull();
    expect(highGradesText("legende")).toBe("Légende");
    expect(highGradesText("sport")).toBe("Sport, Circuit et Légende");
  });
});

describe("invitation acceptée : création directe (§ 9.1)", () => {
  it("l'invité crée une candidature retenue ou en liste d'attente, jamais autre chose", () => {
    expect(canTransition(null, "accepted", "user")).toBe(true);
    expect(canTransition(null, "waitlisted", "user")).toBe(true);
    expect(canTransition(null, "offered", "user")).toBe(false);
    expect(canTransition(null, "waitlisted", "organizer")).toBe(false);
  });
});
