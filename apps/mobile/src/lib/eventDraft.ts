// Assistant d'événement de l'appli (lot 35b, D20) : ce qui est propre au téléphone autour du modèle partagé
// (`@orasso/shared`, `eventWizard.ts`, celui du site). La première étape du site (format, dates, lieu) est découpée en
// trois écrans ; chaque écran valide avec les mêmes règles que le site. Le brouillon d'une création est gardé sur le
// téléphone (voir `eventDraftStore.ts`) : ce fichier dit comment il s'écrit et se relit.
import {
  type AppWizardStep,
  appWizardSteps,
  type EventDraft,
  type EventWizardStep,
  eventDatesProblem,
  eventStepProblem,
  eventStepSkipped,
  eventTitleProblem,
} from "@orasso/shared";

/** L'étape du site qui porte les règles d'un écran de l'appli. */
export function siteStepOf(step: AppWizardStep): EventWizardStep {
  return step === "dates" || step === "lieu" ? "format" : step;
}

/** Le problème qui empêche de quitter un écran, ou `null` (règles du site, `eventStepProblem`). */
export function appStepProblem(step: AppWizardStep, d: EventDraft): string | null {
  if (step === "format") return eventTitleProblem(d);
  if (step === "dates") return eventDatesProblem(d);
  if (step === "lieu") return null;
  return eventStepProblem(step, d);
}

export const appStepSkipped = (step: AppWizardStep, d: Pick<EventDraft, "admission">) =>
  eventStepSkipped(siteStepOf(step), d);

/** Écran suivant ou précédent, en sautant les critères hors filtration. */
export function moveStep(index: number, delta: 1 | -1, d: Pick<EventDraft, "admission">): number {
  let next = index + delta;
  const target = appWizardSteps[next];
  if (target && appStepSkipped(target, d)) next += delta;
  return Math.min(Math.max(next, 0), appWizardSteps.length - 1);
}

/** Premier écran en défaut avant l'enregistrement, ou `null`. */
export function firstAppProblem(d: EventDraft): { index: number; problem: string } | null {
  for (const [index, step] of appWizardSteps.entries()) {
    if (appStepSkipped(step, d)) continue;
    const problem = appStepProblem(step, d);
    if (problem) return { index, problem };
  }
  return null;
}

/** Nombre d'écrans réellement parcourus (sans les critères hors filtration) et rang de l'écran courant. */
export function progressOf(index: number, d: Pick<EventDraft, "admission">): { n: number; total: number } {
  const shown = appWizardSteps.filter((s) => !appStepSkipped(s, d));
  const step = appWizardSteps[index];
  return { n: step ? Math.max(1, shown.indexOf(step) + 1) : 1, total: shown.length };
}

/** « AAAA-MM-JJTHH:MM » → « AAAA-MM-JJ » (vide si absent ; une saisie en cours reste telle quelle). */
export const datePart = (value: string) => value.split("T")[0] ?? "";
/** « AAAA-MM-JJTHH:MM » → « HH:MM » (vide si absent ; une saisie en cours reste telle quelle). */
export const timePart = (value: string) => value.split("T")[1] ?? "";

/** Recompose un champ « date et heure » depuis ses deux saisies (heure normalisée, voir `normalizeTime`). */
export function joinDateTime(date: string, time: string, normalize = true): string {
  const d = date.trim().replace(/T/gi, "");
  const t = normalize ? normalizeTime(time) : time.trim().replace(/T/gi, "");
  if (!d && !t) return "";
  return `${d}T${t}`;
}

/** Heure saisie au clavier du téléphone : « 9h », « 9:30 », « 0930 » → « 09:00 », « 09:30 », « 09:30 ». */
export function normalizeTime(value: string): string {
  const v = value.trim().toLowerCase().replace(/\s/g, "");
  const m = /^(\d{1,2})(?:[h:.]?(\d{2})?)?$/.exec(v);
  if (!m) return value.trim();
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || min > 59) return value.trim();
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Ce que le téléphone garde d'une création en cours. */
export type StoredDraft = {
  v: 1;
  draft: EventDraft;
  step: number;
  /** Événement déjà créé dont l'enregistrement des jours ou des zones a échoué : la suite passe en modification. */
  createdId: string | null;
  savedAt: string;
  /**
   * Affiche choisie (lot 34) : copie gardée dans le dossier de l'appli (ou adresse `data:` dans le navigateur), envoyée
   * à l'enregistrement. Absente des brouillons d'avant le lot 34.
   */
  poster?: StoredPoster | null;
};

/** Même forme que `PickedPhoto` (lib/photos), sans dépendre du sélecteur d'images. */
export type StoredPoster = { uri: string; width: number; height: number };

const posterOf = (value: unknown): StoredPoster | null => {
  const p = value as Partial<StoredPoster> | null | undefined;
  return p && typeof p.uri === "string" && p.uri && typeof p.width === "number" && typeof p.height === "number"
    ? { uri: p.uri, width: p.width, height: p.height }
    : null;
};

export const serializeDraft = (value: Omit<StoredDraft, "v">) => JSON.stringify({ v: 1, ...value });

/** Relit un brouillon gardé ; `null` s'il est absent, d'une autre version ou abîmé. */
export function parseStoredDraft(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (value?.v !== 1 || typeof value.savedAt !== "string") return null;
    const d = value.draft as Partial<EventDraft> | undefined;
    if (!d || typeof d.title !== "string" || !Array.isArray(d.vehicleTypes) || !Array.isArray(d.zones)) return null;
    if (!Array.isArray(d.days) || typeof d.format !== "string") return null;
    const step = Number.isInteger(value.step) ? Math.min(Math.max(value.step ?? 0, 0), appWizardSteps.length - 1) : 0;
    return {
      v: 1,
      draft: d as EventDraft,
      step,
      createdId: typeof value.createdId === "string" ? value.createdId : null,
      savedAt: value.savedAt,
      poster: posterOf(value.poster),
    };
  } catch {
    return null;
  }
}

/** Un brouillon vaut la peine d'être gardé dès qu'on a saisi quelque chose (un titre, une date, une adresse). */
export function draftWorthKeeping(d: EventDraft): boolean {
  return Boolean(d.title.trim() || d.startsAt || d.addressLine.trim() || d.city.trim() || d.description.trim());
}
