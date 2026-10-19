// Prix du public (lot 49, ARCHITECTURE-DA-V2 § 5.5, V11, prototype DA v2 `s-vote`) : « une voix, une seule, pas pour
// toi-même ». Votent les pointés, les billets scannés et le staff présent, du premier pointage de l'événement à sa fin ;
// le classement bouge en direct ; au règlement de J+2, le gagnant reçoit le badge et des points (50 par défaut,
// réglables, valeur « en discussion » dans docs/01 : H6, AS-V5). Fonctions pures, communes à l'API, au site et à l'appli.

/** Points du gagnant quand l'administration n'a rien réglé (`platform_settings` `points.audience_prize`). */
export const AUDIENCE_PRIZE_POINTS_DEFAULT = 50;
/** Pas de vote (et pas de prix) sous deux véhicules pointés : il faut pouvoir choisir. */
export const AUDIENCE_PRIZE_MIN_VEHICLES = 2;
/** Pas de prix sous trois voix : un gagnant élu par une ou deux personnes ne veut rien dire (choix du lot 49). */
export const AUDIENCE_PRIZE_MIN_VOTES = 3;
/** Résultats gardés au règlement : les dix premiers. */
export const AUDIENCE_PRIZE_RESULTS_KEPT = 10;

/** Ce qui fait d'une personne un votant (une seule de ces preuves suffit). */
export type AudienceVoter = {
  /** Entrée d'un de ses véhicules (pointage du staff : scan, liste, plaque, drive, express). */
  checkedInAt: Date | null;
  /** Billet du public contrôlé à l'entrée. */
  ticketScannedAt: Date | null;
  /** Membre du staff de l'événement, présence confirmée. */
  staffPresent: boolean;
};

export type AudienceVoteWindow = {
  status: string;
  endsAt: Date;
  /** Premier pointage de l'événement : le vote ouvre à ce moment. */
  firstCheckinAt: Date | null;
  /** Véhicules pointés (candidatures de véhicules entrées). */
  vehiclesCheckedIn: number;
};

export type AudienceVoteRefusal = "vote_closed" | "vote_not_open" | "not_checked_in";

/** Le vote ferme à la fin de l'événement. */
export function voteClosesAt(event: Pick<AudienceVoteWindow, "endsAt">): Date {
  return event.endsAt;
}

/** Fenêtre ouverte : événement publié, déjà commencé (premier pointage, deux véhicules au moins), pas encore fini. */
export function voteOpen(event: AudienceVoteWindow, now: Date): boolean {
  return (
    event.status === "published" &&
    now < voteClosesAt(event) &&
    event.firstCheckinAt !== null &&
    now >= event.firstCheckinAt &&
    event.vehiclesCheckedIn >= AUDIENCE_PRIZE_MIN_VEHICLES
  );
}

/** Peut voter maintenant ? `null` = oui ; sinon la raison, dans l'ordre où l'interface l'explique. */
export function canVote(voter: AudienceVoter, event: AudienceVoteWindow, now: Date): AudienceVoteRefusal | null {
  if (event.status !== "published" || now >= voteClosesAt(event)) return "vote_closed";
  if (!voter.checkedInAt && !voter.ticketScannedAt && !voter.staffPresent) return "not_checked_in";
  if (!voteOpen(event, now)) return "vote_not_open";
  return null;
}

/** « Pas pour toi-même » : ni sa propre candidature, ni un véhicule dont on est propriétaire. */
export function isOwnVehicle(voterUserId: string, target: { userId: string; vehicleOwnerId?: string | null }): boolean {
  return target.userId === voterUserId || target.vehicleOwnerId === voterUserId;
}

export type AudienceRanked = { applicationId: string; votes: number; rank: number };

/**
 * Classement des véhicules pointés (ceux sans voix compris, pour « 4e sur 142 ») : le plus de voix d'abord ; à égalité,
 * le premier pointé ; un rang par véhicule. Les voix pour un véhicule non pointé sont ignorées.
 */
export function rankResults(
  votes: readonly { applicationId: string }[],
  checkins: readonly { applicationId: string; checkedInAt: Date }[],
): AudienceRanked[] {
  const count = new Map<string, number>();
  for (const v of votes) count.set(v.applicationId, (count.get(v.applicationId) ?? 0) + 1);
  return [...checkins]
    .sort(
      (a, b) =>
        (count.get(b.applicationId) ?? 0) - (count.get(a.applicationId) ?? 0) ||
        a.checkedInAt.getTime() - b.checkedInAt.getTime() ||
        a.applicationId.localeCompare(b.applicationId),
    )
    .map((c, i) => ({ applicationId: c.applicationId, votes: count.get(c.applicationId) ?? 0, rank: i + 1 }));
}

/** Un prix est décerné à partir de deux véhicules pointés et trois voix. */
export function prizeAwardable(input: { vehicles: number; votes: number }): boolean {
  return input.vehicles >= AUDIENCE_PRIZE_MIN_VEHICLES && input.votes >= AUDIENCE_PRIZE_MIN_VOTES;
}

/** Le gagnant : premier du classement, si le prix est décerné. */
export function audienceWinner(ranked: readonly AudienceRanked[], totalVotes: number): AudienceRanked | null {
  const first = ranked[0];
  if (!first || first.votes === 0 || !prizeAwardable({ vehicles: ranked.length, votes: totalVotes })) return null;
  return first;
}

/** Points du gagnant : le réglage de l'administration, sinon la valeur par défaut. */
export function pointsForWinner(settings: { "points.audience_prize"?: number | null } | null | undefined): number {
  const value = settings?.["points.audience_prize"];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : AUDIENCE_PRIZE_POINTS_DEFAULT;
}
