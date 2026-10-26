import { layout, type RouteConfig, route } from "@react-router/dev/routes";

// Mon compte (`/app/*`, connecté).
export default [
  // Mon compte (connecté) : mêmes sections que l'appli.
  layout("layouts/app.tsx", [
    route("app", "routes/app-home.tsx"),
    route("app/explorer", "routes/app-explorer.tsx"),
    // Boîte (lot 18) : conversations, demandes, conversation en temps réel.
    route("app/boite", "routes/boite.tsx"),
    route("app/boite/demandes", "routes/boite-demandes.tsx"),
    route("app/boite/:id", "routes/boite-conversation.tsx"),
    route("app/acces", "routes/acces.tsx"),
    // Lot 57 (DA v2) : l'onglet Accès devient Sorties (`/app/acces` redirige) ; passeport, prix du public, récap, média,
    // fiche d'un média et vitrine d'un prestataire (connectés seulement), comme l'appli.
    route("app/sorties", "routes/sorties.tsx"),
    route("app/passeport", "routes/passeport.tsx"),
    route("app/vote/:slug", "routes/vote.tsx"),
    route("app/recap/:eventId", "routes/recap.tsx"),
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
    // Social (lot 17) : amis, Journal, profils et véhicules des autres (connectés seulement).
    route("app/amis", "routes/amis.tsx"),
    // Lot R4c : « Ton réseau » (abonnés, abonnements, amis) et l'aperçu de mon profil public.
    route("app/reseau", "routes/reseau.tsx"),
    route("app/profil-public", "routes/profil-public.tsx"),
    route("app/journal", "routes/journal.tsx"),
    route("u/:pseudo", "routes/profil.tsx"),
    route("v/:id", "routes/vehicule.tsx"),
    // Crews (lot 19) : mes crews et création, fiche d'un crew (connectés seulement).
    route("app/crews", "routes/crews.tsx"),
    // Lot R3b : « Rejoins ou crée un crew » du profil propose d'abord de rejoindre.
    route("app/crews/rejoindre", "routes/crews-rejoindre.tsx"),
    route("c/:slug", "routes/crew.tsx"),
    // Lot R5c2 : proposer une sortie du crew, réglages du crew (chef).
    route("c/:slug/sortie", "routes/crew-sortie.tsx"),
    route("c/:slug/reglages", "routes/crew-reglages.tsx"),
  ]),
] satisfies RouteConfig;
