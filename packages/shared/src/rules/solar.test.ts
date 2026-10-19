import { describe, expect, it } from "vitest";

import { isDaylight, isDaylightSource, SOLAR_FALLBACK, solarPosition, sunTimes } from "./solar";

// Référence indépendante : les formules complètes du tableur NOAA (équation du temps, nutation, obliquité corrigée),
// précises à la minute pour les latitudes moyennes. La règle simplifiée doit rester à ± 3 min.
const RAD = Math.PI / 180;
function noaa(dayUtc: string, lat: number, lng: number): { sunrise: number; sunset: number } {
  const midnight = Date.parse(`${dayUtc}T00:00:00Z`);
  const minutes = (event: "rise" | "set") => {
    let t = 720 - 4 * lng; // première estimation : midi solaire moyen (minutes UTC)
    for (let i = 0; i < 3; i++) {
      const jd = (midnight + t * 60_000) / 86_400_000 + 2_440_587.5;
      const T = (jd - 2_451_545) / 36_525;
      const l0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
      const m = 357.52911 + T * (35999.05029 - 0.0001537 * T);
      const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
      const c =
        Math.sin(m * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
        Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * T) +
        Math.sin(3 * m * RAD) * 0.000289;
      const omega = 125.04 - 1934.136 * T;
      const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
      const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
      const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
      const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
      const y = Math.tan((eps / 2) * RAD) ** 2;
      const eqTime =
        (4 *
          (y * Math.sin(2 * l0 * RAD) -
            2 * e * Math.sin(m * RAD) +
            4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
            0.5 * y * y * Math.sin(4 * l0 * RAD) -
            1.25 * e * e * Math.sin(2 * m * RAD))) /
        RAD;
      const ha =
        Math.acos(
          Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl),
        ) / RAD;
      const noon = 720 - 4 * lng - eqTime;
      t = event === "rise" ? noon - 4 * ha : noon + 4 * ha;
    }
    return midnight + t * 60_000;
  };
  return { sunrise: minutes("rise"), sunset: minutes("set") };
}

const cities = {
  Perpignan: { lat: 42.6986, lng: 2.8956 },
  Paris: { lat: 48.8566, lng: 2.3522 },
  Lille: { lat: 50.6292, lng: 3.0573 },
};
// Équinoxes et solstices 2026.
const days = ["2026-03-20", "2026-06-21", "2026-09-23", "2026-12-21"];
const MIN = 60_000;

describe("sunTimes : lever et coucher du soleil à ± 3 min", () => {
  for (const [name, { lat, lng }] of Object.entries(cities)) {
    for (const day of days) {
      it(`${name}, ${day}`, () => {
        const ref = noaa(day, lat, lng);
        const got = sunTimes(new Date(`${day}T12:00:00Z`), lat, lng);
        expect(got.polar).toBeNull();
        expect(Math.abs((got.sunrise?.getTime() ?? 0) - ref.sunrise)).toBeLessThanOrEqual(3 * MIN);
        expect(Math.abs((got.sunset?.getTime() ?? 0) - ref.sunset)).toBeLessThanOrEqual(3 * MIN);
      });
    }
  }

  it("repères publiés pour Paris (heure légale) : 21 juin 5 h 47 / 21 h 58, 21 décembre 8 h 42 / 16 h 56", () => {
    const { lat, lng } = cities.Paris;
    const paris = (d: Date | null) =>
      d?.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }) ?? "";
    const toMin = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };
    const summer = sunTimes(new Date("2026-06-21T12:00:00Z"), lat, lng);
    const winter = sunTimes(new Date("2026-12-21T12:00:00Z"), lat, lng);
    expect(Math.abs(toMin(paris(summer.sunrise)) - toMin("05:47"))).toBeLessThanOrEqual(3);
    expect(Math.abs(toMin(paris(summer.sunset)) - toMin("21:58"))).toBeLessThanOrEqual(3);
    expect(Math.abs(toMin(paris(winter.sunrise)) - toMin("08:42"))).toBeLessThanOrEqual(3);
    expect(Math.abs(toMin(paris(winter.sunset)) - toMin("16:56"))).toBeLessThanOrEqual(3);
  });

  it("le jour solaire est celui qui contient l'instant, de minuit solaire à minuit solaire", () => {
    const { lat, lng } = cities.Perpignan;
    const justAfter = sunTimes(new Date("2026-06-21T00:05:00Z"), lat, lng);
    expect(justAfter.sunrise?.toISOString().slice(0, 10)).toBe("2026-06-21");
    const lateEvening = sunTimes(new Date("2026-06-21T23:30:00Z"), lat, lng);
    expect(lateEvening.sunset?.toISOString().slice(0, 10)).toBe("2026-06-21");
  });
});

describe("isDaylight", () => {
  const { lat, lng } = cities.Perpignan;
  it("midi = jour, minuit = nuit, autour du lever et du coucher", () => {
    expect(isDaylight(new Date("2026-10-19T12:00:00+02:00"), lat, lng)).toBe(true);
    expect(isDaylight(new Date("2026-10-19T00:00:00+02:00"), lat, lng)).toBe(false);
    const { sunrise, sunset } = sunTimes(new Date("2026-10-19T12:00:00+02:00"), lat, lng);
    if (!sunrise || !sunset) throw new Error("pas de lever");
    expect(isDaylight(new Date(sunrise.getTime() - MIN), lat, lng)).toBe(false);
    expect(isDaylight(new Date(sunrise.getTime() + MIN), lat, lng)).toBe(true);
    expect(isDaylight(new Date(sunset.getTime() - MIN), lat, lng)).toBe(true);
    expect(isDaylight(new Date(sunset.getTime() + MIN), lat, lng)).toBe(false);
  });

  it("nuit et jour polaires", () => {
    expect(isDaylight(new Date("2026-12-21T12:00:00Z"), 80, 15)).toBe(false);
    expect(isDaylight(new Date("2026-06-21T00:00:00Z"), 80, 15)).toBe(true);
  });

  it("la source autonome du script du site donne le même résultat sur toute une année (pas de 7 h 07)", () => {
    const fn = new Function(`return ${isDaylightSource}`)() as (t: number, a: number, o: number) => boolean;
    const start = Date.parse("2026-01-01T00:00:00Z");
    for (const { lat: a, lng: o } of Object.values(cities)) {
      for (let t = start; t < start + 365 * 86_400_000; t += 7 * MIN * 61) {
        expect(fn(t, a, o), new Date(t).toISOString()).toBe(isDaylight(new Date(t), a, o));
      }
    }
  });
});

describe("solarPosition", () => {
  it("centre du premier département, sinon Paris", () => {
    expect(solarPosition(["66", "11"])).toEqual({ lat: expect.closeTo(42.6, 0) as number, lng: expect.any(Number) });
    expect(solarPosition([])).toEqual(SOLAR_FALLBACK);
    expect(solarPosition(null)).toEqual(SOLAR_FALLBACK);
    expect(solarPosition(["zz"])).toEqual(SOLAR_FALLBACK);
  });
});
