// Notifications d'un événement (vague R8, lot R8n1) : libellés copiés de la maquette R8.11 (`page-r8.js`, `ESS`, `notifH`).
// Le site et l'appli lisent les mêmes mots.

export const eventNotifyLabels = {
  /** Réglages, famille « Événements », ligne verrouillée. */
  essentialTitle: "Changements importants de mes sorties",
  essentialHelp: "Date, heure, lieu, annulation, décision, rappel de la veille, info importante",
  /** Bloc « Essentiel » de l'écran d'un événement. */
  essentialBlockTitle: "Essentiel",
  essentialBlockHelp: "Actif tant que tu es inscrit ou retenu",
  /** Les six lignes du bloc « Essentiel ». */
  essentialItems: [
    "Changement de date ou d'heure",
    "Changement de lieu",
    "Annulation, ou événement « incertain »",
    "Décision sur ta candidature",
    "Rappel de la veille",
    "« Info importante » de l'organisateur",
  ],
  /** Réglages, ligne coupable. */
  newsTitle: "Nouveautés de mes sorties",
  newsHelp: "Un résumé par jour au plus, toutes mes sorties confondues",
  /** Écran d'un événement (inscription, cloche de la fiche). */
  eventNewsTitle: "Nouveautés de l'événement",
  eventNewsHelpOnSignup:
    "Un résumé par jour au plus, toutes tes sorties confondues. Jamais une notification par publication.",
  eventNewsHelpOnFiche: "Un résumé par jour au plus. Activé par défaut ; coupable pour cet événement seulement.",
  /** Réponse 403 `no_place` : pas de place à cet événement. */
  noPlace: "Tu n'as pas de place à cet événement : ses notifications ne se règlent plus ici.",
  /** Résumé quotidien (notification `event_news_digest`). */
  digestTitle: (count: number) => `${count} ${count > 1 ? "nouveautés" : "nouveauté"} pour tes sorties`,
  /** Titres des événements séparés par des virgules (trois au plus), puis « et N autres ». */
  digestBody: (titles: readonly string[]) => {
    const shown = titles.slice(0, 3).join(", ");
    const others = titles.length - 3;
    return others > 0 ? `${shown} et ${others} ${others > 1 ? "autres" : "autre"}` : shown;
  },
  /** Aperçu des destinataires pour l'organisateur (« 148 inscrits seront prévenus »). */
  recipientsBanner: (count: number) => `${count} ${count > 1 ? "inscrits seront prévenus" : "inscrit sera prévenu"}.`,
} as const;
