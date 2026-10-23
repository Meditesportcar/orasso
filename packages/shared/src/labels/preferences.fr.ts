// « Tes préférences » (lot M6, maquette 8.3) : textes de la page, à l'arrivée (dernière étape) comme rouverte depuis les
// réglages. Une seule page : ton coin, la distance habituelle, les types d'événements, les centres d'intérêt, un seul
// interrupteur. Les autres interrupteurs de notification restent dans l'écran Notifications.
export const preferencesLabels = {
  title: "Tes préférences",
  stepFacts: "Dernière étape · 30 secondes",
  editFacts: "Modifiables à tout moment",
  heading: "Ce que tu aimes",
  lead: "L'Explorer s'ouvrira déjà trié pour toi, mais tu pourras toujours voir plus large. Tout se change ensuite dans Profil › Tes préférences.",
  departments: "Ton coin",
  noDepartment: "Aucun département : choisis le tien pour voir les événements près de chez toi.",
  editDepartments: "Modifier",
  distance: "Distance habituelle",
  everywhere: "Partout en France",
  everywhereShort: "Partout",
  everywhereCaption: "Aucune limite de distance",
  types: "Types d'événements · plusieurs choix",
  interests: "Centres d'intérêt",
  interestsLoading: "Chargement…",
  notify: "Me prévenir",
  discover: "Découvrir les événements",
  save: "Enregistrer",
  skip: "Passer",
  close: "Fermer",
  saved: "Préférences enregistrées.",
  /** L'entrée des réglages et du profil. */
  settingsRow: "Tes préférences",
  settingsRowCaption: "Ton coin, distance, types d'événements, centres d'intérêt",
} as const;

/** L'interrupteur unique : il écrit le même réglage que l'écran Notifications (`event_nearby_interest`). */
export const preferenceNewEventsLabel = { title: "Me prévenir des nouveaux événements dans mon coin" } as const;

/** Légende de l'interrupteur avec la distance choisie : « Dans tes types, à moins de 60 km » ; sans limite : « …, partout en France ». */
export const newEventsCaption = (km: number | null) =>
  km === null ? "Dans tes types, partout en France" : `Dans tes types, à moins de ${km} km`;
