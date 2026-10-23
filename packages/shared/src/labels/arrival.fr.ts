// Créneaux d'arrivée et générateur d'affiche (lot 47). Textes du prototype DA v2 (`s-create` étapes « Les arrivées »
// et « Ton affiche »), au « tu ».
import type { PosterStyle } from "../rules/poster";

export const arrivalTexts = {
  exhibitors: "Exposants, avec véhicule",
  public: "Public",
  from: "À partir de",
  to: "Jusqu'à",
  strict: "Strict",
  advised: "Recommandé",
  strictHint: "Strict : utile pour les gros événements. Les retards doivent prévenir.",
  seen: "J'ai vu",
  /** Case de la candidature (site et appli). */
  seenLabel: "J'ai vu le créneau d'arrivée.",
  noteLabel: "Une note pour l'équipe (facultatif)",
  notePlaceholder: "J'arriverai vers 19 h 30 à cause du travail",
  /** Suffixe du libellé d'un créneau strict : « (strict) ». Lot M4 : jamais « (conseillé) » (correction de Damien). */
  strictSuffix: "strict",
} as const;

/** Problèmes de saisie des créneaux (`validateArrivals`), affichés tels quels dans l'assistant et renvoyés par l'API. */
export const arrivalProblems = {
  exhibitors_order: "Créneau des exposants : la fin doit suivre le début.",
  public_order: "Créneau du public : la fin doit suivre le début.",
  exhibitors_after_event: "Créneau des exposants : il commence avant la fin de l'événement.",
  public_before_exhibitors: "Le public arrive après le début de l'arrivée des exposants.",
  note_too_long: "Note : 200 caractères au plus.",
} as const;

/** Candidature sans la case « J'ai vu » alors que l'événement a un créneau d'arrivée pour les exposants. */
export const arrivalNotSeen = "Coche « J'ai vu » sous l'horaire d'arrivée des exposants.";

export const posterTexts = {
  intro:
    "Une photo, un style, c'est prêt. Elle sert de vignette dans Explorer et se partage sur Instagram et Facebook.",
  photo: "Photo",
  post: "Post 4:5",
  story: "Story 9:16",
  style: "Style",
  stylesCount: "8 modèles",
  titleLabel: "Titre sur l'affiche (34 caractères max)",
  ownPoster: "Tu as déjà ton affiche ? Ajoute-la en plus.",
  signature: "Orasso",
} as const;

/** Noms des huit modèles (`TPLS` du prototype). */
export const posterStyleLabels: Record<PosterStyle, string> = {
  neon: "Néon",
  swiss: "Suisse",
  retro: "Rétro",
  jdm: "JDM",
  ticket: "Billet",
  mag: "Magazine",
  minimal: "Minimal",
  damier: "Damier",
};
