// Lever et coucher du soleil (lot 38, ARCHITECTURE-DA-V2 § 1.4) : le thème « Automatique » = Sable le jour, Béton
// après le coucher du soleil, calculé au centre du premier département de l'utilisateur (Paris sinon, jamais le GPS).
// Algorithme NOAA simplifié (équation du lever du soleil : anomalie moyenne, équation du centre, longitude écliptique,
// déclinaison, angle horaire à −0,833° pour la réfraction et le rayon du disque) : précision de l'ordre de 2 min en
// France métropolitaine. Pur : l'horloge est passée en paramètre.

import { departmentCentroids, type LatLng } from "../geo";

/** Repli quand l'utilisateur n'a pas de département : Paris. */
export const SOLAR_FALLBACK: LatLng = { lat: 48.85, lng: 2.35 };

const DAY_MS = 86_400_000;
const J1970 = 2_440_587.5;
const J2000 = 2_451_545;
const RAD = Math.PI / 180;

const toJulian = (ms: number) => ms / DAY_MS + J1970;
const fromJulian = (j: number) => Math.round((j - J1970) * DAY_MS);

export type SunTimes = {
  /** Lever du soleil ; `null` pendant la nuit polaire ou le jour polaire (sans objet en France). */
  sunrise: Date | null;
  sunset: Date | null;
  /** Midi solaire (passage au méridien). */
  noon: Date;
  /** Jour polaire : le soleil ne se couche pas ; nuit polaire : il ne se lève pas. */
  polar: "day" | "night" | null;
};

/**
 * Lever, midi et coucher du soleil du jour solaire qui contient `date`, à la latitude et la longitude données
 * (longitude positive à l'est).
 */
export function sunTimes(date: Date, lat: number, lng: number): SunTimes {
  // Jour solaire le plus proche : celui dont le passage au méridien est à moins de 12 h de `date`.
  const n = Math.round(toJulian(date.getTime()) - J2000 + lng / 360);
  const meanSolar = n - lng / 360;
  const m = (357.5291 + 0.98560028 * meanSolar) % 360;
  const c = 1.9148 * Math.sin(m * RAD) + 0.02 * Math.sin(2 * m * RAD) + 0.0003 * Math.sin(3 * m * RAD);
  const lambda = (m + c + 180 + 102.9372) % 360;
  const transit = J2000 + meanSolar + 0.0053 * Math.sin(m * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDecl = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDecl = Math.cos(Math.asin(sinDecl));
  const cosOmega = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDecl) / (Math.cos(lat * RAD) * cosDecl);
  const noon = new Date(fromJulian(transit));
  if (cosOmega > 1) return { sunrise: null, sunset: null, noon, polar: "night" };
  if (cosOmega < -1) return { sunrise: null, sunset: null, noon, polar: "day" };
  const omega = Math.acos(cosOmega) / RAD;
  return {
    sunrise: new Date(fromJulian(transit - omega / 360)),
    sunset: new Date(fromJulian(transit + omega / 360)),
    noon,
    polar: null,
  };
}

/** Vrai entre le lever et le coucher du soleil. */
export function isDaylight(now: Date, lat: number, lng: number): boolean {
  const times = sunTimes(now, lat, lng);
  if (times.polar) return times.polar === "day";
  const t = now.getTime();
  return t >= (times.sunrise?.getTime() ?? 0) && t < (times.sunset?.getTime() ?? 0);
}

/** Position du thème automatique : centre du premier département de la liste, sinon Paris. */
export function solarPosition(departments: readonly string[] | null | undefined): LatLng {
  const first = departments?.[0];
  return (first && departmentCentroids[first]) || SOLAR_FALLBACK;
}

/**
 * La même règle que `isDaylight`, en JavaScript autonome (une fonction `(ms, lat, lng) => boolean`), pour le script
 * qui pose le thème du site avant la première peinture. Testée contre `isDaylight` (solar.test.ts).
 */
export const isDaylightSource =
  "function(t,a,o){var R=Math.PI/180,n=Math.round(t/864e5+2440587.5-2451545+o/360),s=n-o/360," +
  "m=(357.5291+.98560028*s)%360,c=1.9148*Math.sin(m*R)+.02*Math.sin(2*m*R)+3e-4*Math.sin(3*m*R)," +
  "l=(m+c+282.9372)%360,j=2451545+s+.0053*Math.sin(m*R)-.0069*Math.sin(2*l*R),d=Math.sin(l*R)*Math.sin(23.4397*R)," +
  "w=(Math.sin(-.833*R)-Math.sin(a*R)*d)/(Math.cos(a*R)*Math.cos(Math.asin(d)));if(w>1)return false;if(w<-1)return true;" +
  "var h=Math.acos(w)/R/360,x=(t/864e5+2440587.5);return x>=j-h&&x<j+h}";
