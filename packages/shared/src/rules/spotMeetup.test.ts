import { describe, expect, it } from "vitest";

import {
  clampStart,
  customEndsAt,
  defaultDuration,
  durationOptions,
  meetupActive,
  meetupPhase,
  meetupVisibleTo,
  SPOT_MAX_DURATION_MS,
  spotEndLabel,
  spotStartLabel,
  spotTimeLabel,
  spotUntilLabel,
  startOptions,
  validateSpotTimes,
} from "./spotMeetup";
import { fromWallTime } from "./time";

/** Heure murale de Paris un jour d'hiver (UTC+1), pour des tests sans horloge réelle. */
const at = (hour: number, minute = 0, day = 15) => fromWallTime({ year: 2026, month: 12, day, hour, minute });
const ids = (now: Date) => durationOptions(now).map((o) => o.id);
const labels = (now: Date) => durationOptions(now).map((o) => o.label);

describe("durationOptions", () => {
  it("9 h : 1 h, 2 h, Cet après-midi ; Ce soir dépasserait 12 h, pas de « demain 6 h »", () => {
    expect(labels(at(9))).toEqual(["1 h", "2 h", "Cet après-midi"]);
    expect(durationOptions(at(9)).at(-1)?.endsAt).toEqual(at(18));
  });
  it("14 h : Cet après-midi (18 h) et Ce soir (minuit, 10 h)", () => {
    expect(labels(at(14))).toEqual(["1 h", "2 h", "Cet après-midi", "Ce soir"]);
    expect(durationOptions(at(14)).at(-1)?.endsAt).toEqual(at(0, 0, 16));
  });
  it("19 h : plus d'après-midi ; Ce soir et Jusqu'à demain 6 h", () => {
    expect(labels(at(19))).toEqual(["1 h", "2 h", "Ce soir", "Jusqu'à demain 6 h"]);
    expect(durationOptions(at(19)).at(-1)?.endsAt).toEqual(at(6, 0, 16));
  });
  it("23 h : « Ce soir » (1 h) remplace « 1 h » ; Jusqu'à demain 6 h (7 h)", () => {
    expect(ids(at(23))).toEqual(["evening", "2h", "tomorrow"]);
  });
  it("23 h 30 : « Ce soir » ferait moins d'une heure, il n'est pas proposé", () => {
    expect(ids(at(23, 30))).toEqual(["1h", "2h", "tomorrow"]);
  });
  it("18 h pile : Jusqu'à demain 6 h (12 h exactement) est permis, Cet après-midi n'existe plus", () => {
    expect(ids(at(18))).toEqual(["1h", "2h", "evening", "tomorrow"]);
  });
  it("toutes les durées proposées respectent les 12 h, et finissent après le début", () => {
    for (let h = 0; h < 24; h++) {
      for (const o of durationOptions(at(h, 20))) {
        const start = at(h, 20).getTime();
        expect(o.endsAt.getTime()).toBeGreaterThan(start);
        expect(o.endsAt.getTime() - start).toBeLessThanOrEqual(SPOT_MAX_DURATION_MS);
      }
    }
  });
  it("une heure de début plus tard : les durées suivent le début, pas l'instant présent", () => {
    // Il est 14 h, le rendez-vous commence à 21 h : « Cet après-midi » n'a plus de sens, « Ce soir » finit à minuit.
    const later = durationOptions(at(14), at(21));
    expect(later.map((o) => o.id)).toEqual(["1h", "2h", "evening", "tomorrow"]);
    expect(later.find((o) => o.id === "evening")?.endsAt).toEqual(at(0, 0, 16));
  });
  it("nuit du changement d'heure : « demain 6 h » reste 6 h à Paris (6 h réelles seulement après 23 h)", () => {
    // 28 mars 2026, 23 h (heure d'hiver) → 29 mars 6 h (heure d'été) : l'heure saute de 2 h à 3 h.
    const start = fromWallTime({ year: 2026, month: 3, day: 28, hour: 23, minute: 0 });
    const opt = durationOptions(start).find((o) => o.id === "tomorrow");
    expect(opt?.endsAt).toEqual(fromWallTime({ year: 2026, month: 3, day: 29, hour: 6, minute: 0 }));
    expect(((opt?.endsAt.getTime() ?? 0) - start.getTime()) / 3_600_000).toBe(6);
  });
});

describe("defaultDuration", () => {
  it("« Ce soir » après 17 h, « 2 h » avant", () => {
    expect(defaultDuration(durationOptions(at(19)), at(19))?.id).toBe("evening");
    expect(defaultDuration(durationOptions(at(10)), at(10))?.id).toBe("2h");
    expect(defaultDuration(durationOptions(at(17)), at(17))?.id).toBe("evening");
    expect(defaultDuration(durationOptions(at(16, 59)), at(16, 59))?.id).toBe("2h");
  });
});

describe("heures", () => {
  it("customEndsAt borne entre 30 min et 12 h", () => {
    const s = at(10);
    expect(customEndsAt(s, 5).getTime() - s.getTime()).toBe(30 * 60_000);
    expect(customEndsAt(s, 3 * 60).getTime() - s.getTime()).toBe(3 * 60 * 60_000);
    expect(customEndsAt(s, 99 * 60).getTime() - s.getTime()).toBe(SPOT_MAX_DURATION_MS);
  });
  it("startOptions : Maintenant puis les quatre prochains quarts d'heure ronds", () => {
    expect(startOptions(at(20, 10)).map((o) => o.label)).toEqual(["Maintenant", "20 h 30", "21 h", "21 h 30", "22 h"]);
    expect(startOptions(at(20, 25)).map((o) => o.label)[1]).toBe("21 h");
  });
  it("clampStart reste entre maintenant et 24 h", () => {
    const now = at(20, 10);
    expect(clampStart(new Date(now.getTime() - 3_600_000), now).getTime()).toBeGreaterThanOrEqual(now.getTime());
    expect(clampStart(new Date(now.getTime() + 99 * 3_600_000), now).getTime()).toBeLessThanOrEqual(
      now.getTime() + 24 * 3_600_000,
    );
  });
  it("libellés", () => {
    expect(spotTimeLabel(at(21))).toBe("21 h");
    expect(spotTimeLabel(at(21, 5))).toBe("21 h 05");
    expect(spotUntilLabel(at(21), at(0, 0, 16))).toBe("jusqu'à minuit");
    expect(spotUntilLabel(at(10), at(12))).toBe("jusqu'à 12 h");
    expect(spotUntilLabel(at(19), at(6, 0, 16))).toBe("jusqu'à demain 6 h");
    expect(spotEndLabel(at(21), at(0, 0, 16))).toBe("à minuit");
    expect(spotEndLabel(at(10), at(12))).toBe("à 12 h");
    expect(spotEndLabel(at(19), at(6, 0, 16))).toBe("demain à 6 h");
    expect(spotStartLabel(at(21), at(20))).toBe("à 21 h");
    expect(spotStartLabel(at(9, 0, 16), at(20))).toBe("demain à 9 h");
    expect(spotStartLabel(at(19), at(20))).toBe("maintenant");
  });
});

describe("validateSpotTimes", () => {
  const now = at(20);
  const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);
  it("12 h pile passe, au-delà non", () => {
    expect(validateSpotTimes(now, hours(12), now)).toBeNull();
    expect(validateSpotTimes(now, new Date(hours(12).getTime() + 1), now)).toBe("too_long");
  });
  it("la fin vient après le début", () => {
    expect(validateSpotTimes(now, now, now)).toBe("ends_before_start");
    expect(validateSpotTimes(hours(2), hours(1), now)).toBe("ends_before_start");
  });
  it("début : 15 min dans le passé au plus, 24 h devant au plus", () => {
    expect(validateSpotTimes(new Date(now.getTime() - 14 * 60_000), hours(1), now)).toBeNull();
    expect(validateSpotTimes(new Date(now.getTime() - 16 * 60_000), hours(1), now)).toBe("start_in_past");
    expect(validateSpotTimes(hours(24), hours(25), now)).toBeNull();
    expect(validateSpotTimes(hours(24.1), hours(26), now)).toBe("start_too_far");
  });
  it("un rendez-vous déjà fini n'existe pas", () => {
    expect(validateSpotTimes(new Date(now.getTime() - 10 * 60_000), new Date(now.getTime() - 5 * 60_000), now)).toBe(
      "already_over",
    );
  });
});

describe("meetupVisibleTo", () => {
  const author = { id: "a", active: true };
  const base = { authorId: "a", audience: "followers" as const, crewId: null, authorActive: true };
  const noRel = { followAccepted: false, crewMemberActive: () => false };
  const b = { id: "b", active: true };
  it("l'auteur voit toujours le sien", () => {
    expect(meetupVisibleTo(author, base, noRel)).toBe(true);
  });
  it("abonné accepté : oui (même si l'auteur est public) ; en attente ou inconnu : non", () => {
    expect(meetupVisibleTo(b, base, { ...noRel, followAccepted: true })).toBe(true);
    expect(meetupVisibleTo(b, base, noRel)).toBe(false);
  });
  it("crew : seulement un membre actif de CE crew", () => {
    const crew = { ...base, audience: "crew" as const, crewId: "c1" };
    expect(meetupVisibleTo(b, crew, { ...noRel, crewMemberActive: (id) => id === "c1" })).toBe(true);
    expect(meetupVisibleTo(b, crew, { ...noRel, crewMemberActive: (id) => id === "c2" })).toBe(false);
    // Être abonné ne suffit pas pour un rendez-vous de crew.
    expect(meetupVisibleTo(b, crew, { ...noRel, followAccepted: true })).toBe(false);
  });
  it("jamais sans session, jamais pour un compte écarté, jamais d'un auteur écarté", () => {
    const rel = { ...noRel, followAccepted: true };
    expect(meetupVisibleTo(null, base, rel)).toBe(false);
    expect(meetupVisibleTo({ id: "b", active: false }, base, rel)).toBe(false);
    expect(meetupVisibleTo(b, { ...base, authorActive: false }, rel)).toBe(false);
  });
});

describe("phase et actif", () => {
  const m = { startsAt: at(20), endsAt: at(22) };
  it("phase", () => {
    expect(meetupPhase(m, at(19))).toBe("upcoming");
    expect(meetupPhase(m, at(21))).toBe("live");
    expect(meetupPhase(m, at(22))).toBe("ended");
  });
  it("actif : ni annulé ni effacé ni fini", () => {
    const base = { endsAt: at(22), cancelledAt: null, purgedAt: null };
    expect(meetupActive(base, at(21))).toBe(true);
    expect(meetupActive(base, at(22))).toBe(false);
    expect(meetupActive({ ...base, cancelledAt: at(20) }, at(21))).toBe(false);
    expect(meetupActive({ ...base, purgedAt: at(20) }, at(21))).toBe(false);
  });
});
