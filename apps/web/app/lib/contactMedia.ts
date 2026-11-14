import {
  CONTACT_MEDIA_FALLBACK_MESSAGE,
  type ContactMediaResult,
  createContactMediaFlow,
  type OpenConversationResult,
  parseAuthorKey,
} from "@orasso/shared";

import { apiFetch } from "./api.client";

/** Délai de l'appel « Contacter <média> » : au-delà, la requête est abandonnée et l'écran dit l'erreur (reprise possible). */
export const CONTACT_MEDIA_TIMEOUT_MS = 15_000;

/** L'appel de « Contacter <média> » (lot R9i) : ne lève jamais ; `null` si la clé du média est illisible. */
export function contactMediaCall(
  mediaKey: string,
  // `apiFetch` est un module « client » (absent du rendu serveur et des tests) : injecté pour les tests.
  fetcher: typeof apiFetch = apiFetch,
): (() => Promise<ContactMediaResult>) | null {
  const id = parseAuthorKey(mediaKey)?.id;
  if (!id) return null;
  return async () => {
    const res = await fetcher<OpenConversationResult>(`/media/${encodeURIComponent(id)}/conversation`, {
      method: "POST",
      timeoutMs: CONTACT_MEDIA_TIMEOUT_MS,
    });
    return res.ok ? { ok: true, conversationId: res.data.id } : { ok: false, message: res.error.message };
  };
}

/** L'état de la navigation du routeur (`useNavigation()`) : `pathname` est celui de la page visée (`null` à l'arrêt). */
export type NavigationSnapshot = { state: "idle" | "loading" | "submitting"; pathname: string | null };

/**
 * Une navigation vers une autre adresse vient de commencer : l'ancien écran reste monté pendant que les chargeurs de la page suivante
 * tournent, mais l'opération « Contacter » qu'il a lancée n'a plus lieu d'être (sa réponse ne doit pas remplacer le choix de l'utilisateur).
 */
export function navigationLeavesPage(nav: NavigationSnapshot, currentPath: string): boolean {
  return nav.state !== "idle" && nav.pathname !== null && nav.pathname !== currentPath;
}

/** Le routeur de données de React Router, réduit à ce que lit le contrôleur (`UNSAFE_DataRouterContext` : son état est celui du routeur lui-même). */
export type RouterLike = {
  state: {
    location: { pathname: string };
    navigation: { state: NavigationSnapshot["state"]; location?: { pathname: string } };
  };
  subscribe(listener: () => void): () => void;
};

/** Délai maximal d'attente du retour au repos du routeur (même adresse en rechargement) avant de dire l'erreur de reprise. */
export const SETTLE_TIMEOUT_MS = 10_000;

/**
 * L'enchaînement « Contacter <média> » du site, câblé au routeur (lot R9i, tour 4) : un seul par écran, périmé au démontage, au changement
 * de compte (`cancel`) et dès que le routeur part vers une autre adresse. L'état du routeur est lu **dans le routeur lui-même** à la
 * réponse (pas l'état rendu par `useNavigation()`, qui n'est mis à jour qu'à la validation du rendu, dans `startTransition`) :
 * - au repos : la conversation s'ouvre ;
 * - une autre adresse est en cours (ou déjà atteinte) : le choix de l'utilisateur prime, rien ne s'ouvre, rien ne se dit ;
 * - la même adresse recharge (navigation vers la même adresse) : on attend le retour au repos, puis on ouvre ; sans retour au repos dans le délai, l'erreur
 *   de reprise est dite.
 */
export function createContactMediaController(deps: {
  router: RouterLike;
  navigate: (to: string) => void;
  onError: (message: string | null) => void;
  setBusy: (busy: boolean) => void;
  settleTimeoutMs?: number;
}) {
  const { router, setBusy } = deps;
  const settleMs = deps.settleTimeoutMs ?? SETTLE_TIMEOUT_MS;
  const flow = createContactMediaFlow();
  let origin = "";
  let unwatch: (() => void) | null = null;
  let stopWaiting: (() => void) | null = null;
  // Un appel est en route (le flux partagé ignore un second appel ; ici on ne touche pas aux écoutes du premier).
  let inFlight = false;
  let seq = 0;

  const snapshot = (): NavigationSnapshot => ({
    state: router.state.navigation.state,
    pathname: router.state.navigation.location?.pathname ?? null,
  });
  /** Une autre adresse est en cours, ou déjà atteinte : l'écran qui a lancé l'appel n'est plus celui de l'utilisateur. */
  const leaves = () => navigationLeavesPage(snapshot(), origin) || router.state.location.pathname !== origin;

  function clear() {
    unwatch?.();
    unwatch = null;
    stopWaiting?.();
    stopWaiting = null;
  }
  function cancel() {
    seq++;
    inFlight = false;
    clear();
    flow.cancel(setBusy);
  }
  function arrive(conversationId: string) {
    clear();
    if (leaves()) return;
    // La génération de cette opération : une annulation (`cancel`) ou un nouvel appel entre-temps périme aussi la micro-tâche ci-dessous.
    const mine = seq;
    if (snapshot().state === "idle") return deps.navigate(`/app/messages/${conversationId}`);
    // Même adresse en rechargement : on attend le retour au repos (ou une autre destination, qui annule), borné.
    const stop = () => {
      unsubscribe();
      clearTimeout(timer);
      stopWaiting = null;
    };
    const unsubscribe = router.subscribe(() => {
      if (leaves()) return stop();
      if (snapshot().state !== "idle") return;
      stop();
      // Après la fin de la mise à jour du routeur (appelée depuis son propre abonné, une navigation lancée ici serait écrasée par la suite de
      // sa mise à jour) : on relit alors l'état une dernière fois.
      queueMicrotask(() => {
        if (mine === seq && !leaves() && snapshot().state === "idle") deps.navigate(`/app/messages/${conversationId}`);
      });
    });
    const timer = setTimeout(() => {
      stop();
      deps.onError(CONTACT_MEDIA_FALLBACK_MESSAGE);
    }, settleMs);
    stopWaiting = stop;
  }

  return {
    /** Lance l'appel depuis la page `fromPath` ; sans effet si un appel est déjà en route. */
    async open(call: () => Promise<ContactMediaResult>, fromPath: string): Promise<boolean> {
      if (inFlight) return false;
      inFlight = true;
      const mine = ++seq;
      clear();
      origin = fromPath;
      unwatch = router.subscribe(() => {
        if (leaves()) cancel();
      });
      const done = await flow.open(call, { setBusy, onError: deps.onError, navigate: arrive });
      // Terminée : on n'écoute plus le départ vers une autre adresse (sauf une attente de retour au repos, qui a la sienne). Une opération
      // annulée entre-temps (ou remplacée) ne touche à rien.
      if (mine === seq) {
        inFlight = false;
        unwatch?.();
        unwatch = null;
      }
      return done;
    },
    cancel,
  };
}
