import type { PreferenceNotification } from "../preferences";

// « Tes préférences » (lot M6, maquette 8.3) : textes de l'étape d'arrivée, rouverte depuis Profil › Préférences.
export const preferencesLabels = {
  title: "Tes préférences",
  stepFacts: "Dernière étape · 30 secondes",
  editFacts: "Modifiables à tout moment",
  heading: "Ce que tu aimes",
  lead: "L'Explorer s'ouvrira déjà trié pour toi. Tout se change ensuite dans Profil › Préférences.",
  types: "Types d'événements · plusieurs choix",
  distance: "Distance autour de toi",
  departments: "Tes départements",
  noDepartment: "Aucun département : choisis le tien pour voir les événements près de chez toi.",
  editDepartments: "Modifier",
  notify: "Te prévenir",
  discover: "Découvrir les événements",
  save: "Enregistrer",
  skip: "Passer",
  close: "Fermer",
  saved: "Préférences enregistrées.",
  /** L'entrée de Profil › Préférences. */
  settingsRow: "Tes préférences",
  settingsRowCaption: "Types d'événements, distance, départements, notifications",
} as const;

export const preferenceNotificationLabels: Record<PreferenceNotification, { title: string; caption: string }> = {
  newEvents: { title: "Nouveaux événements pour toi", caption: "Dans tes types, autour de toi" },
  freedSpots: { title: "Places libérées", caption: "Quand tu es en liste d'attente" },
  followedNews: { title: "Nouvelles des structures suivies", caption: "Leurs prochains événements" },
};

/** Légende de l'interrupteur « Nouveaux événements » avec la distance choisie : « Dans tes types, à moins de 60 km ». */
export const newEventsCaption = (km: number) => `Dans tes types, à moins de ${km} km`;
