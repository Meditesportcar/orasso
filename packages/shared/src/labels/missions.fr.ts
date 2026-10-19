import type { ProviderPower } from "../provider";
import { formatMenuPrice } from "../rules/menu";

// Prestataires v2 (lot 46) : missions, emplacement, vitrine et avis des organisateurs. Textes du prototype DA v2
// (`s-missions`, `s-pcand`, `s-vitrine`), au « tu ».

/** Électricité : choix de la vitrine (« Électricité : Aucune · 16 A · 32 A ») et du besoin de l'organisateur. */
export const providerPowerLabels: Record<ProviderPower, string> = {
  none: "Aucune",
  a16: "16 A",
  a32: "32 A",
  generator_ok: "Groupe autorisé",
};

const fr = (n: number) => String(n).replace(".", ",");

export const missionTexts = {
  title: "Missions",
  /** « 4 événements cherchent un food truck, du plus proche au plus loin. » */
  intro: (count: number, trade: string) =>
    count === 0
      ? `Aucun événement ne cherche de ${trade.toLowerCase()} pour le moment.`
      : `${count} événement${count > 1 ? "s cherchent" : " cherche"} un ${trade.toLowerCase()}, du plus proche au plus loin.`,
  /** « 1 place sur 2 » quand une partie est comblée, sinon « 2 food trucks ». */
  places: (remaining: number, quantity: number, trade: string) =>
    remaining < quantity
      ? `${remaining} place${remaining > 1 ? "s" : ""} sur ${quantity}`
      : `${quantity} ${trade.toLowerCase()}${quantity > 1 ? "s" : ""}`,
  distance: (km: number) => `${Math.round(km)} km`,
  expectedVisitors: (n: number) => `${n} visiteurs attendus`,
  /** Ce que l'organisateur fournit (carte de mission). */
  power: (p: ProviderPower) =>
    p === "none"
      ? "Pas d'électricité"
      : p === "generator_ok"
        ? "Pas d'électricité · groupe autorisé"
        : "Électricité fournie",
  powerDetail: (p: ProviderPower) => (p === "a16" || p === "a32" ? `électricité ${providerPowerLabels[p]}` : null),
  water: "Eau sur place",
  propose: (name: string) => `Proposer ${name}`,
  seeApplication: "Voir ma candidature",
  retained: "Retenue",
} as const;

export const providerSpotTexts = {
  /** « Emplacement B2 · arrivée 16 h · électricité 16 A » */
  spot: (label: string) => `Emplacement ${label}`,
  arrival: (hour: string) => `arrivée ${hour}`,
  myAccess: "Mon accès",
  instructions: "Consignes",
  notifTitle: (event: string) => `Ton emplacement pour « ${event} »`,
  notifBody: (parts: readonly string[]) => `${parts.join(" · ")}.`,
} as const;

export const providerReviewTexts = {
  sectionTitle: "Avis des organisateurs",
  /** « Avis · 5/5 » sur le ticket d'une candidature passée. */
  ticket: (rating: number) => `Avis · ${rating}/5`,
  /** « 4,9 sur 5 · 13 événements » */
  summary: (average: number, count: number) => `${fr(average)} sur 5 · ${count} événement${count > 1 ? "s" : ""}`,
  none: "Pas encore d'avis.",
  deletedAuthor: "Compte supprimé",
  notifTitle: (structure: string) => `${structure} t'a laissé un avis`,
  notifBody: (event: string, rating: number) => `« ${event} » : ${rating}/5.`,
  notAccepted: "L'avis est réservé aux prestataires retenus.",
  eventCancelled: "Événement annulé : pas d'avis.",
  notEnded: "L'avis se laisse après la fin de l'événement.",
  windowClosed: "L'avis se laisse dans les 30 jours après l'événement.",
  duplicate: "Tu as déjà laissé un avis sur ce prestataire pour cet événement.",
  authorRole: "L'avis est laissé par un organisateur de la structure.",
  selfReview: "Pas d'avis sur un prestataire de ta propre structure.",
} as const;

export const needApplicationTexts = {
  notifTitle: (event: string) => `Nouvelle candidature pour « ${event} »`,
  notifBody: (provider: string, trade: string) => `${provider} propose ses services (${trade.toLowerCase()}).`,
} as const;

export const vitrineTexts = {
  title: "Ma vitrine",
  orgView: "Vue organisateur",
  edit: "Modifier ma vitrine",
  /** « 2 personnes » */
  teamSize: (n: number) => `${n} personne${n > 1 ? "s" : ""}`,
  menuTitle: "Menu",
  /** « De 4 à 11 € » */
  menuRange: (min: number, max: number) =>
    min === max ? formatMenuPrice(min) : `De ${formatMenuPrice(min).replace(/\s€$/, "")} à ${formatMenuPrice(max)}`,
  needsTitle: "Besoins sur place",
  power: (p: ProviderPower) =>
    p === "none"
      ? "Pas d'électricité"
      : p === "generator_ok"
        ? "Groupe électrogène"
        : `Électricité ${providerPowerLabels[p]}`,
  frontage: (m: number) => `${m} m de façade`,
  water: (needed: boolean) => (needed ? "Eau nécessaire" : "Pas d'eau"),
  zoneTitle: "Zone d'intervention",
  radius: (km: number) => `Jusqu'à ${km} km`,
  // Modification
  tradesField: "Métier · touche pour cocher",
  nameField: "Nom affiché",
  taglineField: "Ta spécialité",
  teamField: "Équipe",
  menuField: "Menu",
  menuHelp: "Une ligne par plat, avec son prix.",
  menuPlaceholder: "Bocata de botifarra · 9 €",
  powerField: "Électricité",
  frontageField: "Façade (mètres)",
  waterField: "Eau sur place",
  radiusField: "Rayon d'intervention",
} as const;
