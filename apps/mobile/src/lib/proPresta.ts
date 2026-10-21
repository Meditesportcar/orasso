// Casquettes Pro et Prestataire, DA v2 (lot 54) : calculs purs des six onglets (prototype `s-pro`, `s-pscan`,
// `s-pstats`, `s-missions`, `s-pcand`, `s-vitrine`). Aucune règle métier ici : elles sont dans l'API et `@orasso/shared`.
import type { IconName } from "@orasso/design-system/native";
import {
  arrivalHourLabel,
  type Grade,
  gradeLabels,
  grades,
  proV2Labels as L,
  type MissionCard,
  missionTexts,
  type ProActivity,
  type ProDiscounts,
  type ProviderApplicationView,
  type ProviderPower,
  providerPowerLabels,
  providerSpotTexts,
  type VendorTypeCode,
  vendorTypeLabels,
  wallTime,
} from "@orasso/shared";

import { dayCountdown, formatShortDate } from "./format";

// --- Icônes -----------------------------------------------------------------------------------------------------
// Le jeu d'icônes du système de design est gelé hors ajouts datés : on prend les formes les plus proches de celles du
// prototype (étincelle, bouclier, clé…) dans le jeu existant. Consigné dans le journal des choix.

export const proActivityIcons: Record<ProActivity, IconName> = {
  garage: "vehicle",
  preparation: "up",
  detailing: "wash",
  covering: "gallery",
  parts: "shop",
  tyres: "explore",
  bodywork: "incident",
  tint: "weatherClear",
  upholstery: "cards",
  audio: "live",
  inspection: "check",
  other: "add",
};

export const tradeIcons: Record<VendorTypeCode, IconName> = {
  food_truck: "shop",
  barber: "profile",
  tattoo: "incident",
  photographer: "gallery",
  animation: "live",
  merch: "briefcase",
  stand: "badge",
  other: "add",
};

export const powerIcon: IconName = "live";
export const waterIcon: IconName = "wash";
export const frontageIcon: IconName = "list";

// --- Nombres ----------------------------------------------------------------------------------------------------

/** « 1 284 » : milliers séparés par une espace insécable. */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** « 4,9 » : un chiffre après la virgule, virgule française. */
export const formatRating = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

// --- Fiche pro --------------------------------------------------------------------------------------------------

export type DiscountCell = { key: string; label: string; percent: number };

/**
 * Remises par grade en grands chiffres (`s-pro` : Rodage 5 % · Route 8 % · Sport 10 % · Circuit+ 15 %). Le grade
 * « Légende » ne s'ajoute que si sa remise diffère de celle de Circuit ; sinon « Circuit+ » les couvre tous les deux.
 * Un grade sans remise n'a pas de case.
 */
export function discountCells(discounts: ProDiscounts): DiscountCell[] {
  const cell = (g: Grade, label = gradeLabels[g]): DiscountCell[] => {
    const percent = discounts[g];
    return percent === undefined ? [] : [{ key: g, label, percent }];
  };
  const circuit = discounts.circuit;
  const legend = discounts.legende;
  const merged = circuit !== undefined && (legend === undefined || legend === circuit);
  return [
    ...cell("rodage"),
    ...cell("route"),
    ...cell("sport"),
    ...(merged ? cell("circuit", `${gradeLabels.circuit}+`) : [...cell("circuit"), ...cell("legende")]),
  ];
}

// --- Stats -------------------------------------------------------------------------------------------------------

export type GradeBar = { grade: Grade; label: string; count: number; percent: number };

/** Barres des remises par grade : les quatre premiers grades toujours, « Légende » seulement s'il a des remises. */
export function gradeBars(byGrade: Partial<Record<Grade, number>>): GradeBar[] {
  const shown = grades.filter((g) => g !== "legende" || (byGrade[g] ?? 0) > 0);
  const max = Math.max(1, ...shown.map((g) => byGrade[g] ?? 0));
  return shown.map((grade) => {
    const count = byGrade[grade] ?? 0;
    return {
      grade,
      label: gradeLabels[grade],
      count,
      percent: count === 0 ? 0 : Math.max(4, Math.round((count / max) * 100)),
    };
  });
}

// --- Missions (prestataire) ---------------------------------------------------------------------------------------

/** Le besoin que la carte met en avant : le premier non comblé. */
export const primaryNeed = (card: MissionCard) => card.needs[0] ?? null;

/** « 1 place sur 2 », « 1 food truck », « 2 food trucks » ; « Retenue » quand la candidature de l'utilisateur l'est. */
export function missionTag(card: MissionCard): { label: string; mine: boolean } {
  if (card.myApplication?.status === "accepted") return { label: missionTexts.retained, mine: true };
  const need = primaryNeed(card);
  if (!need) return { label: "", mine: false };
  return { label: missionTexts.places(need.remaining, need.quantity, need.tradeLabel), mine: false };
}

/** « Rivesaltes Auto Passion · 18 km · 800 visiteurs attendus » (distance et visiteurs si connus). */
export function missionDetail(card: MissionCard): string {
  return [
    card.structureName,
    card.distanceKm === null ? null : missionTexts.distance(card.distanceKm),
    card.expectedVisitors === null ? null : missionTexts.expectedVisitors(card.expectedVisitors),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Ce que l'organisateur fournit : « Électricité fournie », « Eau sur place », « Pas d'électricité · groupe autorisé ». */
export function missionFacts(card: MissionCard): string[] {
  const need = primaryNeed(card);
  if (!need) return [];
  const facts = [missionTexts.power(need.power)];
  if (need.water) facts.push(missionTexts.water);
  if (need.frontageM) facts.push(`${need.frontageM} m de façade`);
  return facts;
}

/** Candidature qui peut être reproposée : aucune active sur cette mission. */
export const alreadyApplied = (card: MissionCard) =>
  Boolean(card.myApplication && !["withdrawn", "refused", "expired", "cancelled"].includes(card.myApplication.status));

// --- Candidatures (prestataire) -----------------------------------------------------------------------------------

export type CandidatureKind = "retained" | "pending" | "waitlist" | "refused" | "withdrawn" | "other";

export function candidatureKind(app: Pick<ProviderApplicationView, "status">): CandidatureKind {
  switch (app.status) {
    case "accepted":
      return "retained";
    case "pending":
      return "pending";
    case "waitlisted":
    case "offered":
      return "waitlist";
    case "refused":
      return "refused";
    case "withdrawn":
    case "cancelled":
    case "expired":
      return "withdrawn";
    default:
      return "other";
  }
}

const POWER_DETAIL = (p: ProviderPower | null) =>
  p === "a16" || p === "a32" ? `électricité ${providerPowerLabels[p]}` : null;

/** « Emplacement B2 · arrivée 16 h · électricité 16 A » : seulement ce qui est connu (retenue). */
export function spotLine(app: ProviderApplicationView): string | null {
  const parts = [
    app.spot?.label ? providerSpotTexts.spot(app.spot.label) : null,
    app.installAt ? providerSpotTexts.arrival(arrivalHourLabel(new Date(app.installAt))) : null,
    POWER_DETAIL(app.power),
  ].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(" · ") : null;
}

/** « Envoyée le 19 oct · en attente de la réponse de l'équipe organisatrice » : aucune échéance n'est promise. */
export function pendingLine(app: ProviderApplicationView): string {
  return L.pendingLine(formatShortDate(app.createdAt));
}

/** « J-6 » devant la date de l'événement (retenue à venir). */
export const countdown = (app: ProviderApplicationView, now: Date) => dayCountdown(app.event.startsAt, now);

/** Avis d'une candidature passée : « Avis · 5/5 » et son commentaire. */
export function reviewTag(app: ProviderApplicationView): string | null {
  return app.review ? `Avis · ${formatRating(app.review.rating)}/5` : null;
}

/** Mission d'une candidature : « Food truck · 1 place sur 2 » ou « Sans mission précise ». */
export function needLabel(app: ProviderApplicationView): string {
  if (!app.need) return L.withoutMission;
  // Retenue : la place est la sienne, le décompte des places restantes n'a plus de sens pour elle.
  if (app.status === "accepted") return app.need.tradeLabel;
  return `${app.need.tradeLabel} · ${missionTexts.places(app.need.remaining, app.need.quantity, app.need.tradeLabel)}`;
}

export const tradeLabelOf = (code: VendorTypeCode) => vendorTypeLabels[code];

// --- Vitrine ----------------------------------------------------------------------------------------------------

const LONG_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « août 2026 » (avis des organisateurs). */
export function monthYear(iso: string | Date): string {
  const w = wallTime(new Date(iso));
  return `${LONG_MONTHS[w.month - 1]} ${w.year}`;
}

/** « LB » : initiales des deux premiers mots du nom (logo rond de la vitrine). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1 ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}` : (words[0] ?? "?").slice(0, 2)
  ).toUpperCase();
}
