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
import { defaultEventRules } from "./labels/events.fr";
import { type Arrivals, validateArrivals } from "./rules/arrival";
import { fromWallTime, wallTime } from "./rules/time";
import type { EventOrganizer, EventZone, PosterSettings } from "./schemas/event";

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

/** Les étapes de l'assistant du site, dans l'ordre (docs/02 « Espace organisateur »). */
export const eventWizardSteps = [
  "format",
  "vehicules",
  "places",
  "prestataires",
  "public",
  "admission",
  "criteres",
  "avant-premiere",
  "reglement",
  "infos",
  "zones",
  "billetterie",
] as const;
export type EventWizardStep = (typeof eventWizardSteps)[number];

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
   * Lot 47 : créneaux d'arrivée des exposants et du public (« HH:MM »). Facultatif : absent, rien n'est envoyé ; l'étape
   * qui les saisit (« Les arrivées ») vient avec l'assistant à 8 temps (lot 53).
   */
  arrivals?: Arrivals;
  /** Lot 47 : affiche générée (photo envoyée, style, titre de 34 caractères au plus). Facultatif comme `arrivals`. */
  poster?: PosterSettings | null;
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
    poster: event.posterSettings
      ? {
          photoKey: event.posterSettings.photoKey,
          style: event.posterSettings.style,
          title: event.posterSettings.title,
        }
      : null,
  };
}

/** Lot 47 : le problème des créneaux d'arrivée du brouillon (mêmes règles que l'API), ou `null`. */
export function eventArrivalsProblem(d: EventDraft): string | null {
  if (!d.arrivals) return null;
  const startsAt = draftStart(d);
  const days = sortedDraftDays(d);
  const last = days[days.length - 1];
  const endsAt = d.multiDay && last ? fromWallInput(`${last.date}T${last.endTime}`) : fromWallInput(d.endsAt);
  if (!startsAt || !endsAt) return null;
  const problem = validateArrivals({ arrivals: d.arrivals, startsAt: new Date(startsAt), endsAt: new Date(endsAt) });
  return problem ? arrivalProblems[problem] : null;
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

/** Le problème qui empêche de quitter une étape, ou `null`. Mêmes règles sur le site et dans l'appli. */
export function eventStepProblem(step: EventWizardStep, d: EventDraft): string | null {
  switch (step) {
    case "format":
      return eventTitleProblem(d) ?? eventDatesProblem(d) ?? eventAddressProblem(d);
    case "vehicules":
      return d.vehicleTypes.length === 0 ? "Coche au moins un type de véhicule." : null;
    case "places":
      return !d.unlimited && !(Number(d.capacity) > 0) ? "Indique un nombre de places supérieur à zéro." : null;
    case "public":
      return d.publicAccess === "paid_external" &&
        d.paymentMode === "link" &&
        !/^https?:\/\//i.test(d.externalTicketUrl)
        ? "Indique l'adresse de ta billetterie (https://…)."
        : null;
    case "avant-premiere":
      return eventOpeningProblem(d);
    case "zones": {
      const codes = d.zones.map((z) => z.code.trim().toUpperCase());
      if (d.zones.some((z) => !/^[A-Z0-9]{1,4}$/.test(z.code.trim().toUpperCase()) || !z.name.trim())) {
        return "Chaque zone a un code de 1 à 4 lettres ou chiffres et un nom.";
      }
      return new Set(codes).size === codes.length ? null : "Deux zones ont le même code.";
    }
    default:
      return null;
  }
}

/** Les critères n'existent qu'en admission sur filtration. */
export const eventStepSkipped = (step: EventWizardStep, d: Pick<EventDraft, "admission">) =>
  step === "criteres" && d.admission !== "filtered";

/** Première étape en défaut avant l'enregistrement : `{ step, problem }`, ou `null` si tout est bon. */
export function firstEventProblem(d: EventDraft): { step: EventWizardStep; problem: string } | null {
  for (const step of eventWizardSteps) {
    if (eventStepSkipped(step, d)) continue;
    const problem = eventStepProblem(step, d);
    if (problem) return { step, problem };
  }
  return null;
}

/** Jours triés (lot 26). */
export const sortedDraftDays = (d: Pick<EventDraft, "days">) =>
  [...d.days].sort((a, b) => a.date.localeCompare(b.date));

const nextDate = (date: string) => {
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
