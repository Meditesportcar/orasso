// Dates et nombres en français, toujours à l'heure de Paris (le rendu serveur et le navigateur donnent le même texte).
const TZ = "Europe/Paris";

const dayFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dayShortFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const hhmm = (iso: string) =>
  timeFmt
    .format(new Date(iso))
    .replace(":", " h ")
    .replace(/ h 00$/, " h");

export const formatDay = (iso: string) => dayFmt.format(new Date(iso));
export const formatDayShort = (iso: string) => dayShortFmt.format(new Date(iso));
export const formatTime = hhmm;
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

/** « sam. 17 oct. 2026 · 19 h – 23 h ». */
export function formatWhen(startsAt: string, endsAt: string): string {
  return `${formatDay(startsAt)} · ${hhmm(startsAt)} – ${hhmm(endsAt)}`;
}

/** Compte à rebours « 23 h 59 min » ; « expirée » une fois l'échéance passée. */
export function formatRemaining(untilIso: string, nowMs: number): string {
  const ms = new Date(untilIso).getTime() - nowMs;
  if (ms <= 0) return "expirée";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = Math.floor((ms % 60_000) / 1000);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${m} min ${String(s).padStart(2, "0")} s`;
}
