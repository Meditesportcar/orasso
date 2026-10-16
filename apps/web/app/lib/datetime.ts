// Champs « date et heure » des formulaires : le navigateur donne « 2026-07-05T18:00 » sans fuseau, l'API attend un
// instant ISO. Les dates sont toujours saisies et affichées à l'heure de Paris (fuseau métier unique en V1).
import { fromWallTime, wallTime } from "@orasso/shared";

const pad = (n: number) => String(n).padStart(2, "0");

/** Instant ISO → valeur d'un `<input type="datetime-local">` (heure de Paris). */
export function toInput(iso: string | Date): string {
  const w = wallTime(typeof iso === "string" ? new Date(iso) : iso);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** Valeur d'un `<input type="datetime-local">` → instant ISO (`null` si illisible). */
export function fromInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return fromWallTime({
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  }).toISOString();
}
