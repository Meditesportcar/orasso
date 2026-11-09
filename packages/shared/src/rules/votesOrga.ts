// Votes à thème, côté organisateur (lot R7l2) : le brouillon d'un vote (feuille « Nouveau vote », identique sur le site et
// dans l'appli), sa validation, le corps envoyé à l'API, et les lignes d'état de l'écran « Votes » (« Ouvert · 34 voix ·
// ferme mardi à 23 h »). Fonctions pures : l'heure courante est passée en paramètre. Les règles de fond (état d'un vote,
// droits, ouverture, candidats) sont dans l'API et dans `votes.ts`, jamais ici.
import { fromWallInput, toWallInput } from "../eventWizard";
import { criteriaOrigins } from "../labels/event-editor.fr";
import { voteOrgaLabels as L } from "../labels/votes-orga.fr";
import { keepUnits } from "../labels/units.fr";
import type { VoteCreate } from "../schemas/votes";
import type { VoteManageItem } from "../schemas/votes";
import { withYear } from "./dateYear";
import {
  VOTE_DURATION_MAX,
  VOTE_DURATION_MIN,
  VOTE_TITLE_MAX,
  VOTE_TITLE_MIN,
  type VoteCandidateMode,
  type VoteOpenMode,
} from "./votes";
import { calendarDaysBetween, wallTime } from "./time";

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 23 h » ou « 23 h 30 » (heure de Paris), l'espace entre le nombre et l'unité insécable. */
export function voteClock(at: Date): string {
  const w = wallTime(at);
  return keepUnits(w.minute === 0 ? `${w.hour} h` : `${w.hour} h ${String(w.minute).padStart(2, "0")}`);
}

/**
 * Un instant dit à l'oral : « 23 h » le jour même, « mardi 23 h » dans les six jours, « 18 nov. 23 h » au-delà (avec
 * l'année quand ce n'est pas l'année en cours). `preposition` ajoute « à » : « ferme mardi à 23 h ».
 */
export function voteWhen(at: Date, now: Date, preposition = false): string {
  const diff = calendarDaysBetween(now, at);
  const w = wallTime(at);
  const clock = voteClock(at);
  const link = preposition ? " à " : " ";
  if (diff === 0) return preposition ? `à ${clock}` : `aujourd'hui ${clock}`;
  if (diff === 1) return `demain${link}${clock}`;
  if (diff > 1 && diff <= 6) {
    const weekday = WEEKDAYS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()] ?? "";
    return `${weekday}${link}${clock}`;
  }
  return `${withYear(`${w.day} ${MONTHS[w.month - 1]}`, at, now)}${link}${clock}`;
}

/** « 10 min », « 1 h », « 1 h 30 », « Jusqu'à la fin de l'événement ». */
export function voteDurationLabel(minutes: number | null): string {
  if (minutes === null) return "Jusqu'à la fin de l'événement";
  if (minutes < 60) return keepUnits(`${minutes} min`);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return keepUnits(m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`);
}

export type VoteStatusTone = "open" | "plan" | "ready" | "closed";
export type VoteStatus = {
  tone: VoteStatusTone;
  text: string;
  /** Le bouton « Lancer le vote » existe pour ce vote. */
  canLaunch: boolean;
  /** Ce qui empêche de le lancer maintenant (`null` : rien). Dit à côté du bouton, jamais un bouton grisé muet. */
  launchBlocked: string | null;
  canClose: boolean;
};

/** Contexte de l'écran : l'heure, l'état de publication de l'événement, et le droit d'écrire (le staff lit seulement). */
export type VoteStatusContext = { now: Date; published: boolean; canWrite: boolean };

/** La ligne d'état d'un vote et ses actions possibles (maquette R7.16). */
export function voteStatus(v: VoteManageItem, ctx: VoteStatusContext): VoteStatus {
  const none = { canLaunch: false, launchBlocked: null, canClose: false };
  if (v.state === "closed") {
    return { tone: "closed", text: `Clos · ${L.voiceCount(v.total)}`, ...none };
  }
  if (v.state === "open") {
    const ends = voteWhen(new Date(v.closesAt), ctx.now, true);
    return {
      tone: "open",
      text: `Ouvert · ${L.voiceCount(v.total)} · ferme ${ends}`,
      ...none,
      canClose: ctx.canWrite,
    };
  }
  // Prévu : se lance à la main (ou à l'heure, que l'on peut avancer) ; « dès les premières entrées » s'ouvre seul.
  const launchable = v.openMode !== "first_entry";
  if (!launchable) {
    return { tone: "plan", text: "Prévu · dès les premières entrées", ...none };
  }
  const blocked = !ctx.published ? L.notPublished : v.candidatesCount < 2 ? L.notEnough : null;
  const canLaunch = ctx.canWrite;
  if (v.openMode === "at" && v.opensAt) {
    return {
      tone: "plan",
      text: `Prévu · ${voteWhen(new Date(v.opensAt), ctx.now)}`,
      ...none,
      canLaunch,
      launchBlocked: canLaunch ? blocked : null,
    };
  }
  const detail = [
    v.candidateMode === "hand" ? `${v.candidatesCount} ${v.candidatesCount > 1 ? "voitures" : "voiture"}` : null,
    voteDurationLabel(v.durationMinutes),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    tone: blocked ? "plan" : "ready",
    text: blocked ? `À lancer · ${detail}` : `Prêt à lancer · ${detail}`,
    ...none,
    canLaunch,
    launchBlocked: canLaunch ? blocked : null,
  };
}

// --- Le brouillon d'un vote (feuille « Nouveau vote ») ----------------------------------------------------------------

export type VoteDurationChoice = "end" | "10" | "30" | "60" | "custom";

export type VoteDraft = {
  title: string;
  mode: VoteCandidateMode;
  countries: string[];
  makeIds: string[];
  zoneId: string;
  openMode: VoteOpenMode;
  /** Mode « à une heure fixée » : « AAAA-MM-JJTHH:MM », heure de Paris. */
  opensAt: string;
  duration: VoteDurationChoice;
  customMinutes: string;
};

export const emptyVoteDraft = (): VoteDraft => ({
  title: "",
  mode: "all",
  countries: [],
  makeIds: [],
  zoneId: "",
  openMode: "first_entry",
  opensAt: "",
  duration: "end",
  customMinutes: "",
});

type TemplateLike = {
  title: string;
  candidateMode: VoteCandidateMode;
  candidateFilter: { countries?: string[]; makeIds?: string[]; zoneId?: string } | null;
};

/** Un modèle règle le titre et les candidats ; l'ouverture reste au choix (un concours se lance à la main). */
export function voteDraftWithTemplate(d: VoteDraft, t: TemplateLike): VoteDraft {
  const openMode = t.candidateMode === "hand" && d.openMode === "first_entry" ? "manual" : d.openMode;
  return {
    ...d,
    title: t.title,
    mode: t.candidateMode,
    countries: t.candidateFilter?.countries ?? [],
    makeIds: t.candidateFilter?.makeIds ?? [],
    zoneId: t.candidateFilter?.zoneId ?? "",
    openMode,
  };
}

/** Changer la manière de choisir les candidats : « à la main » ne s'ouvre pas au premier pointage (l'API le refuse). */
export function voteDraftWithMode(d: VoteDraft, mode: VoteCandidateMode): VoteDraft {
  return {
    ...d,
    mode,
    openMode: mode === "hand" && d.openMode === "first_entry" ? "manual" : d.openMode,
  };
}

const DURATION_PRESETS: Record<string, number> = { "10": 10, "30": 30, "60": 60 };

/** Un vote existant → son brouillon (modification avant l'ouverture). */
export function voteDraftOfItem(v: VoteManageItem): VoteDraft {
  const known = v.durationMinutes === null ? "end" : Object.keys(DURATION_PRESETS).find((k) => DURATION_PRESETS[k] === v.durationMinutes);
  return {
    title: v.title,
    mode: v.candidateMode,
    countries: v.candidateFilter?.countries ?? [],
    makeIds: v.candidateFilter?.makeIds ?? [],
    zoneId: v.candidateFilter?.zoneId ?? "",
    openMode: v.openMode,
    opensAt: v.opensAt ? toWallInput(v.opensAt) : "",
    duration: (known as VoteDurationChoice | undefined) ?? "custom",
    customMinutes: known || v.durationMinutes === null ? "" : String(v.durationMinutes),
  };
}

/** La durée en minutes du brouillon (`null` : jusqu'à la fin de l'événement ; `undefined` : illisible). */
export function voteDraftDuration(d: VoteDraft): number | null | undefined {
  if (d.duration === "end") return null;
  if (d.duration !== "custom") return DURATION_PRESETS[d.duration];
  const n = Number(d.customMinutes.trim());
  return Number.isInteger(n) && n >= VOTE_DURATION_MIN && n <= VOTE_DURATION_MAX ? n : undefined;
}

/** Ce qui empêche d'enregistrer le vote, ou `null`. `eventEndsAt` borne l'heure d'ouverture. */
export function voteDraftProblem(d: VoteDraft, ctx: { now: Date; eventEndsAt?: Date | null }): string | null {
  const title = d.title.trim();
  if (title.length < VOTE_TITLE_MIN || title.length > VOTE_TITLE_MAX) return L.problemTitle;
  if (d.mode === "origins" && d.countries.length === 0 && d.makeIds.length === 0) return L.problemOrigins;
  if (d.mode === "zone" && !d.zoneId) return L.problemZone;
  if (d.mode === "hand" && d.openMode === "first_entry") return L.handFirstEntry;
  if (d.openMode === "at") {
    const iso = fromWallInput(d.opensAt);
    if (!iso) return L.problemOpensAt;
    const at = new Date(iso);
    if (at <= ctx.now || (ctx.eventEndsAt && at >= ctx.eventEndsAt)) return L.problemOpensAt;
  }
  if (voteDraftDuration(d) === undefined) return L.problemDuration;
  return null;
}

/** Le corps de `POST /events/:id/votes` (et de `PATCH`, qui accepte les mêmes champs) ; l'API revalide tout. */
export function voteDraftBody(d: VoteDraft): {
  title: string;
  candidateMode: VoteCandidateMode;
  candidateFilter: VoteCreate["candidateFilter"];
  openMode: VoteOpenMode;
  opensAt: string | null;
  durationMinutes: number | null;
} {
  const filter =
    d.mode === "origins"
      ? {
          ...(d.countries.length ? { countries: d.countries } : {}),
          ...(d.makeIds.length ? { makeIds: d.makeIds } : {}),
        }
      : d.mode === "zone"
        ? { zoneId: d.zoneId }
        : null;
  return {
    title: d.title.trim(),
    candidateMode: d.mode,
    candidateFilter: filter,
    openMode: d.openMode,
    opensAt: d.openMode === "at" ? fromWallInput(d.opensAt) : null,
    durationMinutes: voteDraftDuration(d) ?? null,
  };
}

/** « Japonaises », « Japonaises, Allemandes », « 2 marques », « Japonaises et 2 marques » : la ligne des candidats. */
export function voteCandidatesSummary(
  v: Pick<VoteManageItem, "candidateMode" | "candidateFilter" | "candidatesCount" | "handCandidates">,
  zoneName: (id: string) => string | null,
  makeNames: (ids: string[]) => string[],
): string {
  if (v.candidateMode === "all") return L.candidatesAll;
  if (v.candidateMode === "hand") return L.candidatesHand(v.handCandidates?.length ?? v.candidatesCount);
  if (v.candidateMode === "zone") return L.candidatesZone(zoneName(v.candidateFilter?.zoneId ?? "") ?? "du plateau");
  const parts: string[] = [];
  const countries = v.candidateFilter?.countries ?? [];
  if (countries.length) {
    parts.push(
      countries
        .map((code) => criteriaOrigins.find((o) => o.code === code)?.plural ?? code)
        .map((s, i) => (i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s))
        .join(", "),
    );
  }
  const makes = makeNames(v.candidateFilter?.makeIds ?? []);
  if (makes.length) parts.push(makes.join(", "));
  return parts.join(" et ") || "Une origine";
}

/** La ligne de réglages d'un vote dans l'étape : « Japonaises · dimanche 12 h · jusqu'à la fin de l'événement ». */
export function voteConfigLine(
  v: VoteManageItem,
  now: Date,
  zoneName: (id: string) => string | null,
  makeNames: (ids: string[]) => string[],
): string {
  const open =
    v.openMode === "first_entry"
      ? L.openFirstEntry
      : v.openMode === "manual"
        ? L.openManual
        : v.opensAt
          ? voteWhen(new Date(v.opensAt), now)
          : L.openManual;
  const duration = v.durationMinutes === null ? "jusqu'à la fin de l'événement" : voteDurationLabel(v.durationMinutes);
  return [voteCandidatesSummary(v, zoneName, makeNames), open, duration].join(" · ");
}
