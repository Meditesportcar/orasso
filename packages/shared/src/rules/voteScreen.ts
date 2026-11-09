// Écran du prix du public, parties communes à l'appli et au site (lot R7-0, tour 2) : la minuterie de la clôture, ce que
// montre la zone du classement après un vote, et la phrase quand le classement n'est pas servi.

/** Marge après l'échéance : la relecture part quand le serveur est sûrement passé de l'autre côté. */
export const DEADLINE_MARGIN_MS = 1_000;
/** Une minuterie ne dépasse pas ce délai (setTimeout plafonne à ~24,8 jours) : au-delà, elle se ré-arme. */
const MAX_TIMER_MS = 6 * 60 * 60 * 1000;

/**
 * Exécute `run` une seule fois quand `deadline` est passée (plus la marge), sans attendre un message du serveur : le
 * classement et le droit de voter changent à la clôture, que personne n'ait voté ou non. Renvoie l'annulation.
 * `now` est l'horloge de l'appli (horloge simulée comprise) ; une échéance déjà passée ne déclenche rien.
 */
export function runAtDeadline(
  deadline: Date | null,
  run: () => void,
  now: () => Date,
  margin = DEADLINE_MARGIN_MS,
): () => void {
  if (!deadline || now().getTime() >= deadline.getTime()) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    const left = deadline.getTime() + margin - now().getTime();
    if (left <= 0) {
      run();
      return;
    }
    timer = setTimeout(arm, Math.min(left, MAX_TIMER_MS));
  };
  arm();
  return () => {
    if (timer !== undefined) clearTimeout(timer);
  };
}

export type RankingZone = "ready" | "loading" | "failed" | "hidden";

/**
 * Que montre l'écran à l'emplacement du classement ? Le classement n'est servi qu'après la voix : après un vote réussi,
 * si la relecture échoue (HTTP ou réseau), l'écran le dit avec « Réessayer » au lieu de rester vide ; tant qu'elle n'est
 * pas revenue, il dit qu'il charge. `hidden` : le classement n'est pas servi à cette personne (voix pas encore donnée).
 */
export function rankingZoneState(input: { voted: boolean; rankingHidden: boolean; loadFailed: boolean }): RankingZone {
  if (!input.rankingHidden) return "ready";
  if (!input.voted) return "hidden";
  return input.loadFailed ? "failed" : "loading";
}
