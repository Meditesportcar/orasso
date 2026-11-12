import { layout, type RouteConfig, route } from "@react-router/dev/routes";

// Mon compte (`/app/*`, connecté).
export default [
  // Mon compte (connecté) : mêmes sections que l'appli.
  layout("layouts/app.tsx", [
    route("app", "routes/app-home.tsx"),
    route("app/explorer", "routes/app-explorer.tsx"),
    // Lot R7a1 (D38) : Le Fil et Crew, deux onglets en coquille (les écrans viennent des lots R7e2 et R7b2) ; « Compris » du
    // bandeau « où sont passées les choses » (action seulement).
    route("app/fil", "routes/app-fil.tsx"),
    // Lot R7e2 : publier au Fil et « Mes publications ».
    route("app/fil/publier", "routes/app-fil-publier.tsx"),
    route("app/fil/mes-publications", "routes/app-fil-mes-publications.tsx"),
    // Lot R8b2 : la page d'une publication seule (le lien d'une notification et la vignette d'un profil y mènent).
    route("app/publication/:id", "routes/app-publication.tsx"),
    // Lot R7f3 : publier une story (photo en 9:16).
    route("app/story/publier", "routes/app-story-publier.tsx"),
    // Lot R7f4 : partager un contenu en story (carte sur fond 9:16).
    route("app/story/partager", "routes/app-story-partager.tsx"),
    // Lot R7f2 : la visionneuse de stories (superposition 9:16) ; `authorKey` = `u:<compte>`, `s:<structure>` ou `p:<pro>`.
    route("app/story/:authorKey", "routes/app-story.tsx"),
    route("app/crew", "routes/app-crew.tsx"),
    // Lot R7i : rendez-vous au spot (lancer, recevoir, répondre).
    route("app/spot/nouveau", "routes/app-spot-nouveau.tsx"),
    route("app/spot/:id", "routes/app-spot.tsx"),
    // Lot R7a2 : « Personnaliser » l'Accueil (blocs choisis, ordonnés, masqués).
    route("app/accueil/personnaliser", "routes/app-home-personnaliser.tsx"),
    // Lot R8m : le détail de « Ma météo » (heure par heure, Changer de lieu).
    route("app/meteo", "routes/app-meteo.tsx"),
    // Lot R8q : « Pratique » (station-service et lavage les plus proches), liste et carte.
    route("app/pratique", "routes/app-pratique.tsx"),
    route("app/bandeau", "routes/app-bandeau.ts"),
    // Lot R7c2 (D38) : la Boîte disparaît. Activité (la cloche) et ses Demandes, Messages (la bulle), ses Demandes de message
    // et la conversation en temps réel ; les anciennes adresses `/app/boite*` et `/app/journal` redirigent (302).
    route("app/activite", "routes/app-activite.tsx"),
    route("app/activite/demandes", "routes/app-activite-demandes.tsx"),
    route("app/messages", "routes/app-messages.tsx"),
    route("app/messages/demandes", "routes/app-messages-demandes.tsx"),
    route("app/messages/:id", "routes/app-messages-conversation.tsx"),
    route("app/boite", "routes/app-boite-redirect.ts", { id: "boite-index" }),
    route("app/boite/demandes", "routes/app-boite-redirect.ts", { id: "boite-demandes" }),
    route("app/boite/:id", "routes/app-boite-redirect.ts", { id: "boite-conversation" }),
    route("app/acces", "routes/acces.tsx"),
    // Lot 57 (DA v2) : l'onglet Accès devient Sorties (`/app/acces` redirige) ; passeport, prix du public, récap, média,
    // fiche d'un média et vitrine d'un prestataire (connectés seulement), comme l'appli.
    route("app/sorties", "routes/sorties.tsx"),
    route("app/passeport", "routes/passeport.tsx"),
    route("app/vote/:slug", "routes/vote.tsx"),
    // Lot R7l3 : la liste des votes d'un événement (un vote : `app/vote/:slug?vote=`).
    route("app/votes/:slug", "routes/votes.tsx"),
    route("app/recap/:eventId", "routes/recap.tsx"),
    // Lot R7j : la page d'un souvenir (« il y a un an… »), cible de la notification `memory`.
    route("app/souvenir/:eventId", "routes/app-souvenir.tsx"),
    route("app/media", "routes/media.tsx"),
    route("app/media/nouveau", "routes/media-nouveau.tsx"),
    route("m/:id", "routes/m.tsx"),
    route("providers/:id", "routes/prestataires.tsx"),
    route("app/garage", "routes/garage.tsx"),
    route("app/garage/nouveau", "routes/garage-nouveau.tsx"),
    route("app/garage/:id", "routes/garage-vehicule.tsx"),
    route("app/moi", "routes/moi.tsx"),
    // Lot M6 : « Tes préférences » (types d'événements, distance, départements, « Te prévenir »), comme l'appli.
    route("app/preferences", "routes/preferences.tsx"),
    route("app/securite", "routes/securite.tsx"),
    // Lot 32 : mes sanctions et la contestation (une seule fois par sanction).
    route("app/sanctions", "routes/sanctions.tsx"),
    // Lot M5 : l'Aide (questions fréquentes, contact) et l'export de mes données (fichier JSON), comme l'appli.
    route("app/aide", "routes/aide.tsx"),
    route("app/mes-donnees", "routes/mes-donnees.ts"),
    route("app/structure/nouvelle", "routes/structure-nouvelle.tsx"),
    route("app/pro/nouvelle", "routes/pro-nouvelle.tsx"),
    route("app/prestataire", "routes/prestataire.tsx"),
    route("app/billets", "routes/billets.tsx"),
    // Social (lot 17) : Journal, profils et véhicules des autres (connectés seulement). Lot R6b : « Mes amis » redirige
    // vers « Ton réseau » (plus d'amitié).
    route("app/amis", "routes/amis.tsx"),
    // Lot R4c : « Ton réseau » (abonnés, abonnements, demandes) et l'aperçu de mon profil public.
    route("app/reseau", "routes/reseau.tsx"),
    route("app/profil-public", "routes/profil-public.tsx"),
    // Lot R5b : « Modifier mon profil » (photo, pseudo, description, réseaux).
    route("app/profil/modifier", "routes/profil-modifier.tsx"),
    route("app/journal", "routes/app-boite-redirect.ts", { id: "journal-redirect" }),
    route("u/:pseudo", "routes/profil.tsx"),
    route("v/:id", "routes/vehicule.tsx"),
    // Crews (lot 19) : mes crews et création, fiche d'un crew (connectés seulement).
    route("app/crews", "routes/crews.tsx"),
    // Lot R7b2 : créer un crew (l'ancien « Mes crews » est l'onglet Crew).
    route("app/crews/nouveau", "routes/crews-nouveau.tsx"),
    // Lot R3b : « Rejoins ou crée un crew » du profil propose d'abord de rejoindre.
    route("app/crews/rejoindre", "routes/crews-rejoindre.tsx"),
    route("c/:slug", "routes/crew.tsx"),
    // Lot R5c2 : proposer une sortie du crew, réglages du crew (chef).
    route("c/:slug/sortie", "routes/crew-sortie.tsx"),
    route("c/:slug/reglages", "routes/crew-reglages.tsx"),
    // Lot R6c : inviter quelqu'un dans le crew (tout membre actif).
    route("c/:slug/inviter", "routes/crew-inviter.tsx"),
  ]),
] satisfies RouteConfig;
