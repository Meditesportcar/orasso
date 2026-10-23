// Professionnels (docs/01 « Professionnels », « Points et grades ») : activités, abonnement en présentation, remises
// par grade, publications limitées par mois. Fonctions pures, communes à l'API, au site et à l'appli.
import { type Grade, grades } from "../grades";
import { fromWallTime, wallTime } from "./time";

/** Activités d'une fiche pro, choisies dans une liste (docs/01 : garage, préparation, detailing, covering, pièces…). */
export const proActivities = [
  "garage",
  "preparation",
  "detailing",
  "covering",
  "parts",
  "tyres",
  "bodywork",
  "tint",
  "upholstery",
  "audio",
  "inspection",
  "other",
] as const;
export type ProActivity = (typeof proActivities)[number];

export const proActivityLabels: Record<ProActivity, string> = {
  garage: "Garage et mécanique",
  preparation: "Préparation",
  detailing: "Detailing et lavage",
  covering: "Covering",
  parts: "Pièces",
  tyres: "Pneus et jantes",
  bodywork: "Carrosserie et peinture",
  tint: "Vitres teintées",
  upholstery: "Sellerie",
  audio: "Audio et électronique",
  inspection: "Expertise et contrôle",
  other: "Autre",
};

/** Jours de la semaine des horaires (clés stables, libellés dans `weekdayLabels`). */
export const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof weekdays)[number];
export const weekdayLabels: Record<Weekday, string> = {
  mon: "Lundi",
  tue: "Mardi",
  wed: "Mercredi",
  thu: "Jeudi",
  fri: "Vendredi",
  sat: "Samedi",
  sun: "Dimanche",
};

/** Date jusqu'à laquelle les fiches pro sont gratuites (docs/01 : « gratuits jusqu'au 21 juin 2027 »). */
export const PRO_FREE_UNTIL = new Date("2027-06-21T00:00:00+02:00");
export const PRO_FREE_UNTIL_LABEL = "21 juin 2027";

/**
 * Abonnement d'un pro, en mode présentation : aucun prix, aucun paiement. Tant que la date n'est pas passée, l'offre
 * est « gratuite jusqu'au 21 juin 2027 » ; après, elle est « bientôt » (l'encaissement des abonnements n'existe pas
 * encore : les tarifs sont en discussion).
 */
export type ProSubscriptionState = {
  state: "free_until" | "soon";
  label: string;
  until: string;
};

export function proSubscription(at: Date): ProSubscriptionState {
  const until = PRO_FREE_UNTIL.toISOString();
  return at < PRO_FREE_UNTIL
    ? { state: "free_until", label: `Gratuit jusqu'au ${PRO_FREE_UNTIL_LABEL}`, until }
    : { state: "soon", label: "Abonnement bientôt disponible", until };
}

/** Publications par mois et par pro (docs/01 : « une limite par mois » sans chiffre : 4, à revoir avec Damien). */
export const PRO_POSTS_PER_MONTH = 4;

/** Remise maximale d'un pro (garde-fou de saisie, financée par le pro). */
export const PRO_DISCOUNT_MAX_PERCENT = 50;

/** Photos de réalisations par fiche. */
export const PRO_MAX_PHOTOS = 12;

/** Remises d'un pro par grade : pourcentage entier, un grade sans remise est absent. */
export type ProDiscounts = Partial<Record<Grade, number>>;

/** Pourcentage de remise du pro pour ce grade (0 si le pro n'en accorde pas). */
export function discountForGrade(discounts: ProDiscounts, grade: Grade): number {
  return discounts[grade] ?? 0;
}

/**
 * La remise à montrer à une personne (« Pour ta … » du Garage, lot M5) : la sienne si son grade en a une, sinon la
 * première du grade au-dessus (« −10 % dès Sport »). `null` : ce pro n'accorde aucune remise à ce grade ni au-dessus.
 */
export function shownDiscount(discounts: ProDiscounts, grade: Grade): { percent: number; from: Grade | null } | null {
  const mine = discounts[grade];
  if (mine) return { percent: mine, from: null };
  for (const g of grades.slice(grades.indexOf(grade) + 1)) {
    const p = discounts[g];
    if (p) return { percent: p, from: g };
  }
  return null;
}

/**
 * Remises cohérentes : un grade plus élevé ne peut pas avoir une remise plus faible qu'un grade inférieur déjà
 * remisé (sinon le grade n'avantage pas). Renvoie le grade fautif, ou `null`.
 */
export function discountsOutOfOrder(discounts: ProDiscounts): Grade | null {
  let best = 0;
  for (const g of grades) {
    const p = discounts[g];
    if (p === undefined) continue;
    if (p < best) return g;
    best = p;
  }
  return null;
}

/** Début (inclus) et fin (exclue) du mois civil, à Paris, qui contient `at`. */
export function monthBounds(at: Date): { start: Date; end: Date } {
  const { year, month } = wallTime(at);
  const start = fromWallTime({ year, month, day: 1, hour: 0, minute: 0 });
  const end = fromWallTime({
    year: month === 12 ? year + 1 : year,
    month: month === 12 ? 1 : month + 1,
    day: 1,
    hour: 0,
    minute: 0,
  });
  return { start, end };
}

/** Publications restantes ce mois-ci. */
export function postsRemaining(usedThisMonth: number): number {
  return Math.max(0, PRO_POSTS_PER_MONTH - usedThisMonth);
}

/**
 * Date à partir de laquelle une fiche pro sans abonnement actif passe en « fiche de base » (lot 21). Identique à la
 * fin de la gratuité (`PRO_FREE_UNTIL`) ; l'encaissement des abonnements n'existe pas encore, donc après cette date
 * tous les pros sont en fiche de base tant que les tarifs ne sont pas décidés (docs/01 « en discussion »).
 */
export const PRO_PAID_FROM = PRO_FREE_UNTIL;

/** Abonnement d'un pro : `null` = aucun. (Aucun abonnement payant n'existe en V1 : toujours `null`.) */
export type ProSubscriptionStatus = { active: boolean } | null;

export type ProVisibility = {
  /** `true` : fiche complète. */
  full: boolean;
  /** Ce qui reste caché au public après la date : remises, publications, statistiques, garage favori, mise en avant. */
  hidden: { discounts: boolean; posts: boolean; stats: boolean; favoriteGarage: boolean; promotion: boolean };
  /** Bandeau de la casquette Pro (`null` tant que tout est visible). */
  banner: string | null;
};

/**
 * Visibilité d'une fiche pro (docs/01, lot 21) : avant `PRO_PAID_FROM` tout est visible ; après, sans abonnement actif,
 * la fiche de base garde nom, activités, ville et badge vérifié, et masque remises, publications, statistiques,
 * « garage favori » et mise en avant. Le pro lui-même voit le bandeau qui l'explique.
 */
export function proVisibility(_pro: unknown, subscription: ProSubscriptionStatus, at: Date): ProVisibility {
  const full = at < PRO_PAID_FROM || Boolean(subscription?.active);
  return {
    full,
    hidden: { discounts: !full, posts: !full, stats: !full, favoriteGarage: !full, promotion: !full },
    banner: full
      ? null
      : `Fiche de base depuis le ${PRO_FREE_UNTIL_LABEL} : remises, publications, statistiques et mise en avant sont réservées aux pros abonnés.`,
  };
}
