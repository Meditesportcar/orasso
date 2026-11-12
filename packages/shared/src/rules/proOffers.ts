// Les offres du pro (lot R9c, décisions du 10/11 : « les offres et actualités deviennent des publications avec l'étiquette
// « Offre » »). Règles pures, sans React ni réseau, testées par `proOffers.test.ts`. Les dates d'une offre sont des **jours
// civils de Paris** (`AAAA-MM-JJ`) : le dernier jour est compris (l'offre est en cours jusqu'à minuit, heure de Paris).
// `now` est toujours passé (par défaut, l'horloge d'affichage d'Orasso).
import { type OfferErrorCode, proOffersLabels as T } from "../labels/proOffers.fr";
import { displayNow } from "./dateYear";
import { parisDayOf } from "./sponsored";

/** Les étiquettes d'une publication (R9c : une seule, « Offre »). */
export const feedPostTags = ["offer"] as const;
export type FeedPostTag = (typeof feedPostTags)[number];

/** Le titre d'une offre : 2 à 80 caractères (comme les anciennes « offres et actualités »). */
export const OFFER_TITLE_MIN = 2;
export const OFFER_TITLE_MAX = 80;

/** L'état d'une offre : à venir (début dans le futur), en cours, terminée (fin passée). */
export type OfferState = "upcoming" | "current" | "ended";

/** Ce que l'API sert d'une offre (`FeedPostView.offer`). */
export type OfferView = { title: string; startsOn: string | null; endsOn: string; state: OfferState };

/** Les deux jours d'une offre : le début est facultatif (vide = dès la publication), la fin obligatoire. */
export type OfferDays = { startsOn: string | null; endsOn: string };

const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

/** `AAAA-MM-JJ` d'un vrai jour du calendrier. */
export function isOfferDay(raw: unknown): raw is string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Le jour de Paris d'un instant (`AAAA-MM-JJ`). */
export const offerToday = (now: Date = displayNow()): string => parisDayOf(now);

/**
 * L'état d'une offre à l'instant `now`. Le jour de fin est compris : à 22 h (Paris) le dernier jour elle est « en cours », à
 * 0 h 05 le lendemain « terminée ». Sans début, elle est en cours dès sa publication.
 */
export function offerState(offer: OfferDays, now: Date = displayNow()): OfferState {
  const today = offerToday(now);
  if (today > offer.endsOn) return "ended";
  if (offer.startsOn && today < offer.startsOn) return "upcoming";
  return "current";
}

/** Une offre non terminée (à venir ou en cours) : celles de l'onglet « Offres » et du compteur. */
export const offerIsLive = (offer: OfferDays, now: Date = displayNow()): boolean => offerState(offer, now) !== "ended";

type Parts = { y: number; m: number; d: number };
const partsOf = (day: string): Parts => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return { y, m, d };
};
const dm = (p: Parts) => `${p.d} ${MONTHS[p.m - 1]}`;

/**
 * Les dates d'une offre en une ligne : « Du 8 au 30 nov. » (même mois), « Du 28 oct. au 5 nov. » (deux mois), « Jusqu'au 15 déc. »
 * (sans début). L'année est écrite quand une borne n'est pas dans l'année en cours (ou si l'offre passe d'une année à l'autre).
 */
export function offerDatesLabel(offer: OfferDays, now: Date = displayNow()): string {
  const end = partsOf(offer.endsOn);
  const thisYear = partsOf(offerToday(now)).y;
  if (!offer.startsOn) return `Jusqu'au ${dm(end)}${end.y === thisYear ? "" : ` ${end.y}`}`;
  const start = partsOf(offer.startsOn);
  if (start.y !== end.y) return `Du ${dm(start)} ${start.y} au ${dm(end)} ${end.y}`;
  const year = end.y === thisYear ? "" : ` ${end.y}`;
  if (start.m === end.m) return `Du ${start.d} au ${dm(end)}${year}`;
  return `Du ${dm(start)} au ${dm(end)}${year}`;
}

/** La même, sans majuscule, pour une phrase : « offre du 10 au 30 nov. » (confirmation de « Publier »). */
export const offerDatesPhrase = (offer: OfferDays, now: Date = displayNow()): string => {
  const text = offerDatesLabel(offer, now);
  return text.charAt(0).toLowerCase() + text.slice(1);
};

/** La ligne du brouillon (R9.2b) : « Du 10 nov. au 30 nov. » avec les deux jours écrits en entier ; « Jusqu'au 30 nov. » sans début. */
export function offerEditorLabel(
  draft: { startsOn: string | null; endsOn: string | null },
  now: Date = displayNow(),
): string {
  const { startsOn, endsOn } = draft;
  if (!endsOn || !isOfferDay(endsOn))
    return startsOn && isOfferDay(startsOn) ? `Dès le ${dm(partsOf(startsOn))}` : T.datesEmpty;
  if (!startsOn || !isOfferDay(startsOn)) return offerDatesLabel({ startsOn: null, endsOn }, now);
  const s = partsOf(startsOn);
  const e = partsOf(endsOn);
  const thisYear = partsOf(offerToday(now)).y;
  const ys = s.y === e.y && s.y === thisYear ? "" : ` ${s.y}`;
  const ye = e.y === thisYear && s.y === e.y ? "" : ` ${e.y}`;
  return `Du ${dm(s)}${ys} au ${dm(e)}${ye}`;
}

/** Le brouillon d'une offre (champs saisis ; les jours vides sont `""` ou `null`). */
export type OfferDraft = { title: string; startsOn: string | null; endsOn: string | null };

/** Ce qui manque ou ne va pas dans une offre : le code (message dans `proOffersLabels.errors`), le champ, la phrase. */
export type OfferIssue = { code: OfferErrorCode; field: "title" | "startsOn" | "endsOn"; message: string };

const issue = (code: OfferErrorCode, field: OfferIssue["field"]): OfferIssue => ({
  code,
  field,
  message: T.errors[code],
});

/** Dans l'ordre : titre manquant ou trop court (ou trop long), fin manquante, jour invalide, fin passée, fin avant le début. */
export function offerIssue(draft: OfferDraft, now: Date = displayNow()): OfferIssue | null {
  // Des caractères (points de code), comme `char_length` de la base : un seul émoji n'est pas un titre de 2 caractères.
  const length = Array.from(draft.title.trim()).length;
  if (length < OFFER_TITLE_MIN) return issue("title_required", "title");
  if (length > OFFER_TITLE_MAX) return issue("title_too_long", "title");
  const start = draft.startsOn || null;
  const end = draft.endsOn || null;
  if (!end) return issue("ends_required", "endsOn");
  if (!isOfferDay(end)) return issue("dates_invalid", "endsOn");
  if (start && !isOfferDay(start)) return issue("dates_invalid", "startsOn");
  if (end < offerToday(now)) return issue("ends_past", "endsOn");
  if (start && end < start) return issue("ends_before_start", "endsOn");
  return null;
}

/** L'étiquette dans « Publier » : choisie ou non, titre et jours saisis (les jours vides sont `""`). */
export type OfferForm = { on: boolean; title: string; startsOn: string; endsOn: string };

export const emptyOfferForm: OfferForm = { on: false, title: "", startsOn: "", endsOn: "" };

/** Le champ `offer` de `POST /me/feed-posts` : le titre nettoyé, le début seulement s'il est posé. */
export function offerBody(form: OfferForm): { title: string; startsOn?: string; endsOn: string } {
  return {
    title: form.title.trim(),
    ...(form.startsOn ? { startsOn: form.startsOn } : {}),
    endsOn: form.endsOn,
  };
}

/**
 * Les valeurs de départ de « Publier » lues dans l'adresse (`?fiche=<identifiant>&etiquette=offre`, comme celles de R8d) : la fiche
 * pro d'abord comme auteur (si elle figure dans les casquettes), l'étiquette « Offre » choisie si demandée. Une adresse mal formée
 * ou une fiche qui n'est pas la sienne : les valeurs habituelles (`null`).
 */
export function publishStartOffer(
  params: { fiche?: string | null; etiquette?: string | null },
  authors: readonly { key: string; proId?: string }[],
): { authorKey: string; offerOn: boolean } | null {
  const pro = params.fiche && UUID.test(params.fiche) ? params.fiche.toLowerCase() : null;
  const author = pro ? authors.find((a) => a.proId?.toLowerCase() === pro) : undefined;
  if (!author) return null;
  return { authorKey: author.key, offerOn: params.etiquette === "offre" };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
