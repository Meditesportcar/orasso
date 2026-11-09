// Le direct : présence par GPS et compteurs « sur place » (lot R7d1, ARCHITECTURE-R7 § 1.2 et § 2.3, maquette R7.13).
// Un visiteur sans voiture (place visiteur, entrée libre) valide sa présence depuis l'appli, pendant les heures de
// l'événement et dans la zone de l'organisateur : « Je suis sur place » donne le tampon et le droit de vote, rien d'autre.
// La position est vérifiée une fois, en mémoire : ni cette règle ni l'API ne la gardent, seul le résultat est écrit.
// Fonctions pures, communes à l'API, au site et à l'appli (les clients n'y lisent que des constantes et des libellés :
// toute décision est prise par l'API).
import { distanceKm, type LatLng } from "../geo";

/** Zone de présence quand l'organisateur n'a rien saisi : 300 m autour du lieu (proposé, validé avec la maquette). */
export const PRESENCE_DEFAULT_RADIUS_M = 300;
/** Bornes du périmètre saisi par l'organisateur, en mètres. */
export const PRESENCE_RADIUS_BOUNDS = [50, 2000] as const;
/** Précision GPS au-delà de laquelle la position ne prouve rien : refusée (l'appli redemande une mesure). */
export const PRESENCE_MAX_ACCURACY_M = 150;
/** La présence s'ouvre 30 minutes avant le début de l'événement (installation, arrivée du public). */
export const PRESENCE_OPENS_BEFORE_MS = 30 * 60_000;
/** Essais par compte : 5 en 10 minutes (une mesure GPS mal placée se refait, pas un bouton qu'on martèle). */
export const PRESENCE_ATTEMPTS = { max: 5, windowMs: 10 * 60_000 } as const;

/** Rayon de la zone d'un événement : celui de l'organisateur, sinon 300 m. */
export function presenceRadiusM(event: { presenceRadiusM?: number | null }): number {
  return event.presenceRadiusM ?? PRESENCE_DEFAULT_RADIUS_M;
}

/** Rayon saisi valable : entier dans les bornes. */
export function validPresenceRadius(value: number): boolean {
  return Number.isInteger(value) && value >= PRESENCE_RADIUS_BOUNDS[0] && value <= PRESENCE_RADIUS_BOUNDS[1];
}

/** Heures où la présence peut se valider : de 30 minutes avant le début à la fin de l'événement (bornes extérieures). */
export function presenceWindow(event: { startsAt: Date; endsAt: Date }): { from: Date; to: Date } {
  return { from: new Date(event.startsAt.getTime() - PRESENCE_OPENS_BEFORE_MS), to: event.endsAt };
}

/**
 * Dans la fenêtre ? (fin exclue : à l'heure de fin, l'événement est fini). Un événement qui déclare des jours
 * (`days`, `event_days`) ne se valide que dans la plage d'UN jour (30 minutes avant son début jusqu'à sa fin) : la nuit
 * ou la pause entre deux jours, c'est fermé. Sans jour déclaré, la fenêtre de l'événement.
 */
export function inPresenceWindow(
  event: { startsAt: Date; endsAt: Date; days?: readonly { startsAt: Date; endsAt: Date }[] },
  now: Date,
): boolean {
  if (event.days?.length)
    return event.days.some((d) => inPresenceWindow({ startsAt: d.startsAt, endsAt: d.endsAt }, now));
  const w = presenceWindow(event);
  return now >= w.from && now < w.to;
}

/**
 * Dans la zone ? La distance à vol d'oiseau jusqu'au lieu doit tenir dans le rayon **plus** la précision annoncée par
 * l'appareil (un point incertain de 40 m à 330 m d'un rayon de 300 m peut être dans la zone). Bord inclus. Sans position
 * du lieu : faux (`no_zone` côté API). Une précision absente vaut 0 : aucune tolérance.
 */
export function inZone(
  point: LatLng,
  accuracyM: number | null | undefined,
  event: { lat: number | null; lng: number | null; presenceRadiusM?: number | null },
): boolean {
  if (event.lat === null || event.lng === null) return false;
  const meters = distanceKm(point, { lat: event.lat, lng: event.lng }) * 1000;
  return meters <= presenceRadiusM(event) + Math.max(0, accuracyM ?? 0);
}

export type PresenceRefusal =
  | "closed"
  | "use_qr"
  | "scan_ticket"
  | "ticket_required"
  | "pay_at_entry"
  | "closed_to_public"
  | "already_present"
  | "gps_imprecise"
  | "out_of_zone"
  | "no_zone";

/** Ce que la règle sait de la demande (l'API lit la base, la règle décide). */
export type PresenceContext = {
  event: {
    status: string;
    startsAt: Date;
    endsAt: Date;
    lat: number | null;
    lng: number | null;
    presenceRadiusM?: number | null;
    /** Jours déclarés (`event_days`) : la validation n'est possible que dans la plage d'un jour. */
    days?: readonly { startsAt: Date; endsAt: Date }[];
  };
  now: Date;
  /** Candidature de véhicule retenue ou entrée : un exposant se fait scanner à l'accueil, il ne valide pas par GPS. */
  holdsVehicleSlot: boolean;
  /**
   * Décision de Damien (09/11) : un billet PAYANT se fait scanner à l'entrée, le GPS est pour la gratuité. Accès de
   * l'événement (`publicAccess`, absent = entrée libre) et prix des types de billet (en centimes, liste vide = aucun
   * type). Le caractère payant ne dépend jamais de l'ouverture des ventes.
   */
  access?: { publicAccess: string; ticketPricesCents: readonly number[] };
  /**
   * Billet de la personne : `none` (aucun), `free` (montant enregistré à l'émission nul, même si le tarif a augmenté
   * depuis), `paid` (montant enregistré non nul). Absent = `none`.
   */
  ticket?: "none" | "free" | "paid";
  /** Une présence existe déjà pour ce compte et cet événement. */
  alreadyPresent: boolean;
  point: LatLng;
  accuracyM?: number | null;
};

/** L'entrée visiteur est payante : `paid_orasso` avec un type de billet à prix non nul, ou sans aucun type (ventes ouvertes ou non). */
export function paidOrassoEntry(ticketPricesCents: readonly number[]): boolean {
  return ticketPricesCents.length === 0 || ticketPricesCents.some((p) => p > 0);
}

/**
 * Refus tiré de l'accès de l'événement et du billet : fermé au public (`closed_to_public`), billetterie ou paiement
 * hors Orasso (`pay_at_entry`), billet payant (`scan_ticket`), entrée payante sans billet (`ticket_required`).
 * Entrée gratuite : jamais de refus, avec ou sans billet.
 */
export function entryRefusal(ctx: Pick<PresenceContext, "access" | "ticket">): PresenceRefusal | null {
  const access = ctx.access;
  if (!access) return null;
  if (access.publicAccess === "closed") return "closed_to_public";
  if (access.publicAccess === "paid_external") return "pay_at_entry";
  if (access.publicAccess !== "paid_orasso" || !paidOrassoEntry(access.ticketPricesCents)) return null;
  if (ctx.ticket === "paid") return "scan_ticket";
  return ctx.ticket === "free" ? null : "ticket_required";
}

/**
 * Les refus qui ne dépendent pas de la mesure : événement publié et ouvert (`closed`), exposant (`use_qr`), accès et
 * billet (`closed_to_public`, `pay_at_entry`, `scan_ticket`, `ticket_required`), déjà présent (`already_present`). C'est
 * la règle unique du bouton « Je suis sur place » (le bloc `live` de la fiche en tire `canValidatePresence`) et de la
 * validation : le bouton n'est proposé que si l'API ne refuserait pas avant même de regarder la position.
 */
export function presenceGate(
  ctx: Pick<PresenceContext, "event" | "now" | "holdsVehicleSlot" | "access" | "ticket" | "alreadyPresent">,
): PresenceRefusal | null {
  if (ctx.event.status !== "published" || !inPresenceWindow(ctx.event, ctx.now)) return "closed";
  if (ctx.holdsVehicleSlot) return "use_qr";
  const entry = entryRefusal(ctx);
  if (entry) return entry;
  if (ctx.alreadyPresent) return "already_present";
  return null;
}

/**
 * Refus de la présence par GPS, dans l'ordre où on l'explique : `presenceGate` (fermé, exposant, accès et billet, déjà
 * présent), puis position trop imprécise (`gps_imprecise`), lieu sans position (`no_zone`), hors de la zone
 * (`out_of_zone`). `null` = la présence est validée.
 */
export function presenceRefusal(ctx: PresenceContext): PresenceRefusal | null {
  const gate = presenceGate(ctx);
  if (gate) return gate;
  if (ctx.accuracyM !== null && ctx.accuracyM !== undefined && ctx.accuracyM > PRESENCE_MAX_ACCURACY_M) {
    return "gps_imprecise";
  }
  if (ctx.event.lat === null || ctx.event.lng === null) return "no_zone";
  if (!inZone(ctx.point, ctx.accuracyM, ctx.event)) return "out_of_zone";
  return null;
}

// --- Le direct : phase, jour, compteurs ----------------------------------------------------------------------------

/** Avant le début, pendant l'événement (du début à la fin, entre deux jours compris), après la fin. */
export type LivePhase = "before" | "running" | "after";

export function livePhase(event: { startsAt: Date; endsAt: Date }, now: Date): LivePhase {
  if (now < event.startsAt) return "before";
  return now < event.endsAt ? "running" : "after";
}

/**
 * « Jour 2 sur 4 » (version locale de R7d1 : la règle commune de R7-0 la remplacera à la fusion). Un événement sans jour
 * déclaré est un événement d'un jour (1 sur 1). Plusieurs jours : le jour en cours, sinon (nuit ou pause entre deux jours)
 * le dernier commencé ; avant le premier, 1 ; après le dernier, le dernier.
 */
export function liveDay(
  event: { days?: readonly { startsAt: Date; endsAt: Date }[] },
  now: Date,
): { dayIndex: number; dayCount: number } {
  const days = [...(event.days ?? [])].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (days.length < 2) return { dayIndex: 1, dayCount: 1 };
  let index = 0;
  for (const [i, d] of days.entries()) if (d.startsAt <= now) index = i;
  return { dayIndex: index + 1, dayCount: days.length };
}

export type LiveCounts = { onSiteCount: number; acceptedCount: number };

/**
 * Règle des absents : « N sur place, sur M retenues » n'existe que pendant l'événement. Avant, personne n'est « sur
 * place » ; après la fin, ni retenues ni présents ne sortent (le nombre de retenues moins le nombre de présents
 * donnerait celui des absents). Un événement non publié (annulé, brouillon) n'a pas de direct.
 */
export function liveCountsVisible(
  phase: LivePhase,
  status: string,
  counts: LiveCounts,
): { onSiteCount: number | null; acceptedCount: number | null } {
  if (phase !== "running" || status !== "published") return { onSiteCount: null, acceptedCount: null };
  return { onSiteCount: counts.onSiteCount, acceptedCount: counts.acceptedCount };
}

/** Comment la personne est sur place : entrée de son véhicule, billet contrôlé, ou présence par GPS. */
export type MyPresence = "checked_in" | "gps" | "ticket";

export function myPresenceOf(proofs: { checkedIn: boolean; ticketScanned: boolean; gps: boolean }): MyPresence | null {
  if (proofs.checkedIn) return "checked_in";
  if (proofs.ticketScanned) return "ticket";
  return proofs.gps ? "gps" : null;
}
