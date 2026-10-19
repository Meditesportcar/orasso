import type { EventFormat } from "../enums";
import { type Grade, gradeLabels } from "../grades";
import { weekdayNames } from "../rules/recurrence";
import { isRare, type StampInk, type StampKind, type StampShape } from "../rules/stamps";
import { wallTime } from "../rules/time";

// Passeport, prix du public, récap (lot 49) : textes du prototype DA v2 (`s-passport`, `s-vote`, `s-recap`), au « tu ».
// Les écrans (lots 50 et 57) les reprennent tels quels ; l'API s'en sert pour les notifications et le texte du récap.

export const stampShapeLabels: Record<StampShape, string> = {
  round: "Rond",
  rect: "Rectangle",
  octagon: "Octogone",
  cup: "Tasse",
};

export const stampKindLabels: Record<StampKind, string> = {
  participation: "Présence",
  visit: "Visite",
  staff: "Staff",
  first_outing: "Première sortie",
  tenth_event: "10e événement",
  full_moon: "Nuit de pleine lune",
  audience_prize: "Prix du public",
};

/** Nom de l'encre (« encre sang et or du 66 ») ; l'encre par défaut est le rouge du tampon. */
export const stampInkLabels: Record<StampInk, string> = {
  "66": "sang et or",
  "34": "violette",
  "31": "noire",
  "11": "bleue",
  default: "rouge",
};

/** « Tampon de nuit », « tampon de rassemblement »… : le format, dit comme sur la page du passeport. */
const stampFormatNoun: Record<EventFormat, string> = {
  gathering: "de rassemblement",
  exhibition: "d'expo",
  show: "de salon",
  open_house: "de portes ouvertes",
  night: "de nuit",
  cars_and_coffee: "de cars & coffee",
};

/** « 22 h 30 », « 10 h » (heure de Paris). */
export function frHour(date: Date, timeZone?: string): string {
  const w = wallTime(date, timeZone);
  return w.minute ? `${w.hour} h ${String(w.minute).padStart(2, "0")}` : `${w.hour} h`;
}

/** « 3 h 40 », « 45 min ». */
export function frDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** « 1er », « 4e ». */
export function frOrdinal(n: number): string {
  return n === 1 ? "1er" : `${n}e`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Phrase du tampon (récap, notification) : « Nouveau tampon de nuit dans ton passeport, encre sang et or du 66. » ;
 * un rare : « Nouveau tampon rare dans ton passeport : première sortie, en dorure. »
 */
export function stampSentence(stamp: {
  kind: StampKind;
  format: EventFormat;
  ink: StampInk;
  department: string | null;
}): string {
  if (isRare(stamp.kind)) {
    return `Nouveau tampon rare dans ton passeport : ${stampKindLabels[stamp.kind].toLowerCase()}, en dorure.`;
  }
  const where = stamp.department ? ` du ${stamp.department}` : "";
  return `Nouveau tampon ${stampFormatNoun[stamp.format]} dans ton passeport, encre ${stampInkLabels[stamp.ink]}${where}.`;
}

export const passportTexts = {
  title: "Passeport",
  /** « 9 tampons · 1 rare » */
  summary: (total: number, rare: number) =>
    `${plural(total, "tampon", "tampons")}${rare ? ` · ${plural(rare, "rare", "rares")}` : ""}`,
  /** « Page 2 sur 2 » */
  page: (index: number, count: number) => `Page ${index} sur ${count}`,
  empty: "Pas encore de tampon. Le premier tombe à ton premier pointage.",
  legendShape:
    "La forme suit le format : rond pour un rassemblement, rectangle pour une expo, octogone pour une nocturne, tasse pour un cars & coffee.",
  legendInk: "L'encre suit le département ou la saison.",
  legendWear: "L'usure change à chaque tampon : angle, pression, bavure. Deux pages ne se ressemblent jamais.",
  legendRare: "Les rares en dorure : première sortie, 10e événement, nuit de pleine lune, prix du public.",
  /** Notification `stamp_received`. */
  notificationTitle: (kind: StampKind) => (isRare(kind) ? "Tampon rare" : "Nouveau tampon"),
};

export const audiencePrizeTexts = {
  title: "Prix du public",
  /** « vote ouvert jusqu'à 22 h 30 » */
  openUntil: (closesAt: Date, timeZone?: string) => `vote ouvert jusqu'à ${frHour(closesAt, timeZone)}`,
  closed: "Vote clos",
  notOpen: "Le vote ouvre au premier pointage, dès deux véhicules sur place.",
  /** « Tu as été pointé à 19 h 02 » */
  checkedInAt: (at: Date, timeZone?: string) => `Tu as été pointé à ${frHour(at, timeZone)}`,
  oneVote: "Une voix, une seule",
  /** « Pas pour toi-même. Le gagnant reçoit le badge et 50 points. » */
  rules: (points: number) => `Pas pour toi-même. Le gagnant reçoit le badge et ${points} points.`,
  ranking: "Classement",
  live: "En direct",
  /** « 96 votes » */
  votes: (n: number) => plural(n, "vote", "votes"),
  /** « 4e sur 142 » */
  rank: (rank: number, of: number) => `${frOrdinal(rank)} sur ${of}`,
  errors: {
    vote_closed: "Le vote est clos.",
    vote_not_open: "Le vote n'est pas encore ouvert : il ouvre au premier pointage, dès deux véhicules sur place.",
    not_checked_in: "Votent les personnes pointées, les billets scannés et le staff présent.",
    own_vehicle: "Pas pour toi-même : choisis un autre véhicule.",
    not_present: "Ce véhicule n'a pas été pointé sur l'événement.",
  },
  /** Notification `audience_prize_won`. */
  wonTitle: "Prix du public",
  wonBody: (title: string, points: number) =>
    `Ton véhicule remporte le prix du public de « ${title} » : le badge, un tampon rare et +${points} points.`,
};

export const recapTexts = {
  /** « Arrivé dimanche à 10 h, automatiquement » */
  arrived: (at: Date, timeZone?: string) => {
    const w = wallTime(at, timeZone);
    const weekday = weekdayNames[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()] ?? "";
    return `Arrivé ${weekday} à ${frHour(at, timeZone)}, automatiquement`;
  },
  vehicles: "Véhicules",
  myEvening: "Ta soirée",
  myDay: "Ta journée",
  audiencePrize: "Prix du public",
  /** « +60 points : présence, prix du public. Plus que 460 avant Circuit. » */
  points: (total: number, labels: readonly string[], next: { grade: Grade; in: number } | null) => {
    const sign = total >= 0 ? "+" : "";
    const head = `${sign}${total} points${labels.length ? ` : ${labels.join(", ").toLowerCase()}` : ""}.`;
    return next ? `${head} Plus que ${next.in} avant ${gradeLabels[next.grade]}.` : head;
  },
  projected: "Points prévus : acquis au règlement, deux jours après l'événement.",
  settled: "Points acquis.",
  /** « Ton avis compte jusqu'à samedi 24 octobre. » */
  reviewUntil: (deadline: Date, timeZone?: string) => {
    const w = wallTime(deadline, timeZone);
    const weekday = weekdayNames[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()] ?? "";
    const months = [
      "janvier",
      "février",
      "mars",
      "avril",
      "mai",
      "juin",
      "juillet",
      "août",
      "septembre",
      "octobre",
      "novembre",
      "décembre",
    ];
    return `Ton avis compte jusqu'à ${weekday} ${w.day === 1 ? "1er" : w.day} ${months[w.month - 1]}.`;
  },
  share: "Partager",
  review: "Donner mon avis",
  /** Texte partagé (lien de la fiche ajouté par le client). */
  shareText: (title: string, vehicles: number, rank: { rank: number; of: number } | null) =>
    `J'étais à ${title} : ${plural(vehicles, "véhicule", "véhicules")}${
      rank ? `, ${frOrdinal(rank.rank)} au prix du public` : ""
    }. Sur Orasso.`,
  /** Notification `event_recap_ready`. */
  readyTitle: (title: string) => `Ton récap de ${title} est arrivé`,
  readyBody: "Tes chiffres, ton classement, tes points et ton tampon.",
};
