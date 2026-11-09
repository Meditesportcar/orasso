import { PRESENCE_DEFAULT_RADIUS_M, PRESENCE_RADIUS_BOUNDS, type PresenceRefusal } from "../rules/presence";
import { pluralFr } from "./plural.fr";

// Le direct, présence par GPS (lot R7d1, maquette R7.13 et R7.14) : mêmes mots dans l'appli et sur le site.

export const presenceLabels = {
  /** Le bouton de l'appli (visiteur sans voiture, pendant l'événement). */
  action: "Je suis sur place",
  /** Sous le bouton : ce que fait la position. */
  explain:
    "Ta position est vérifiée une fois, puis oubliée : elle n'est ni suivie ni gardée. Une validation par compte.",
  /** Réponse de l'API et phrase de confirmation. */
  validated: "Présence validée : tu es sur place, tu peux voter.",
  /** Notification `presence_validated` (Journal). */
  notificationTitle: "Présence validée",
  notificationBody: (title: string) => `Tu es sur place à « ${title} » : ton tampon est posé et tu peux voter.`,
  /** Zone de présence de l'éditeur (étape « Lieu », écran en R7d2). */
  radiusLabel: "Zone de présence (m)",
  radiusHelp: `${PRESENCE_DEFAULT_RADIUS_M} m si vide`,
  radiusProblem: `Zone de présence : un nombre de mètres entre ${PRESENCE_RADIUS_BOUNDS[0]} et ${PRESENCE_RADIUS_BOUNDS[1]}, ou rien.`,
  /** « 11 sur place, sur 14 retenues » (pendant l'événement seulement). */
  onSite: (onSite: number, accepted: number) =>
    `${onSite} sur place, sur ${accepted} ${pluralFr(accepted, "retenue", "retenues")}`,
  /** Statistique de l'organisateur : un nombre, jamais une liste. */
  summaryTitle: "Présents sur Orasso",
  summaryTotal: (n: number) => `${n} ${pluralFr(n, "utilisateur d'Orasso présent", "utilisateurs d'Orasso présents")}`,
  errors: {
    closed: "La présence se valide pendant l'événement, à partir de 30 minutes avant son début.",
    use_qr: "Tu as une place avec ton véhicule : l'accueil te scanne à l'entrée, pas besoin de position.",
    scan_ticket: "Ton billet se fait scanner à l'entrée : pas besoin de position.",
    ticket_required: "L'entrée est payante : prends ton billet.",
    already_present: "Ta présence est déjà validée pour cet événement.",
    gps_imprecise: "Ta position est trop imprécise : sors à l'air libre, attends quelques secondes et réessaie.",
    out_of_zone: "Tu n'es pas encore dans la zone de l'événement : rapproche-toi du lieu et réessaie.",
    no_zone: "Cet événement n'a pas de position précise : la présence par GPS n'est pas disponible.",
  } satisfies Record<PresenceRefusal, string>,
};
