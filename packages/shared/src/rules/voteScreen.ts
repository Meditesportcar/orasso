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

/** Délais croissants entre deux relectures tant que l'API ne confirme pas la clôture (au plus 2 minutes en tout). */
export const CLOSING_RETRY_DELAYS_MS: readonly number[] = [2_000, 4_000, 8_000, 15_000, 30_000, 60_000];
/** Après des essais épuisés, une réponse tardive ne relance pas les relectures avant ce délai (pas de boucle). */
const CLOSING_RESTART_AFTER_MS = 30_000;

export type ClosingWatch = {
  /** À appeler à chaque réponse reçue : si l'heure du serveur a passé l'échéance et que l'API dit encore « ouvert », relit. */
  check: () => void;
  stop: () => void;
};

/**
 * Clôture du vote (lot R7-0, tour 3) : à l'échéance, relit le classement et le droit de voter, puis **réessaie** avec un
 * délai croissant et borné jusqu'à ce que l'API confirme la clôture (`reload` renvoie `true`). `now` est **l'heure du
 * serveur** estimée (décalage calculé à partir de ses réponses), jamais l'horloge brute du téléphone : un téléphone en
 * avance d'une minute ne relit pas trop tôt pour ne plus jamais relire. Une réponse reçue après l'échéance (`check`)
 * relance les relectures si l'API disait encore « ouvert » (réponse partie avant la clôture, arrivée après).
 */
export function watchClosing(input: {
  deadline: Date | null;
  now: () => Date;
  reload: () => Promise<boolean>;
  margin?: number;
  delays?: readonly number[];
}): ClosingWatch {
  const { deadline, now, reload, margin = DEADLINE_MARGIN_MS, delays = CLOSING_RETRY_DELAYS_MS } = input;
  let stopped = false;
  let confirmed = false;
  let running = false;
  let endedAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const due = () => deadline !== null && now().getTime() >= deadline.getTime() + margin;

  const attempt = async (tries: number): Promise<void> => {
    running = true;
    let closed = false;
    try {
      closed = await reload();
    } catch {
      closed = false;
    }
    if (stopped) return;
    if (closed) {
      confirmed = true;
      running = false;
      return;
    }
    const wait = delays[tries];
    if (wait === undefined) {
      running = false;
      endedAt = now().getTime();
      return;
    }
    timer = setTimeout(() => void attempt(tries + 1), wait);
  };

  const arm = () => {
    if (!deadline || stopped || confirmed) return;
    const left = deadline.getTime() + margin - now().getTime();
    if (left <= 0) {
      if (!running) void attempt(0);
      return;
    }
    timer = setTimeout(arm, Math.min(left, MAX_TIMER_MS));
  };
  arm();

  return {
    check: () => {
      if (stopped || confirmed || running || !due()) return;
      if (now().getTime() - endedAt < CLOSING_RESTART_AFTER_MS) return;
      void attempt(0);
    },
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

export type RankingZone = "ready" | "loading" | "failed" | "hidden";

/**
 * Que montre l'écran à l'emplacement du classement ? `ready` : servi. Sinon, quel que soit l'état du vote (ouvert, voté,
 * clos) : si la lecture échoue (HTTP ou réseau), l'écran le dit avec « Réessayer » au lieu de rester vide (lot R7-0,
 * tour 3) ; tant qu'elle n'est pas revenue après un vote ou une clôture, il dit qu'il charge. `hidden` : le classement
 * n'est pas servi à cette personne (voix pas encore donnée, vote encore ouvert).
 */
export function rankingZoneState(input: {
  voted: boolean;
  rankingHidden: boolean;
  loadFailed: boolean;
  /** Le vote est clos (fin de l'événement ou règlement) : le classement est servi à tout le monde, il est en route. */
  closed?: boolean;
}): RankingZone {
  if (!input.rankingHidden) return "ready";
  if (input.loadFailed) return "failed";
  if (!input.voted && !input.closed) return "hidden";
  return "loading";
}
