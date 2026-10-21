// Espace organisateur du site, fonctions nouvelles de la DA v2 (lot 57) : presse (réglages, demandes, contenus),
// missions des prestataires (besoins, emplacement, avis), affiche, prix du public, accueil drive. Le prototype ne montre
// pas ces écrans côté organisateur (il montre le média, la prestataire et le tri) : textes écrits dans le ton des tutos,
// au « tu » et sans genre, consignés au journal des choix (lot 57).

export const orgaPressLabels = {
  navLink: "Presse",
  title: "Presse",
  intro:
    "Ouvre l'accréditation presse, fixe un quota et une date limite, écris les consignes : les médias accrédités les voient avec leur badge presse.",
  settingsTitle: "Réglages de l'accréditation",
  open: "Accréditation presse ouverte",
  quota: "Quota (médias accrédités)",
  quotaHelp: "Vide : pas de limite.",
  deadline: "Date limite des demandes",
  deadlineHelp: "Vide : jusqu'à deux heures avant l'événement.",
  zones: "Zones",
  zonesHelp: "Ex. zone piste 19 h – 21 h · paddock libre.",
  instructions: "Consignes",
  contact: "Contact presse",
  save: "Enregistrer les réglages",
  saved: "Réglages enregistrés.",
  counts: (pending: number, accepted: number) =>
    `${pending} demande${pending > 1 ? "s" : ""} à trier · ${accepted} média${accepted > 1 ? "s" : ""} accrédité${accepted > 1 ? "s" : ""}`,
  requestsTitle: "Demandes d'accréditation",
  refuseReason: "Raison du refus (le média la lit)",
  refuseReasonHelp: "Obligatoire. Ex. quota presse atteint, l'événement n'accueille pas de vidéo.",
  refuseConfirm: "Refuser la demande",
  badgeIssued: "Badge presse délivré",
  accepted: "Accréditation donnée.",
  refused: "Demande refusée : le média lit ta raison.",
  contentsTitle: "Contenus des médias",
  contentsNone: "Aucun contenu publié sur cet événement pour l'instant.",
  feature: "Mettre en avant",
  unfeature: "Retirer de la mise en avant",
  featured: "Contenu mis en avant sur la page de l'événement.",
  unfeatured: "Contenu retiré de la mise en avant.",
  seeMedia: "Voir la fiche du média",
} as const;

export const orgaNeedsLabels = {
  navLink: "Prestataires",
  title: "Missions et prestataires",
  intro:
    "Dis ce que tu cherches (food truck, animation, stand…) : les prestataires du coin voient la mission et proposent leur vitrine. Retiens, donne un emplacement et, après l'événement, laisse un avis.",
  needsTitle: "Besoins",
  needsNone: "Aucun besoin pour l'instant. Ajoute le premier.",
  addTitle: "Ajouter un besoin",
  editTitle: "Modifier ce besoin",
  trade: "Métier",
  quantity: "Nombre",
  power: "Électricité fournie",
  water: "Eau sur place",
  frontage: "Façade (mètres)",
  installAt: "Installation",
  installAtHelp: "Heure d'arrivée des prestataires retenus.",
  notes: "Précisions",
  add: "Ajouter le besoin",
  save: "Enregistrer",
  remove: "Supprimer ce besoin",
  removeConfirm: "Supprimer ce besoin ? Les candidatures déjà reçues restent dans le tri, sans mission précise.",
  places: (filled: number, quantity: number) => `${filled} sur ${quantity}`,
  applicationsTitle: "Candidatures",
  applicationsNone: "Aucune candidature pour ce besoin.",
  freeTitle: "Sans mission précise",
  retain: "Retenir",
  waitlist: "Liste d'attente",
  refuse: "Refuser",
  seeVitrine: "Voir la vitrine",
  reviewTitle: "Donner un avis",
  reviewRating: "Note sur 5",
  reviewComment: "Commentaire (facultatif)",
  reviewSend: "Envoyer l'avis",
  reviewSent: "Avis envoyé : il s'affiche sur la vitrine du prestataire.",
  reviewAfter: "L'avis se donne après l'événement, dans les 30 jours.",
  reviewed: (rating: number) => `Ton avis · ${rating}/5`,
  saved: "Enregistré.",
} as const;

export const orgaPosterLabels = {
  title: "Affiche",
  intro: "L'affiche générée par Orasso, en publication (4:5) et en story (9:16), signée en bas.",
  none: "Pas encore d'affiche générée : choisis une photo et un style dans la modification de l'événement.",
  post: "Publication",
  story: "Story",
  regenerate: "Régénérer",
  regenerated: "Affiche régénérée.",
  downloadStory: "Télécharger la story",
  style: "Style",
  custom: "Ton affiche perso",
} as const;

export const orgaPrizeLabels = {
  title: "Prix du public",
  none: "Le vote ouvre au premier pointage, dès deux véhicules sur place.",
  live: "Classement en direct",
  results: "Résultats",
  winner: "Gagnant",
  noWinner: "Pas de gagnant : il faut au moins 2 véhicules et 3 voix.",
  open: "Voir le vote",
} as const;

export const orgaDriveLabels = {
  /** Rapport de scans du jour J : entrées par l'accueil drive (lecture de plaque). */
  count: (n: number) => `${n} entrée${n > 1 ? "s" : ""} par l'accueil drive`,
} as const;
