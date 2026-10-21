// Modèle de l'assistant de création et de modification d'un événement (lot 13 sur le site, lot 35b pour l'appli, D20 :
// « tout se gère depuis l'appli »). Le brouillon, ses valeurs par défaut, la validation de chaque étape et les corps
// envoyés à l'API sont ici, une seule fois, pour le site (`EventWizard.tsx`) et l'appli (`features/orga/wizard`).
// Fonctions pures : l'heure courante est passée en paramètre (horloge simulée du lot 34a).
//
// Les dates sont saisies et affichées à l'heure de Paris (fuseau métier unique en V1) : un champ « date et heure » vaut
// « AAAA-MM-JJTHH:MM » (la valeur d'un `<input type="datetime-local">`), sans fuseau.
import type { DayAccess, EventAdmission, EventFormat, EventPublicAccess, VehicleType } from "./enums";
import type { Grade } from "./grades";
import { arrivalProblems } from "./labels/arrival.fr";
import { eventAddressRequired } from "./labels/corrections.fr";
import { criteriaOrigins, wizardV2Labels } from "./labels/event-editor.fr";
import { defaultEventRules } from "./labels/events.fr";
import { EVENT_NEED_MAX_QUANTITY, type ProviderPower, type VendorTypeCode } from "./provider";
import { type ArrivalSlot, type Arrivals, arrivalInstant, validateArrivals } from "./rules/arrival";
import { POSTER_DEFAULT_STYLE, POSTER_TITLE_MAX } from "./rules/poster";
import {
  nthWeekdayOfMonth,
  RECURRENCE_MAX_COUNT,
  type RecurrenceRule,
  recurrenceOccurrences,
} from "./rules/recurrence";
import { addDays, calendarDaysBetween, fromWallTime, wallTime } from "./rules/time";
import type { EventOrganizer, EventZone, PosterSettings } from "./schemas/event";
import type { EventNeedView } from "./schemas/provider";

const pad = (n: number) => String(n).padStart(2, "0");

/** Instant → valeur d'un champ « date et heure » (heure de Paris). */
export function toWallInput(iso: string | Date): string {
  const w = wallTime(typeof iso === "string" ? new Date(iso) : iso);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** Valeur d'un champ « date et heure » → instant ISO (`null` si illisible). */
export function fromWallInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return fromWallTime({ year, month, day, hour, minute }).toISOString();
}

/**
 * Les huit temps de l'assistant, site et appli (lot 53, `s-create`, V13). Ils regroupent les douze étapes d'avant sans
 * rien retirer : format, dates, titre, description, véhicules et places → `type` ; adresse, zones, prestataires
 * attendus et missions → `lieu` ; créneaux, entrée du public et billetterie → `arrivees` ; admission et critères →
 * `criteres` ; ouverture, avant-première, hauts grades et verrouillage → `avant-premiere` ; règlement et consignes →
 * `reglement` ; affiche générée et affiche perso → `affiche` ; récapitulatif → `publier`.
 */
export const eventWizardSteps = [
  "type",
  "lieu",
  "arrivees",
  "criteres",
  "avant-premiere",
  "reglement",
  "affiche",
  "publier",
] as const;
export type EventWizardStep = (typeof eventWizardSteps)[number];

/** Temps d'après son nom (adresse `?temps=lieu`), `null` s'il n'existe pas. */
export const eventWizardStepOf = (value: string | null | undefined): EventWizardStep | null =>
  (eventWizardSteps as readonly string[]).includes(value ?? "") ? (value as EventWizardStep) : null;

/** Pays proposés au critère « Origine » (codes ISO à deux lettres). */
export const criteriaCountries = [
  ["FR", "France"],
  ["DE", "Allemagne"],
  ["IT", "Italie"],
  ["GB", "Royaume-Uni"],
  ["JP", "Japon"],
  ["US", "États-Unis"],
  ["SE", "Suède"],
  ["ES", "Espagne"],
] as const;

export type ZoneDraft = { id?: string; code: string; name: string; capacity: string };

/** Un jour d'un événement sur plusieurs jours (lot 26) : date, heures de Paris, capacité facultative. */
export type DayDraft = { date: string; startTime: string; endTime: string; capacity: string };

/**
 * Une mission (besoin `event_needs`, lot 46) saisie dans le volet « Sur place » : métier, nombre, ce que l'organisation
 * fournit, façade (mètres) et heure d'installation (« HH:MM », le jour de l'événement).
 */
export type NeedDraft = {
  id?: string;
  trade: VendorTypeCode;
  quantity: string;
  power: ProviderPower;
  water: boolean;
  frontageM: string;
  installTime: string;
  /**
   * Jour de l'installation, en jours après celui que donne l'heure seule (comme un créneau d'arrivée : le jour de
   * l'événement, ou le lendemain après minuit). Absent ou 0 : ce jour-là. Gardé à la relecture (une installation le
   * 2e jour d'un événement sur deux jours reste le 2e jour) ; il suit l'événement si sa date change.
   */
  installDay?: number;
};

/**
 * Récurrence choisie au temps 1 (« Revient le 1er dimanche de chaque mois ») : créée une seule fois, à la fin de
 * l'assistant, par `POST /events/:id/recurrence` (les dates suivantes naissent en brouillon).
 */
export type RecurrenceDraft = { nth: number; weekday: number; count: number };

/** Le brouillon de l'assistant : des chaînes pour les champs saisis, comme dans un formulaire. */
export type EventDraft = {
  format: EventFormat;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  /** Lot 26 : événement sur plusieurs jours, ses jours et le mode d'accès. */
  multiDay: boolean;
  days: DayDraft[];
  dayAccess: DayAccess;
  addressLine: string;
  postalCode: string;
  city: string;
  lat: number | null;
  lng: number | null;
  vehicleTypes: VehicleType[];
  maxVehiclesPerUser: string;
  unlimited: boolean;
  capacity: string;
  vendorTypes: string[];
  /** Rôle boutique du staff activé pour cet événement (lot 24). */
  shopEnabled: boolean;
  publicAccess: EventPublicAccess;
  externalTicketUrl: string;
  /** Entrée payante hors Orasso : lien de billetterie ou paiement sur place (lot 21). */
  paymentMode: "link" | "on_site";
  admission: EventAdmission;
  categoryIds: string[];
  makeIds: string[];
  countries: string[];
  criteriaText: string;
  registrationsOpenAt: string;
  previewHours: string;
  /** Hauts grades (lot 25) : priorité en liste d'attente, avant-première supplémentaire, seuil. */
  highGradePriority: boolean;
  highGradePreviewHours: string;
  highGradeMin: Grade;
  lockOffsetMinutes: string;
  rulesText: string;
  instructions: string;
  zones: ZoneDraft[];
  /**
   * Lot 47 : créneaux d'arrivée des exposants et du public (« HH:MM »). Facultatif : absent, rien n'est envoyé ; saisis au
   * temps « Les arrivées » (lot 53).
   */
  arrivals?: Arrivals;
  /** Lot 47 : affiche générée (photo envoyée, style, titre de 34 caractères au plus). Facultatif comme `arrivals`. */
  poster?: PosterSettings | null;
  /** Lot 53 : « Précision pour l'entrée (facultatif) » (absent des brouillons d'avant). */
  entranceNote?: string;
  /** Lot 53 : missions du volet « Sur place » (absentes des brouillons d'avant). */
  needs?: NeedDraft[];
  /** Lot 53 : « Récurrent » au temps 1 ; `null` ou absent = ponctuel ou plusieurs jours. */
  recurrence?: RecurrenceDraft | null;
  /**
   * Dates saisies avant de choisir « Récurrent » (qui cale le début sur la règle) : reprises si l'on revient à
   * « Ponctuel ». Propre à la saisie, jamais envoyé.
   */
  datesBeforeRecurrence?: { startsAt: string; endsAt: string } | null;
};

/** Brouillon neuf (valeurs par défaut des docs) ou prérempli depuis un événement existant (modification). */
export function initialEventDraft(now: Date, event?: EventOrganizer): EventDraft {
  if (!event) {
    return {
      format: "gathering",
      title: "",
      description: "",
      startsAt: "",
      endsAt: "",
      multiDay: false,
      days: [],
      dayAccess: "both",
      addressLine: "",
      postalCode: "",
      city: "",
      lat: null,
      lng: null,
      vehicleTypes: ["car"],
      maxVehiclesPerUser: "1",
      unlimited: true,
      capacity: "",
      vendorTypes: [],
      shopEnabled: false,
      publicAccess: "free",
      externalTicketUrl: "",
      paymentMode: "link",
      admission: "filtered",
      categoryIds: [],
      makeIds: [],
      countries: [],
      criteriaText: "",
      registrationsOpenAt: toWallInput(now),
      previewHours: "24",
      highGradePriority: false,
      highGradePreviewHours: "0",
      highGradeMin: "circuit",
      lockOffsetMinutes: "120",
      rulesText: defaultEventRules,
      instructions: "",
      zones: [],
      entranceNote: "",
      needs: [],
      recurrence: null,
    };
  }
  return {
    format: event.format,
    title: event.title,
    description: event.description ?? "",
    startsAt: toWallInput(event.startsAt),
    endsAt: toWallInput(event.endsAt),
    multiDay: event.days.length > 1,
    days: event.days.map((day) => ({
      date: day.date,
      startTime: toWallInput(day.startsAt).slice(11, 16),
      endTime: toWallInput(day.endsAt).slice(11, 16),
      capacity: day.capacity === null ? "" : String(day.capacity),
    })),
    dayAccess: event.days.length > 1 ? event.dayAccess : "both",
    addressLine: event.addressLine ?? "",
    postalCode: event.postalCode ?? "",
    city: event.city ?? "",
    lat: event.lat,
    lng: event.lng,
    vehicleTypes: event.admittedVehicleTypes,
    maxVehiclesPerUser: String(event.maxVehiclesPerUser),
    unlimited: event.capacity === null,
    capacity: event.capacity === null ? "" : String(event.capacity),
    vendorTypes: event.vendorTypes,
    shopEnabled: event.shopEnabled,
    publicAccess: event.publicAccess,
    externalTicketUrl: event.externalTicketUrl ?? "",
    paymentMode: event.publicAccess === "paid_external" && !event.externalTicketUrl ? "on_site" : "link",
    admission: event.admission,
    categoryIds: event.criteria?.categoryIds ?? [],
    makeIds: event.criteria?.makeIds ?? [],
    countries: event.criteria?.countries ?? [],
    criteriaText: event.criteria?.text ?? "",
    registrationsOpenAt: toWallInput(event.registrationsOpenAt),
    previewHours: String(event.previewHours),
    highGradePriority: event.highGradePriority,
    highGradePreviewHours: String(event.highGradePreviewHours),
    highGradeMin: event.highGradeMin,
    lockOffsetMinutes: String(
      event.lockAt ? Math.round((new Date(event.startsAt).getTime() - new Date(event.lockAt).getTime()) / 60_000) : 120,
    ),
    rulesText: event.rulesText ?? "",
    instructions: event.instructions ?? "",
    zones: event.zones.map((z) => ({
      id: z.id,
      code: z.code,
      name: z.name,
      capacity: z.capacity ? String(z.capacity) : "",
    })),
    arrivals: event.arrivals,
    entranceNote: event.entranceNote ?? "",
    needs: [],
    recurrence: null,
    poster: event.posterSettings
      ? {
          photoKey: event.posterSettings.photoKey,
          style: event.posterSettings.style,
          title: event.posterSettings.title,
        }
      : null,
  };
}

function arrivalsProblemCode(d: EventDraft) {
  if (!d.arrivals) return null;
  const startsAt = draftStart(d);
  const days = sortedDraftDays(d);
  const last = days[days.length - 1];
  const endsAt = d.multiDay && last ? fromWallInput(`${last.date}T${last.endTime}`) : fromWallInput(d.endsAt);
  if (!startsAt || !endsAt) return null;
  return validateArrivals({ arrivals: d.arrivals, startsAt: new Date(startsAt), endsAt: new Date(endsAt) });
}

/** Lot 47 : le problème des créneaux d'arrivée du brouillon (mêmes règles que l'API), ou `null`. */
export function eventArrivalsProblem(d: EventDraft): string | null {
  const problem = arrivalsProblemCode(d);
  return problem ? arrivalProblems[problem] : null;
}

/**
 * Horaires changés avant le temps « Les arrivées » (correction du lot 53) : un créneau des exposants qui ne commence
 * plus avant la fin de l'événement ferait refuser tout l'enregistrement par l'API, sans pouvoir avancer jusqu'au temps
 * qui le corrige. Il est retiré (`cleared` le dit, pour prévenir) ; c'est la seule règle des créneaux qui dépend des
 * horaires de l'événement.
 */
export function withArrivalsInHours(d: EventDraft): { draft: EventDraft; cleared: (keyof Arrivals)[] } {
  if (!d.arrivals || arrivalsProblemCode(d) !== "exhibitors_after_event") return { draft: d, cleared: [] };
  return { draft: withArrivalSlot(d, "exhibitors", null), cleared: ["exhibitors"] };
}

/** Titre de l'événement (première étape). */
export function eventTitleProblem(d: EventDraft): string | null {
  return d.title.trim().length < 3 ? "Donne un titre d'au moins 3 caractères." : null;
}

/** Dates : un début et une fin, ou au moins deux jours complets (lot 26). */
export function eventDatesProblem(d: EventDraft): string | null {
  if (d.multiDay) {
    if (d.days.length < 2) return "Un événement sur plusieurs jours a au moins deux jours.";
    if (d.days.some((x) => !x.date || !x.startTime || !x.endTime))
      return "Indique la date et les horaires de chaque jour.";
    if (d.days.some((x) => !fromWallInput(`${x.date}T${x.startTime}`) || !fromWallInput(`${x.date}T${x.endTime}`)))
      return "Une date ou une heure est illisible (AAAA-MM-JJ, HH:MM).";
    if (new Set(d.days.map((x) => x.date)).size !== d.days.length) return "Deux jours ont la même date.";
    if (d.days.some((x) => x.capacity !== "" && !(Number(x.capacity) > 0)))
      return "Places d'un jour : un nombre supérieur à zéro, ou vide.";
    return null;
  }
  const start = fromWallInput(d.startsAt);
  const end = fromWallInput(d.endsAt);
  if (!start || !end) return "Indique le début et la fin.";
  if (new Date(end) <= new Date(start)) return "La fin doit suivre le début.";
  return null;
}

/** Adresse obligatoire (lot 36) : adresse et ville. */
export function eventAddressProblem(d: Pick<EventDraft, "addressLine" | "city">): string | null {
  return d.addressLine.trim() && d.city.trim() ? null : eventAddressRequired;
}

/** L'ouverture des candidatures précède le début (sinon personne ne pourrait candidater). */
export function eventOpeningProblem(d: EventDraft): string | null {
  const opens = fromWallInput(d.registrationsOpenAt);
  if (!opens) return "Indique l'ouverture des inscriptions.";
  const first = d.multiDay ? sortedDraftDays(d)[0] : undefined;
  const start = first ? fromWallInput(`${first.date}T${first.startTime}`) : fromWallInput(d.startsAt);
  if (start && new Date(opens) >= new Date(start)) {
    return "L'ouverture des candidatures doit précéder le début de l'événement.";
  }
  return null;
}

/**
 * Copie d'un événement (duplication, lot 36) : quand on change le début, l'ouverture des candidatures se décale
 * d'autant, pour garder le même délai qu'à l'événement d'origine (au lieu de rester à la date reprise de l'original).
 */
export function withShiftedStart(d: EventDraft, startsAt: string): EventDraft {
  const before = fromWallInput(d.startsAt);
  const after = fromWallInput(startsAt);
  const opens = fromWallInput(d.registrationsOpenAt);
  if (!before || !after || !opens) return { ...d, startsAt };
  const shifted = new Date(new Date(opens).getTime() + (new Date(after).getTime() - new Date(before).getTime()));
  return { ...d, startsAt, registrationsOpenAt: toWallInput(shifted) };
}

/** Début effectif du brouillon (premier jour d'un événement sur plusieurs jours), en ISO, ou `null`. */
export function draftStart(d: EventDraft): string | null {
  const first = d.multiDay ? sortedDraftDays(d)[0] : undefined;
  return first ? fromWallInput(`${first.date}T${first.startTime}`) : fromWallInput(d.startsAt);
}

/**
 * Copie d'un événement (lot 36) : l'ouverture des candidatures garde le délai de l'original (`leadMs` avant le
 * début), quel que soit le début choisi (un jour ou plusieurs), jamais avant `now`.
 */
export function withCopyOpening(d: EventDraft, leadMs: number, now: Date): EventDraft {
  const start = draftStart(d);
  if (!start) return d;
  const opens = toWallInput(new Date(Math.max(now.getTime(), new Date(start).getTime() - leadMs)));
  return opens === d.registrationsOpenAt ? d : { ...d, registrationsOpenAt: opens };
}

/** Véhicules admis : au moins un type. */
export function eventVehiclesProblem(d: Pick<EventDraft, "vehicleTypes">): string | null {
  return d.vehicleTypes.length === 0 ? "Coche au moins un type de véhicule." : null;
}

/** Places : sans limite, ou un nombre supérieur à zéro. */
export function eventCapacityProblem(d: Pick<EventDraft, "unlimited" | "capacity">): string | null {
  return !d.unlimited && !(Number(d.capacity) > 0) ? "Indique un nombre de places supérieur à zéro." : null;
}

/** Entrée payante hors Orasso par lien : une adresse https. */
export function eventTicketLinkProblem(
  d: Pick<EventDraft, "publicAccess" | "paymentMode" | "externalTicketUrl">,
): string | null {
  return d.publicAccess === "paid_external" && d.paymentMode === "link" && !/^https?:\/\//i.test(d.externalTicketUrl)
    ? "Indique l'adresse de ta billetterie (https://…)."
    : null;
}

/** Zones : un code de 1 à 4 lettres ou chiffres, un nom, pas deux fois le même code. */
export function eventZonesProblem(d: Pick<EventDraft, "zones">): string | null {
  const codes = d.zones.map((z) => z.code.trim().toUpperCase());
  if (d.zones.some((z) => !/^[A-Z0-9]{1,4}$/.test(z.code.trim().toUpperCase()) || !z.name.trim())) {
    return "Chaque zone a un code de 1 à 4 lettres ou chiffres et un nom.";
  }
  return new Set(codes).size === codes.length ? null : "Deux zones ont le même code.";
}

/** Missions : un nombre de 1 à 9, une façade de 1 à 30 m ou vide, une heure « HH:MM » ou vide. */
export function eventNeedsProblem(d: Pick<EventDraft, "needs">): string | null {
  for (const n of d.needs ?? []) {
    const q = Number(n.quantity);
    if (!Number.isInteger(q) || q < 1 || q > EVENT_NEED_MAX_QUANTITY) {
      return `Mission : un nombre de 1 à ${EVENT_NEED_MAX_QUANTITY}.`;
    }
    const f = n.frontageM.trim();
    if (f && !(Number.isInteger(Number(f)) && Number(f) >= 1 && Number(f) <= 30)) {
      return "Mission : une façade de 1 à 30 mètres, ou rien.";
    }
    if (n.installTime.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(n.installTime.trim())) {
      return "Mission : une heure d'installation au format HH:MM, ou rien.";
    }
  }
  return null;
}

/** Récurrence : un rang (1er à 4e, dernier), un jour, de 1 à 12 dates après la première. */
export function eventRecurrenceProblem(d: Pick<EventDraft, "recurrence" | "multiDay">): string | null {
  const r = d.recurrence;
  if (!r) return null;
  if (d.multiDay) return "Un événement sur plusieurs jours ne se répète pas : choisis Ponctuel ou Récurrent.";
  if (![1, 2, 3, 4, -1].includes(r.nth) || r.weekday < 0 || r.weekday > 6) return "Choisis quand l'événement revient.";
  return Number.isInteger(r.count) && r.count >= 1 && r.count <= RECURRENCE_MAX_COUNT
    ? null
    : `De 1 à ${RECURRENCE_MAX_COUNT} dates après la première.`;
}

/**
 * Réglages d'affiche par défaut (style Minimal, titre de l'événement), posés quand on quitte le temps « Ton affiche »
 * sans y avoir touché : jamais au simple affichage du temps (relecture du lot 53 : un brouillon rouvert un instant sur
 * l'affiche n'en a pas pour autant).
 */
export function withDefaultPoster(d: EventDraft): EventDraft {
  if (d.poster) return d;
  return {
    ...d,
    poster: { photoKey: null, style: POSTER_DEFAULT_STYLE, title: d.title.trim().slice(0, POSTER_TITLE_MAX) },
  };
}

/** Affiche générée : un titre de 1 à 34 caractères. */
export function eventPosterProblem(d: Pick<EventDraft, "poster">): string | null {
  const title = d.poster?.title.trim() ?? null;
  if (title === null) return null;
  if (!title) return "Donne un titre à l'affiche.";
  return title.length > POSTER_TITLE_MAX ? `Titre de l'affiche : ${POSTER_TITLE_MAX} caractères au plus.` : null;
}

/** Le problème qui empêche de quitter un temps, ou `null`. Mêmes règles sur le site et dans l'appli. */
export function eventStepProblem(step: EventWizardStep, d: EventDraft): string | null {
  switch (step) {
    case "type":
      return (
        eventTitleProblem(d) ??
        eventDatesProblem(d) ??
        eventRecurrenceProblem(d) ??
        eventVehiclesProblem(d) ??
        eventCapacityProblem(d)
      );
    case "lieu":
      return eventAddressProblem(d) ?? eventZonesProblem(d) ?? eventNeedsProblem(d);
    case "arrivees":
      return eventArrivalsProblem(d) ?? eventTicketLinkProblem(d);
    case "avant-premiere":
      return eventOpeningProblem(d);
    case "affiche":
      return eventPosterProblem(d);
    default:
      return null;
  }
}

/** Premier temps en défaut avant l'enregistrement : `{ step, problem }`, ou `null` si tout est bon. */
export function firstEventProblem(d: EventDraft): { step: EventWizardStep; problem: string } | null {
  for (const step of eventWizardSteps) {
    const problem = eventStepProblem(step, d);
    if (problem) return { step, problem };
  }
  return null;
}

/**
 * Ce qui empêche de publier : un temps en défaut (`firstEventProblem`), ou pas encore d'affiche (le temps « Ton
 * affiche » n'a jamais été ouvert : ses réglages sont posés en l'ouvrant). « Brouillon » et l'enregistrement d'un
 * événement déjà publié n'exigent pas l'affiche (les événements d'avant le lot 47 n'en ont pas).
 */
export function eventPublishProblem(d: EventDraft): { step: EventWizardStep; problem: string } | null {
  return firstEventProblem(d) ?? (d.poster ? null : { step: "affiche", problem: wizardV2Labels.posterRequired });
}

/**
 * Le temps où rouvrir un brouillon (lot 53, « un brouillon rouvre l'assistant à son étape ») : jamais plus loin que le
 * temps le plus avancé atteint (`reached`, index gardé sur l'appareil), ni que le premier temps en défaut, ni que
 * « Ton affiche » tant qu'il n'y a pas d'affiche ; sinon « Tout est prêt ». Un événement publié rouvre sur le temps
 * demandé, sinon sur le premier.
 */
export function eventResumeStep(
  d: EventDraft,
  draft: boolean,
  wanted?: EventWizardStep | null,
  reached?: number | null,
): EventWizardStep {
  if (wanted) return wanted;
  if (!draft) return "type";
  const problem = eventWizardSteps.indexOf(eventPublishProblem(d)?.step ?? "publier");
  const cap = typeof reached === "number" && reached >= 0 ? reached : eventWizardSteps.length - 1;
  return eventWizardSteps[Math.min(problem, cap)] ?? "type";
}

/** Jours triés (lot 26). */
export const sortedDraftDays = (d: Pick<EventDraft, "days">) =>
  [...d.days].sort((a, b) => a.date.localeCompare(b.date));

/** Une date « AAAA-MM-JJ » complète et qui existe (pas une saisie en cours comme « 2026-1 »). */
export const isFullDate = (date: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const at = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === date;
};

/** Le lendemain d'une date complète ; une date incomplète (saisie au clavier en cours) est rendue telle quelle. */
const nextDate = (date: string) => {
  if (!isFullDate(date)) return date;
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

/**
 * Coche ou décoche « Plusieurs jours ». À la première coche, deux jours sont préremplis depuis le début saisi (le
 * lendemain aux mêmes heures).
 */
export function withMultiDay(d: EventDraft, multiDay: boolean, now: Date): EventDraft {
  if (!multiDay || d.days.length >= 2) return { ...d, multiDay };
  const start = d.startsAt || toWallInput(now);
  const date = start.slice(0, 10);
  const startTime = start.slice(11, 16) || "09:00";
  const endTime = d.endsAt.slice(11, 16) || "18:00";
  return {
    ...d,
    multiDay,
    days: [
      { date, startTime, endTime, capacity: "" },
      { date: nextDate(date), startTime, endTime, capacity: "" },
    ],
  };
}

/** Ajoute un jour : le lendemain du dernier, aux mêmes heures. */
export function withAddedDay(d: EventDraft, now: Date): EventDraft {
  const last = d.days[d.days.length - 1];
  return {
    ...d,
    days: [
      ...d.days,
      {
        date: nextDate(last?.date || now.toISOString().slice(0, 10)),
        startTime: last?.startTime ?? "09:00",
        endTime: last?.endTime ?? "18:00",
        capacity: "",
      },
    ],
  };
}

/**
 * Dates envoyées avec l'événement. Plusieurs jours : à la création, les bornes approchées (le serveur les recalcule
 * exactement à l'enregistrement des jours) ; à la modification, rien (elles se règlent jour par jour).
 */
export function eventDraftDates(
  d: EventDraft,
  editingMultiDay: boolean,
): { startsAt?: string | null; endsAt?: string | null } {
  if (!d.multiDay) return { startsAt: fromWallInput(d.startsAt), endsAt: fromWallInput(d.endsAt) };
  if (editingMultiDay) return {};
  const days = sortedDraftDays(d);
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return {};
  const startsAt = fromWallInput(`${first.date}T${first.startTime}`);
  let endsAt = fromWallInput(`${last.date}T${last.endTime}`);
  if (startsAt && endsAt && endsAt <= startsAt) endsAt = new Date(Date.parse(startsAt) + 3_600_000).toISOString();
  return { startsAt, endsAt };
}

/** Corps de `PUT /events/:id/days` : liste vide pour un événement d'un jour. */
export function eventDaysPayload(d: EventDraft) {
  return {
    dayAccess: d.multiDay ? d.dayAccess : undefined,
    days: d.multiDay
      ? sortedDraftDays(d).map((x) => ({
          date: x.date,
          startTime: x.startTime,
          endTime: x.endTime,
          capacity: Number(x.capacity) > 0 ? Number(x.capacity) : null,
        }))
      : [],
  };
}

/**
 * Corps de `POST /structures/:id/events` ou `PATCH /events/:id`. `editingMultiDay` : événement existant sur plusieurs
 * jours, sans dates dans le PATCH (les jours fixent les bornes, et une seule notification « Événement modifié » part,
 * celle des jours : correctif du lot 26).
 */
export function eventPayload(d: EventDraft, editingMultiDay = false) {
  return {
    title: d.title.trim(),
    description: d.description.trim() || null,
    format: d.format,
    ...eventDraftDates(d, editingMultiDay),
    addressLine: d.addressLine.trim() || null,
    postalCode: d.postalCode.trim() || null,
    city: d.city.trim() || null,
    ...(d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : {}),
    admittedVehicleTypes: d.vehicleTypes,
    capacity: d.unlimited ? null : Number(d.capacity),
    maxVehiclesPerUser: Math.max(1, Number(d.maxVehiclesPerUser) || 1),
    admission: d.admission,
    criteria:
      d.admission === "filtered"
        ? {
            categoryIds: d.categoryIds,
            makeIds: d.makeIds,
            countries: d.countries,
            text: d.criteriaText.trim() || null,
          }
        : null,
    publicAccess: d.publicAccess,
    externalTicketUrl:
      d.publicAccess === "paid_external" && d.paymentMode === "link" ? d.externalTicketUrl.trim() : null,
    registrationsOpenAt: fromWallInput(d.registrationsOpenAt),
    previewHours: Number(d.previewHours),
    highGradePriority: d.highGradePriority,
    highGradePreviewHours: Number(d.highGradePreviewHours),
    highGradeMin: d.highGradeMin,
    lockOffsetMinutes: Number(d.lockOffsetMinutes),
    rulesText: d.rulesText.trim() || null,
    instructions: d.instructions.trim() || null,
    entranceNote: d.entranceNote?.trim() || null,
    vendorTypes: d.vendorTypes,
    shopEnabled: d.shopEnabled,
    // Lot 47 : envoyés seulement quand le brouillon les porte (sinon l'API garde ce qui est enregistré).
    ...(d.arrivals !== undefined ? { arrivals: d.arrivals } : {}),
    ...(d.poster !== undefined ? { poster: d.poster } : {}),
  };
}

/** Une zone telle que l'API l'attend (code en majuscules, places facultatives, position = ordre de saisie). */
export type ZonePayload = { code: string; name: string; capacity: number | null; position: number };

/**
 * Zones à retirer, modifier et créer par rapport à l'état enregistré (`saved` : les zones de l'événement avant
 * l'enregistrement, vide à la création).
 */
export function zoneChanges(
  saved: readonly Pick<EventZone, "id">[],
  zones: readonly ZoneDraft[],
): { remove: string[]; update: { id: string; zone: ZonePayload }[]; create: ZonePayload[] } {
  const kept = new Set(zones.map((z) => z.id).filter(Boolean));
  const remove = saved.filter((z) => !kept.has(z.id)).map((z) => z.id);
  const update: { id: string; zone: ZonePayload }[] = [];
  const create: ZonePayload[] = [];
  for (const [position, z] of zones.entries()) {
    const zone = {
      code: z.code.trim().toUpperCase(),
      name: z.name.trim(),
      capacity: Number(z.capacity) > 0 ? Number(z.capacity) : null,
      position,
    };
    if (z.id) update.push({ id: z.id, zone });
    else create.push(zone);
  }
  return { remove, update, create };
}

/** Choix « Avant-première des abonnés ». */
export const previewHourOptions = [
  { value: "0", label: "Aucune" },
  { value: "24", label: "24 h avant (par défaut)" },
  { value: "48", label: "48 h avant" },
  { value: "72", label: "72 h avant" },
] as const;

/** Choix de l'avant-première supplémentaire des hauts grades. */
export const highGradePreviewOptions = [
  { value: "0", label: "Aucune" },
  { value: "24", label: "24 h avant" },
  { value: "48", label: "48 h avant" },
  { value: "72", label: "72 h avant" },
] as const;

/** Choix « Verrouillage des inscriptions ». */
export const lockOffsetOptions = [
  { value: "0", label: "Au début de l'événement" },
  { value: "60", label: "1 h avant" },
  { value: "120", label: "2 h avant (par défaut)" },
  { value: "180", label: "3 h avant" },
  { value: "360", label: "6 h avant" },
  { value: "1440", label: "24 h avant" },
] as const;

// --- Assistant en huit temps (lot 53) ---------------------------------------------------------------------------

/** Ponctuel, récurrent ou plusieurs jours (« Combien de fois ? »). */
export type EventKind = "one" | "rec" | "multi";

export const eventKindOf = (d: Pick<EventDraft, "multiDay" | "recurrence">): EventKind =>
  d.multiDay ? "multi" : d.recurrence ? "rec" : "one";

/** Récurrence par défaut : le 1er dimanche de chaque mois, six dates de plus. */
export const defaultRecurrence: RecurrenceDraft = { nth: 1, weekday: 0, count: 6 };

/** Date (« AAAA-MM-JJ ») de la première occurrence de la règle à partir de `from` (heure de Paris), ou `null`. */
export function firstRecurrenceDate(r: RecurrenceDraft, from: Date): string | null {
  const w = wallTime(from);
  for (let i = 0; i < 14; i++) {
    const month = ((w.month - 1 + i) % 12) + 1;
    const year = w.year + Math.floor((w.month - 1 + i) / 12);
    const day = nthWeekdayOfMonth(year, month, r.nth, r.weekday);
    if (day === null || (i === 0 && day < w.day)) continue;
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  return null;
}

/**
 * Passe d'un type à l'autre : « Plusieurs jours » prérempli comme avant (`withMultiDay`) ; « Récurrent » cale le début
 * sur la première date de la règle, aux heures déjà saisies (19:00 – 23:30 par défaut).
 */
export function withEventKind(d: EventDraft, kind: EventKind, now: Date): EventDraft {
  if (kind === "rec" && d.recurrence && !d.multiDay) return d;
  // Quitter « Récurrent » rend les dates saisies avant (la règle les avait calées sur sa première date).
  const before = d.recurrence ? d.datesBeforeRecurrence : null;
  const back = { ...d, ...(before ?? {}), recurrence: null, datesBeforeRecurrence: null };
  if (kind === "multi") return withMultiDay(back, true, now);
  const single = { ...back, multiDay: false };
  if (kind === "one") return single;
  return withRecurrence(
    { ...single, datesBeforeRecurrence: { startsAt: single.startsAt, endsAt: single.endsAt } },
    defaultRecurrence,
    now,
  );
}

/** Change la règle et recale le début et la fin sur sa première date (heures gardées). */
export function withRecurrence(d: EventDraft, r: RecurrenceDraft, now: Date): EventDraft {
  const date = firstRecurrenceDate(r, now);
  const start = d.startsAt.slice(11, 16) || "19:00";
  const end = d.endsAt.slice(11, 16) || "23:30";
  return date ? withSingleDate({ ...d, recurrence: r }, { date, start, end }) : { ...d, recurrence: r };
}

/**
 * Ponctuel ou récurrent : une date, une heure de début, une heure de fin (« Début 19:00 › Fin 23:30 »). Une fin à une
 * heure plus petite que le début passe minuit (nocturne) : elle tombe le lendemain.
 */
export function withSingleDate(d: EventDraft, change: { date?: string; start?: string; end?: string }): EventDraft {
  const date = change.date ?? d.startsAt.slice(0, 10);
  const start = change.start ?? d.startsAt.slice(11, 16);
  const end = change.end ?? d.endsAt.slice(11, 16);
  const endDate = date && start && end && end <= start ? nextDate(date) : date;
  return {
    ...d,
    startsAt: date || start ? `${date}T${start}` : "",
    endsAt: date || end ? `${endDate}T${end}` : "",
  };
}

/** Règle envoyée à `POST /events/:id/recurrence`. */
export const recurrenceRuleOf = (r: RecurrenceDraft): RecurrenceRule => ({
  kind: "monthly_nth_weekday",
  nth: r.nth,
  weekday: r.weekday,
  count: r.count,
});

/** Toutes les dates de la série (la première comprise), pour « Prochaines dates » et « Jusqu'au ». */
export function recurrenceDates(d: EventDraft): Date[] {
  const start = fromWallInput(d.startsAt);
  const end = fromWallInput(d.endsAt);
  if (!d.recurrence || !start || !end) return [];
  return [
    new Date(start),
    ...recurrenceOccurrences(new Date(start), new Date(end), recurrenceRuleOf(d.recurrence)).map((o) => o.startsAt),
  ];
}

/** Frise de l'avant-première : ouverture aux abonnés (si avant-première), ouverture à tous, début. */
export function previewTimeline(d: EventDraft): {
  subscribers: string | null;
  everyone: string | null;
  start: string | null;
} {
  const everyone = fromWallInput(d.registrationsOpenAt);
  const hours = Number(d.previewHours);
  return {
    subscribers: everyone && hours > 0 ? new Date(Date.parse(everyone) - hours * 3_600_000).toISOString() : null,
    everyone,
    start: draftStart(d),
  };
}

/** « 4 lignes · 231 caractères » : lignes non vides et caractères du règlement. */
export function rulesCount(text: string): { lines: number; chars: number } {
  return { lines: text.split("\n").filter((l) => l.trim()).length, chars: text.trim().length };
}

/**
 * Un modèle ou « Reprendre le dernier » remplacerait-il un règlement saisi ? Pas si le champ est vide, encore le modèle
 * prérempli, ou déjà ce texte (relecture du lot 53 : sinon, on demande).
 */
export function rulesReplaceNeedsConfirm(current: string, next: string): boolean {
  const text = current.trim();
  return Boolean(text) && text !== next.trim() && text !== defaultEventRules.trim();
}

/** Créneau par défaut quand on en fixe un : exposants 18:30 – 19:15 strict, public 19:30 – 23:00 recommandé. */
export function defaultArrivalSlot(which: keyof Arrivals): ArrivalSlot {
  return which === "exhibitors"
    ? { from: "18:30", to: "19:15", strict: true, note: null }
    : { from: "19:30", to: "23:00", strict: false, note: null };
}

/** Pose, modifie (`patch`) ou retire (`null`) un créneau du brouillon. */
export function withArrivalSlot(d: EventDraft, which: keyof Arrivals, slot: ArrivalSlot | null): EventDraft {
  const arrivals: Arrivals = { exhibitors: d.arrivals?.exhibitors ?? null, public: d.arrivals?.public ?? null };
  return { ...d, arrivals: { ...arrivals, [which]: slot } };
}

const lowerStyle = (label: string) => (label === label.toUpperCase() ? label : label.toLowerCase());
const joinFr = (items: string[], word: "et" | "ou") =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;

/**
 * Phrase récapitulative des trois questions (`s-create`, « Qui peut venir ? ») : « Tu acceptes les japonaises et les
 * allemandes, de style JDM ou sportive, toutes marques. » Une question laissée vide accepte tout.
 */
export function summaryOfCriteria(criteria: {
  countries: readonly string[];
  styles: readonly string[];
  makes: readonly string[];
}): string {
  const origins = criteriaOrigins.filter((o) => criteria.countries.includes(o.code)).map((o) => `les ${o.plural}`);
  const who = origins.length ? joinFr(origins, "et") : "tous les véhicules";
  const styles = criteria.styles.length ? `de style ${joinFr(criteria.styles.map(lowerStyle), "ou")}` : "tous styles";
  const makes = criteria.makes.length ? `de marque ${joinFr([...criteria.makes], "ou")}` : "toutes marques";
  return `Tu acceptes ${who}, ${styles}, ${makes}.`;
}

/**
 * Catégories proposées à « Quels styles ? » : toutes, sauf celles qui ne disent qu'une origine (« Allemande »,
 * « Française »… : la première question les couvre) ; une catégorie déjà choisie reste affichée.
 */
export function styleCategories<T extends { id: string; label: string }>(
  categories: readonly T[],
  selected: readonly string[],
): T[] {
  return categories.filter((c) => selected.includes(c.id) || !criteriaOrigins.some((o) => o.chip === c.label));
}

/**
 * Instant d'installation d'une mission : l'heure placée comme un créneau d'arrivée (le jour de l'événement, ou le
 * lendemain après minuit), puis décalée de `day` jours.
 */
function installInstant(time: string, day: number | undefined, start: string): Date | null {
  const base = arrivalInstant(time, new Date(start));
  if (!base || !day) return base;
  return fromWallTime(addDays(wallTime(base), day));
}

/**
 * Missions enregistrées → lignes du volet « Sur place ». `start` : début de l'événement (ISO), pour garder le jour de
 * l'installation (`installDay`) ; sans lui, seule l'heure est reprise.
 */
export function needsFromSaved(saved: readonly EventNeedView[], start?: string | null): NeedDraft[] {
  return [...saved]
    .sort((a, b) => a.position - b.position)
    .map((n) => {
      const installTime = n.installAt ? toWallInput(n.installAt).slice(11, 16) : "";
      const base = n.installAt && start ? arrivalInstant(installTime, new Date(start)) : null;
      const installDay = base && n.installAt ? calendarDaysBetween(base, new Date(n.installAt)) : 0;
      return {
        id: n.id,
        trade: n.trade,
        quantity: String(n.quantity),
        power: n.power,
        water: n.water,
        frontageM: n.frontageM === null ? "" : String(n.frontageM),
        installTime,
        ...(installDay ? { installDay } : {}),
      };
    });
}

/** Une mission telle que l'API l'attend (`eventNeedSchema`). */
export type NeedPayload = {
  trade: VendorTypeCode;
  quantity: number;
  power: ProviderPower;
  water: boolean;
  frontageM: number | null;
  installAt: string | null;
  position: number;
};

/**
 * Une mission a-t-elle changé ? Sans ses valeurs enregistrées (seul l'identifiant est connu), on la renvoie. L'API
 * limite les écritures (`proWrite`) : l'assistant, qui enregistre à chaque temps, n'envoie que ce qui change.
 */
function changedNeed(saved: Partial<EventNeedView> | undefined, need: NeedPayload): boolean {
  if (!saved || saved.trade === undefined) return true;
  const at = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);
  return (
    saved.trade !== need.trade ||
    saved.quantity !== need.quantity ||
    saved.power !== need.power ||
    saved.water !== need.water ||
    (saved.frontageM ?? null) !== need.frontageM ||
    at(saved.installAt) !== at(need.installAt) ||
    saved.position !== need.position
  );
}

/**
 * Missions à retirer, modifier (seulement si elles ont changé) et créer par rapport aux missions enregistrées (comme
 * `zoneChanges`). L'heure d'installation se place le jour de l'événement (après minuit pour une nocturne, comme les
 * créneaux d'arrivée).
 */
export function needChanges(
  saved: readonly (Pick<EventNeedView, "id"> & Partial<EventNeedView>)[],
  d: EventDraft,
): { remove: string[]; update: { id: string; need: NeedPayload }[]; create: NeedPayload[] } {
  const needs = d.needs ?? [];
  const start = draftStart(d);
  const kept = new Set(needs.map((n) => n.id).filter(Boolean));
  const remove = saved.filter((n) => !kept.has(n.id)).map((n) => n.id);
  const update: { id: string; need: NeedPayload }[] = [];
  const create: NeedPayload[] = [];
  for (const [position, n] of needs.entries()) {
    const at = start && n.installTime.trim() ? installInstant(n.installTime.trim(), n.installDay, start) : null;
    const need: NeedPayload = {
      trade: n.trade,
      quantity: Number(n.quantity),
      power: n.power,
      water: n.water,
      frontageM: n.frontageM.trim() ? Number(n.frontageM) : null,
      installAt: at ? at.toISOString() : null,
      position,
    };
    if (!n.id) create.push(need);
    else if (
      changedNeed(
        saved.find((s) => s.id === n.id),
        need,
      )
    )
      update.push({ id: n.id, need });
  }
  return { remove, update, create };
}

// --- Enregistrement à chaque temps : réconciliation (corrections des relectures du lot 53) -----------------------

/** Propres à la saisie : le serveur ne les garde pas ; ils restent ceux de la saisie après un enregistrement. */
const draftOnlyKeys = ["recurrence", "datesBeforeRecurrence"] as const satisfies readonly (keyof EventDraft)[];

/** L'événement enregistré vu comme un brouillon (ce que le serveur garde vraiment), missions comprises. */
export function serverDraft(event: EventOrganizer, needs: readonly EventNeedView[]): EventDraft {
  return { ...initialEventDraft(new Date(event.startsAt), event), needs: needsFromSaved(needs, event.startsAt) };
}

/**
 * Ce que l'API a refusé pendant un enregistrement : lignes du brouillon envoyé (index = `position` du corps), nombre de
 * suppressions refusées, affiche perso non envoyée.
 */
export type SaveRefusals = { zones: number[]; needs: number[]; removals: number; poster: boolean };

export const noRefusals = (): SaveRefusals => ({ zones: [], needs: [], removals: 0, poster: false });

export const hasRefusals = (r: SaveRefusals) => r.zones.length > 0 || r.needs.length > 0 || r.removals > 0 || r.poster;

/** « Brouillon enregistré, sauf la zone JDM, la mission 2 : … » (lignes du brouillon envoyé). */
export function refusalMessage(sent: EventDraft, r: SaveRefusals): string {
  const L = wizardV2Labels;
  const what = [
    ...r.zones.map((i) => L.refusedZone(sent.zones[i]?.code.trim().toUpperCase() ?? "")),
    ...r.needs.map((i) => L.refusedMission(i + 1)),
    ...(r.removals ? [L.refusedRemoval] : []),
    ...(r.poster ? [L.refusedPoster] : []),
  ];
  return L.savedRefused(what);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Lignes envoyées → lignes relues : la version du serveur (identifiant d'une ligne créée compris), la ligne envoyée si
 * l'API l'a refusée, `null` si elle n'existe plus côté serveur. Une ligne créée se retrouve parmi les lignes relues
 * qu'aucune ligne envoyée ne portait, dans l'ordre (`match` : même code de zone, même métier de mission).
 */
function rowsAfterSave<T extends { id?: string }>(
  sent: readonly T[],
  server: readonly T[],
  refused: ReadonlySet<number>,
  match: (sent: T, server: T) => boolean,
): (T | null)[] {
  const sentIds = new Set(sent.map((r) => r.id).filter(Boolean));
  const fresh = server.filter((s) => !sentIds.has(s.id));
  const claimed = new Set<T>();
  return sent.map((row, i) => {
    if (refused.has(i)) return row;
    if (row.id) return server.find((s) => s.id === row.id) ?? null;
    const created = fresh.find((s) => !claimed.has(s) && match(row, s));
    if (!created) return row;
    claimed.add(created);
    return created;
  });
}

/**
 * Lignes après l'enregistrement, avec la saisie faite pendant l'envoi : inchangée, la version relue ; modifiée, la
 * saisie est gardée (une ligne créée garde son nouvel identifiant, pour ne pas être créée deux fois).
 */
function mergeRows<T extends { id?: string }>(sent: readonly T[], current: readonly T[], next: (T | null)[]): T[] {
  if (current === sent || same(current, sent)) return next.filter((r): r is T => r !== null);
  return current.map((row, i) => {
    const j = sent.indexOf(row);
    if (j >= 0) return next[j] ?? row;
    const created = current.length === sent.length && !row.id && !sent[i]?.id ? next[i]?.id : undefined;
    return created ? { ...row, id: created } : row;
  });
}

/**
 * Après un enregistrement (à chaque temps), la saisie et l'état relu du serveur, champ par champ : ce que le serveur a
 * changé (métiers ajoutés par une mission, adresse géocodée, valeurs ramenées à leur forme enregistrée) remplace la
 * saisie envoyée ; ce qu'il a refusé (zones, missions) reste dans la saisie ; ce qui a été tapé pendant l'envoi est
 * gardé. `pristine` : ce qui est vraiment enregistré (la récurrence, propre à la saisie, comptée comme gardée sur
 * l'appareil) ; la saisie en diffère tant que quelque chose reste à renvoyer.
 */
export function reconcileDraft(input: {
  /** Le brouillon envoyé. */
  sent: EventDraft;
  /** La saisie au retour de l'enregistrement (identique à `sent` si rien n'a été tapé entre-temps). */
  current: EventDraft;
  /** L'événement relu (`serverDraft`). */
  server: EventDraft;
  refused?: SaveRefusals;
}): { draft: EventDraft; pristine: EventDraft } {
  const { sent, current, server } = input;
  const refused = input.refused ?? noRefusals();
  const zones = rowsAfterSave(
    sent.zones,
    server.zones,
    new Set(refused.zones),
    (a, b) => a.code.trim().toUpperCase() === b.code,
  );
  const needs = rowsAfterSave(
    sent.needs ?? [],
    server.needs ?? [],
    new Set(refused.needs),
    (a, b) => a.trade === b.trade,
  );
  const draft: EventDraft = { ...server };
  const own = draft as Record<string, unknown>;
  for (const key of Object.keys(current) as (keyof EventDraft)[]) {
    if (key === "zones" || key === "needs") continue;
    const local = (draftOnlyKeys as readonly string[]).includes(key);
    if (local || !same(current[key], sent[key])) own[key] = current[key];
  }
  draft.zones = mergeRows(sent.zones, current.zones, zones);
  draft.needs = mergeRows(sent.needs ?? [], current.needs ?? [], needs);
  const pristine: EventDraft = { ...server };
  for (const key of draftOnlyKeys) {
    if (current[key] !== undefined) (pristine as Record<string, unknown>)[key] = current[key];
  }
  return { draft, pristine };
}

// --- Missions chargées après l'ouverture, écritures gardées après une panne (correctif 53c) ----------------------

/**
 * Missions enregistrées, arrivées après l'ouverture de l'assistant : ajoutées à la saisie **quels que soient les autres
 * champs** (un titre tapé avant leur arrivée ne les fait pas oublier, sinon l'enregistrement suivant les supprimerait).
 * Les lignes déjà connues (avec identifiant) sont remplacées par la version chargée ; une ligne ajoutée entre-temps
 * (sans identifiant) est gardée après elles. Appliquée deux fois, elle donne le même résultat.
 */
export function withLoadedNeeds(current: EventDraft, loaded: readonly NeedDraft[]): EventDraft {
  const typed = (current.needs ?? []).filter((n) => !n.id);
  return { ...current, needs: [...loaded, ...typed] };
}

/**
 * Écritures de missions réussies pendant un enregistrement interrompu ensuite (relecture finale en échec, réseau) :
 * créations (`position` : ligne du brouillon envoyé, `need` : la mission créée, avec son identifiant) et suppressions.
 */
export type NeedWrites = { created: { position: number; need: EventNeedView }[]; removed: string[] };

export const noNeedWrites = (): NeedWrites => ({ created: [], removed: [] });

/**
 * Avant de retenter un enregistrement interrompu : les missions créées prennent leur identifiant dans la saisie (elles
 * ne seront pas recréées) et rejoignent les missions enregistrées ; les missions supprimées en sortent (la suppression
 * n'est pas renvoyée). `sent` : le brouillon envoyé ; `current` : la saisie au retour (tapée pendant l'envoi comprise).
 */
export function afterNeedWrites(input: {
  savedNeeds: readonly EventNeedView[];
  sent: EventDraft;
  current: EventDraft;
  writes: NeedWrites;
}): { savedNeeds: EventNeedView[]; draft: EventDraft } {
  const { sent, current, writes } = input;
  const removed = new Set(writes.removed);
  const savedNeeds = [...input.savedNeeds.filter((n) => !removed.has(n.id)), ...writes.created.map((c) => c.need)];
  const needs = [...(current.needs ?? [])];
  const claimed = new Set<number>();
  for (const { position, need } of writes.created) {
    const row = sent.needs?.[position];
    if (!row) continue;
    const j = needs.findIndex((n, k) => !claimed.has(k) && !n.id && same(n, row));
    if (j < 0) continue;
    claimed.add(j);
    needs[j] = { ...needs[j], id: need.id } as NeedDraft;
  }
  return { savedNeeds, draft: { ...current, needs } };
}

/** Deux brouillons identiques (l'ordre des champs ne compte pas ; un champ absent vaut un champ `undefined`). */
export function sameDraft(a: EventDraft, b: EventDraft): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof EventDraft>;
  for (const key of keys) if (!same(a[key], b[key])) return false;
  return true;
}

// --- Mémoire de l'assistant sur l'appareil, par événement -------------------------------------------------------

/**
 * Ce que l'appareil retient d'un événement en cours de création (correction du lot 53) : le temps le plus avancé
 * atteint (`reached`, pour rouvrir le brouillon où on l'a laissé ; -1 inconnu) et la récurrence choisie (le serveur ne
 * la garde qu'une fois la série créée, à la fin : elle n'est jamais effacée avant).
 */
export type WizardMemo = { reached: number; recurrence: RecurrenceDraft | null };

export const serializeWizardMemo = (memo: WizardMemo) =>
  JSON.stringify({ v: 1, steps: eventWizardSteps.length, ...memo });

/** Relit la mémoire (`null` si absente ou abîmée) ; un index d'un autre découpage est ignoré. */
export function parseWizardMemo(raw: string | null | undefined): WizardMemo | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { v?: unknown; steps?: unknown; reached?: unknown; recurrence?: unknown } | null;
    if (value?.v !== 1) return null;
    const r = value.recurrence as Partial<RecurrenceDraft> | null | undefined;
    const recurrence =
      r && typeof r.nth === "number" && typeof r.weekday === "number" && typeof r.count === "number"
        ? { nth: r.nth, weekday: r.weekday, count: r.count }
        : null;
    return { reached: storedStepIndex(value.steps, value.reached) ?? -1, recurrence };
  } catch {
    return null;
  }
}

/**
 * Index de temps gardé avec une saisie : valable seulement s'il a été écrit avec le découpage actuel (`steps` = 8) ;
 * sinon `null` (ancien brouillon à douze étapes : on rouvre au temps calculé).
 */
export function storedStepIndex(steps: unknown, index: unknown): number | null {
  if (steps !== eventWizardSteps.length || typeof index !== "number" || !Number.isInteger(index)) return null;
  return Math.min(Math.max(index, 0), eventWizardSteps.length - 1);
}
