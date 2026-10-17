import type { HomeNudgeKind, HomeWidgetId } from "../home";

// Accueil (lot 30) : titres des widgets, réorganisation, incitations, sources des données ouvertes.

export const homeWidgetTitles: Record<HomeWidgetId, string> = {
  next_access: "Prochain accès",
  pending: "En attente",
  nearby: "Autour de moi",
  weather: "Météo",
  agenda: "Agenda",
  favorite_garage: "Garage favori",
  wash: "Lavage le plus proche",
  fuel: "Carburant le plus proche",
};

export const homeLabels = {
  title: "Accueil",
  reorder: "Réorganiser",
  reorderHint: "Choisis l'ordre des blocs et ceux que tu veux voir. « Prochain accès » reste en tête.",
  moveUp: "Monter",
  moveDown: "Descendre",
  hide: "Masquer",
  hiddenTag: "masqué",
  show: "Afficher",
  done: "Terminé",
  saveFailed: "Réglage non enregistré : réessaie.",
  loadFailed: "Accueil indisponible pour le moment.",
  // Autour de moi.
  radius: (km: number) => `Rayon : ${km} km`,
  radiusLabel: "Rayon des suggestions",
  nearbyEmpty: (km: number) => `Aucun événement à venir à moins de ${km} km : élargis le rayon.`,
  nearbyNoPlace:
    "Ajoute un département dans ton profil, ou utilise ta position, pour voir les événements autour de toi.",
  usePosition: "Utiliser ma position",
  stopPosition: "Revenir à mon secteur",
  usingPosition: "Position de l'appareil, utilisée pour cet affichage seulement.",
  positionDenied: "Position indisponible : on garde ton secteur.",
  // En attente.
  pendingEmpty: "Aucune candidature en attente.",
  // Garage favori.
  garageEmpty: "Marque un pro abonné comme garage favori depuis sa fiche.",
  garageSet: "Garage favori",
  garageUnset: "Retirer des favoris",
  call: "Appeler",
  route: "Itinéraire",
  // Lavage et carburant.
  placesEmpty: "Rien trouvé près de toi pour le moment.",
  washUnnamed: "Station de lavage",
  fuelUnnamed: "Station-service",
  distance: (km: number) => `${km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`,
  priceUnit: "€/L",
  fuelNames: { sp95: "SP95", sp98: "SP98", gazole: "Gazole", e85: "E85" },
  washAttribution: "Données : © contributeurs OpenStreetMap",
  fuelAttribution: "Prix : data.economie.gouv.fr (licence ouverte)",
  // Emplacement sponsorisé.
  sponsored: "Sponsorisé",
  // Agenda.
  agendaEmpty: "Tes dates apparaîtront ici dès que tu auras candidaté.",
  // Prochain accès.
  nextAccess: "Prochain accès",
  applicationInProgress: "Candidature en cours",
  openAccess: "Mode jour J",
  moreInfo: "En savoir plus",
  seeAccess: "Voir mes accès",
  explore: "Explorer les événements",
  // Compte et garage (site).
  accountQrTitle: "Mon QR de compte",
  accountQrHint: "Montre-le à un pro partenaire pour ta remise. Il change toutes les 60 secondes.",
  accountQrWarning: "Ne le partage pas : une capture d'écran ne sert qu'une minute ou deux, mais c'est ton identité.",
  accountQrUnavailable: "QR de compte indisponible : ouvre cette page en HTTPS ou depuis l'appli.",
  accountQrSecondsLeft: (n: number) => `Prochain code dans ${n} s`,
} as const;

export const homeNudges: Record<HomeNudgeKind, { title: string; body: string; action: string }> = {
  verify_email: {
    title: "Vérifie ton e-mail",
    body: "Un lien de confirmation t'a été envoyé : sans lui, certaines fonctions restent fermées.",
    action: "Ouvrir mon compte",
  },
  enable_2fa: {
    title: "Active la double authentification",
    body: "Elle est obligatoire pour gérer un événement : protège ton compte d'organisateur.",
    action: "Sécuriser mon compte",
  },
  add_vehicle: {
    title: "Ajoute ton premier véhicule",
    body: "Ton garage, c'est toi. Tu auras besoin d'un véhicule pour candidater.",
    action: "Ajouter un véhicule",
  },
  create_crew: {
    title: "Crée ton crew",
    body: "Rassemble tes amis et inscrivez-vous ensemble aux événements.",
    action: "Créer un crew",
  },
};
