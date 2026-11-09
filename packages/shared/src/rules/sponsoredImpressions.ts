// Le comptage d'un affichage « Sponsorisé » du Fil, commun à l'appli et au site (lot R7k2, tour 3 après fusion).
// Fonctions pures et petits automates sans dépendance à l'écran, testés avec des horloges injectables :
// - `countsAsSeen` : la règle de visibilité (50 % de la carte, 30 % d'une carte plus haute que la zone utile) ;
// - `createImpressionSession` : un affichage par emplacement et par session, un clic qui attend l'affichage en cours ;
// - `createImpressionWatcher` : la reprise après une panne temporaire (30 s, puis 60 s, au plus 3 essais) ;
// - `createDayWatcher` : le changement de jour de Paris (minuit, retour au premier plan).
import { parisDayOf } from "./sponsored";

/** Part de la hauteur d'une carte qui doit être à la vue pour compter (tour 3). */
export const SEEN_SHARE = 0.5;
/** Part exigée d'une carte plus haute que la zone utile (règle des grands formats). */
export const SEEN_SHARE_TALL = 0.3;

/**
 * Une carte compte comme vue quand sa partie visible dans la zone utile (de `zoneTop`, sous la bande, à `zoneBottom`,
 * au-dessus de la barre d'onglets) atteint 50 % de sa hauteur ; pour une carte plus haute que la zone, 30 % de sa
 * hauteur (au plus la zone entière : une carte de plus de trois zones compte dès qu'elle la remplit).
 */
export function countsAsSeen(top: number, height: number, zoneTop: number, zoneBottom: number): boolean {
  const zone = zoneBottom - zoneTop;
  if (!(height > 0) || !(zone > 0)) return false;
  const visible = Math.min(top + height, zoneBottom) - Math.max(top, zoneTop);
  if (!(visible > 0)) return false;
  const needed = height > zone ? Math.min(SEEN_SHARE_TALL * height, zone) : SEEN_SHARE * height;
  // Marge d'arrondi : les mesures d'écran sont des flottants.
  return visible >= needed - 1e-6;
}

/** Un refus de l'API qui retire la carte : plafond atteint (409) ou emplacement arrêté (404). */
export const isSponsoredRefusal = (status: number | undefined): boolean => status === 409 || status === 404;

/** Résultat d'un envoi : `ok`, ou l'échec avec le statut HTTP (absent = pas de réponse, réseau). */
export type SendOutcome = { ok: true } | { ok: false; status?: number };
export type ImpressionResult = "recorded" | "refused" | "failed" | "skipped";

export type ImpressionSession = ReturnType<typeof createImpressionSession>;

/** Reprises d'un envoi échoué (réseau, 5xx) : après 30 s, puis 60 s ; trois essais au plus par montage. */
export const IMPRESSION_RETRY_DELAYS_MS = [30_000, 60_000] as const;

/** Délai avant le prochain essai après `failures` échecs, ou `null` quand les essais sont épuisés. */
export function nextRetryDelay(failures: number): number | null {
  return IMPRESSION_RETRY_DELAYS_MS[failures - 1] ?? null;
}

/** Attente maximale d'un clic derrière l'affichage en cours d'envoi. */
export const CLICK_WAIT_MS = 3000;

/**
 * La session des affichages : un emplacement (clé du compte, du jour de Paris et de l'emplacement) est envoyé une seule
 * fois ; `recorded` : l'API l'a enregistré ; `refused` : l'API a répondu 409/404, la carte ne s'affiche plus ; un échec
 * passager libère l'emplacement pour un nouvel essai.
 */
export function createImpressionSession() {
  const sent = new Set<string>();
  const refused = new Set<string>();
  const recorded = new Set<string>();
  const inflight = new Map<string, Promise<ImpressionResult>>();

  /** Réserve l'envoi ; faux si l'emplacement a déjà été envoyé ou refusé. */
  function claim(key: string): boolean {
    if (sent.has(key) || refused.has(key)) return false;
    sent.add(key);
    return true;
  }

  /**
   * Envoie l'affichage s'il ne l'est pas : un seul envoi à la fois par clé (un appel pendant l'envoi attend le même
   * résultat), jamais deux affichages pour la même clé.
   */
  function impress(key: string, send: (keepalive?: boolean) => Promise<SendOutcome>, keepalive = false) {
    const running = inflight.get(key);
    if (running) return running;
    if (recorded.has(key)) return Promise.resolve<ImpressionResult>("recorded");
    if (refused.has(key)) return Promise.resolve<ImpressionResult>("refused");
    if (!claim(key)) return Promise.resolve<ImpressionResult>("skipped");
    const run = (async (): Promise<ImpressionResult> => {
      let outcome: SendOutcome;
      try {
        outcome = await send(keepalive);
      } catch {
        outcome = { ok: false };
      }
      if (outcome.ok) {
        recorded.add(key);
        return "recorded";
      }
      if (isSponsoredRefusal(outcome.status)) {
        refused.add(key);
        return "refused";
      }
      sent.delete(key);
      return "failed";
    })().finally(() => inflight.delete(key));
    inflight.set(key, run);
    return run;
  }

  /**
   * Avant un clic : l'affichage est enregistré, ou en cours (on l'attend 3 s au plus), ou envoyé maintenant. Rend
   * `refused` si l'emplacement est refusé (le clic n'est alors pas envoyé), `timeout` si l'attente est dépassée.
   */
  async function beforeClick(
    key: string,
    send: (keepalive?: boolean) => Promise<SendOutcome>,
    waitMs = CLICK_WAIT_MS,
  ): Promise<ImpressionResult | "timeout"> {
    if (recorded.has(key)) return "recorded";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), waitMs);
    });
    try {
      return await Promise.race([impress(key, send, true), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    claim,
    impress,
    beforeClick,
    release: (key: string) => void sent.delete(key),
    refuse: (key: string) => void refused.add(key),
    isRefused: (key: string) => refused.has(key),
    isRecorded: (key: string) => recorded.has(key),
    reset() {
      sent.clear();
      refused.clear();
      recorded.clear();
      inflight.clear();
    },
  };
}

type Timers = {
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * La surveillance d'une carte : quand elle est vue (`onSeen`), l'affichage part ; après une panne temporaire, la
 * surveillance se réarme (`rearm`, qui revérifie la visibilité) après 30 s, puis 60 s, trois essais au plus ; un refus
 * (404/409) est définitif (`onRefused`).
 */
export function createImpressionWatcher(
  opts: {
    session: ImpressionSession;
    key: string;
    send: (keepalive?: boolean) => Promise<SendOutcome>;
    onRefused: () => void;
    rearm: () => void;
  } & Timers,
) {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let failures = 0;
  let disposed = false;
  let handle: unknown;
  return {
    onSeen() {
      if (disposed) return;
      void opts.session.impress(opts.key, opts.send).then((result) => {
        if (disposed) return;
        if (result === "refused") opts.onRefused();
        else if (result === "failed") {
          failures += 1;
          const delay = nextRetryDelay(failures);
          if (delay === null) return;
          handle = setTimer(() => {
            handle = undefined;
            if (!disposed) opts.rearm();
          }, delay);
        }
      });
    },
    dispose() {
      disposed = true;
      if (handle !== undefined) clearTimer(handle);
      handle = undefined;
    },
  };
}

const PARIS_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Millisecondes jusqu'à minuit à Paris (au plus 30 min : on réévalue, les changements d'heure déplacent minuit). */
export function msUntilParisMidnight(now: Date): number {
  const parts = Object.fromEntries(PARIS_TIME.formatToParts(now).map((p) => [p.type, Number(p.value)]));
  const elapsed =
    ((parts.hour ?? 0) * 3600 + (parts.minute ?? 0) * 60 + (parts.second ?? 0)) * 1000 + now.getMilliseconds();
  return Math.min(Math.max(86_400_000 - elapsed, 0), 30 * 60_000);
}

/**
 * Le jour de Paris, réactif : `onChange(jour)` à minuit (minuterie réarmée à chaque passage) et à l'appel de
 * `refresh()` (retour au premier plan de l'appli ou de l'onglet). L'horloge est injectable.
 */
export function createDayWatcher(opts: { onChange: (day: string) => void; now?: () => Date } & Timers) {
  const now = opts.now ?? (() => new Date());
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let day = parisDayOf(now());
  let handle: unknown;
  let stopped = false;
  function refresh() {
    if (stopped) return;
    const next = parisDayOf(now());
    if (next === day) return;
    day = next;
    opts.onChange(next);
  }
  function arm() {
    handle = setTimer(
      () => {
        refresh();
        if (!stopped) arm();
      },
      Math.max(msUntilParisMidnight(now()) + 1000, 1000),
    );
  }
  arm();
  return {
    refresh,
    current: () => day,
    stop() {
      stopped = true;
      if (handle !== undefined) clearTimer(handle);
    },
  };
}
