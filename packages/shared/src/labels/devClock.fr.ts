// Horloge simulée (lot 34a, développement seulement) : page d'administration `/admin/horloge` et bandeau du site et de
// l'appli. Rien de ceci n'existe en production (la variable DEV_CLOCK y est refusée).

import type { ClockMilestone } from "../devClock";

export const devClockLabels = {
  navLink: "Horloge",
  title: "Horloge simulée",
  intro:
    "Avance le temps d'Orasso pour voir tout de suite ce qui doit se passer : verrouillage, rappels, points et malus, bilan. On ne peut pas reculer, seulement revenir à l'heure réelle.",
  simulatedNow: "Heure simulée",
  realNow: "Heure réelle",
  offset: "Décalage",
  noOffset: "Aucun décalage",
  advance1h: "Avancer d'une heure",
  advance1d: "Avancer d'un jour",
  advanceTo: "Avancer jusqu'à",
  advanceToHint: "Date et heure de Paris, dans le futur.",
  event: "Événement",
  eventHint: "Choisis un événement pour avancer jusqu'à un de ses jalons.",
  noEvent: "Aucun événement publié.",
  goTo: "Aller à ce jalon",
  reset: "Revenir à l'heure réelle",
  resetConfirm: "Revenir à l'heure réelle ? Les points déjà réglés ne sont pas annulés.",
  advanced: "Horloge avancée.",
  resetDone: "Retour à l'heure réelle.",
  reached: "Atteint",
  last: "Dernière modification",
  sweepsTitle: "Rattrapages lancés",
  sweepsOk: "Fait",
  sweepsFailed: "Échec",
  releasedJobs: (n: number) =>
    n === 0 ? "Aucune tâche planifiée à libérer." : `${n} tâche(s) planifiée(s) libérée(s).`,
  banner: (offset: string) => `Horloge simulée : ${offset}`,
  bannerHint: "L'heure d'Orasso est avancée par rapport à l'heure réelle (développement).",
} as const;

export const devClockMilestoneLabels: Record<ClockMilestone, string> = {
  "h-2": "Verrouillage (H-2)",
  start: "Début",
  end: "Fin",
  "j+2": "Points et malus (J+2)",
  "j+8": "Bilan (J+8)",
};

export const devClockErrorLabels = {
  noRewind: "On ne peut pas reculer : cette date est déjà passée pour Orasso.",
  invalidInput: "Indique une durée (2h, 1d), une date ou un jalon d'événement.",
} as const;
