// Navigation v3 (lot R7a1, décision D38) : Explorer · Le Fil · Accueil · Crew · Profil, la barre du haut (loupe, cloche
// « Activité », bulle « Messages ») et le bandeau « où sont passées les choses ». Appli et site disent les mêmes mots.

export const navLabels = {
  /** Barre d'onglets du passionné (exposant ou visiteur). */
  tabs: { explore: "Explorer", feed: "Le Fil", home: "Accueil", crew: "Crew", profile: "Profil" },
  /** Barre du haut : noms accessibles des trois boutons. */
  top: { search: "Rechercher", activity: "Activité", messages: "Messages" },
  /**
   * Bandeau montré une seule fois après la mise à jour (clé `whatsnew:r7` par compte dans l'appli, cookie
   * `whatsnew_r7` haché par compte sur le site).
   */
  whatsNew: {
    text: "Sorties est dans l'Accueil, le Garage dans ton Profil, ton crew a son onglet. Rien n'est perdu.",
    dismiss: "Compris",
  },
  /** Ligne du Profil qui ouvre le Garage (provisoire : le lot R7b1 pose l'onglet interne « Garage »). */
  garageRow: { title: "Mon garage", caption: "Tes véhicules et leurs photos" },
  /** Onglet Le Fil (coquille en attendant l'écran du lot R7e2). */
  fil: {
    title: "Le Fil",
    note: "Le Fil des gens que tu suis arrive bientôt. En attendant, voici ton Journal.",
  },
  /** Onglet Crew (coquille en attendant l'écran du lot R7b2). */
  crewTab: {
    title: "Crew",
    open: "Ouvrir mon crew",
    none: "Tu n'as pas encore de crew.",
    noneHint: "Un crew réunit des passionnés autour de sorties, de préparations, d'une région.",
    join: "Rejoindre un crew",
    create: "Créer un crew",
  },
} as const;
