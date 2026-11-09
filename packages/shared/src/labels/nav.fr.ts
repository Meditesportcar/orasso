// Navigation v3 (lot R7a1, décision D38) : Explorer · Le Fil · Accueil · Crew · Profil, la barre du haut (loupe, cloche
// « Activité », bulle « Messages ») et le bandeau « où sont passées les choses ». Appli et site disent les mêmes mots.

export const navLabels = {
  /** Barre d'onglets du passionné (exposant ou visiteur). */
  tabs: { explore: "Explorer", feed: "Le Fil", home: "Accueil", crew: "Crew", profile: "Profil" },
  /** Barre du haut : noms accessibles des trois boutons. */
  top: { search: "Rechercher", activity: "Activité", messages: "Messages" },
  /** Noms accessibles des boutons à pastille : ils annoncent le nombre (« Activité, 3 non lues »), rien s'il n'y en a pas. */
  topCounted: {
    activity: (n: number) => (n > 0 ? `Activité, ${n > 99 ? "plus de 99" : n} non lue${n > 1 ? "s" : ""}` : "Activité"),
    messages: (n: number) => (n > 0 ? `Messages, ${n > 99 ? "plus de 99" : n} non lu${n > 1 ? "s" : ""}` : "Messages"),
  },
  /**
   * Bandeau montré une seule fois après la mise à jour (clé `whatsnew:r7` par compte dans l'appli, cookie
   * `whatsnew_r7` haché par compte sur le site).
   */
  whatsNew: {
    title: "Orasso se range autrement",
    /**
     * Où sont les choses **aujourd'hui** (tour 2) : les sorties au nombre « sorties » du Profil tant que le bloc « Mes
     * sorties » de l'Accueil (lot R7a2) n'existe pas, le garage à la ligne « Mon garage » du Profil (exposant seulement :
     * le visiteur n'a pas de garage). R7a2 et R7b1 remettent « dans l'Accueil » et l'onglet « Garage ».
     */
    exhibitor:
      "Tes sorties : dans ton Profil, au nombre « sorties ». Ton garage : dans ton Profil, ligne « Mon garage ». Ton crew a son onglet. Rien n'est perdu.",
    visitor: "Tes sorties : dans ton Profil, au nombre « sorties ». Ton crew a son onglet. Rien n'est perdu.",
    /** Nom accessible du ✕. */
    dismiss: "Fermer l'explication",
  },
  /** Ligne du Profil qui ouvre le Garage (provisoire : le lot R7b1 pose l'onglet interne « Garage »). */
  garageRow: { title: "Mon garage", caption: "Tes véhicules et leurs photos" },
  /** Onglet Le Fil (coquille en attendant l'écran du lot R7e2). */
  fil: {
    title: "Le Fil",
    note: "Le Fil des gens que tu suis arrive bientôt. En attendant, voici tes notifications.",
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
