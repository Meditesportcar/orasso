import { setDisplayClock } from "@orasso/shared";
import { afterEach, describe, expect, it } from "vitest";

import { formatDayTime, formatShortDay } from "./types";

// Lot R3b, tour 2 (relecture Codex) : le texte complet, sans dépendre du séparateur d'`Intl` (« à » ou virgule).
const Y = new Date().getUTCFullYear();
const at = (year: number) => new Date(Date.UTC(year, 2, 14, 17, 0)); // 14 mars, 18 h à Paris

describe("dates de l'assistant (lot R3b)", () => {
  afterEach(() => setDisplayClock(() => new Date()));

  it("année en cours : « Dim. 14 mars · 18:00 » (jour et heure entiers)", () => {
    setDisplayClock(() => new Date(Date.UTC(Y, 5, 1)));
    const text = formatDayTime(at(Y));
    expect(text).toMatch(/^[A-Z][a-zé]+\. 14 mars · 18:00$/);
    expect(formatShortDay(at(Y))).toMatch(/^[A-Z][a-zé]+\. 14 mars$/);
  });

  it("année suivante : l'année après le jour, avant l'heure", () => {
    setDisplayClock(() => new Date(Date.UTC(Y, 5, 1)));
    expect(formatDayTime(at(Y + 1))).toMatch(new RegExp(`^[A-Z][a-zé]+\\. 14 mars ${Y + 1} · 18:00$`));
    expect(formatShortDay(at(Y + 1))).toMatch(new RegExp(`14 mars ${Y + 1}$`));
  });
});
