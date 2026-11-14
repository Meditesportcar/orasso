import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "./api.client";

// Partie B1, tour 7 : l'aide commune des pages privées qui se rechargent quand le compte change dans une autre fenêtre (le Crew ;
// « Tes photos » l'adoptera). Deux pièces :
//  1. `reloadAutomatically(scope)` : un rechargement EN GET (`location.replace`, jamais `reload()` : une page née d'un POST de document
//     renverrait le formulaire sous l'autre compte), compté (au 3e en moins de 20 s : refusé), marqué dans l'adresse
//     (`?apres-rechargement=1`) pour que le rendu serveur n'affiche RIEN de privé avant d'avoir confirmé le compte ;
//  2. `useSessionConfirmation(owner, afterReload)` : après un rechargement, la page reste neutre jusqu'à ce qu'un `/me` confirme que la
//     session courante est celle des données (une annonce reçue par l'ANCIEN document, ou une déconnexion, ne parvient jamais au
//     nouveau). Elle revérifie aussi, sans masquer, au retour de l'onglet, au retour du focus et sur `pageshow` (page restaurée).

/** Le paramètre d'adresse que pose le rechargement automatique ; le chargeur le lit (`isAfterReload`) et le dit à la page. */
export const AFTER_RELOAD_PARAM = "apres-rechargement";

/** Le rendu serveur d'une adresse venue d'un rechargement automatique ? (utilisable dans un chargeur) */
export const isAfterReload = (url: URL): boolean => url.searchParams.get(AFTER_RELOAD_PARAM) === "1";

const RELOAD_WINDOW_MS = 20_000;
const RELOAD_MAX = 3;
const keyOf = (scope: string) => `orasso-reloads:${scope}`;
/** Sans stockage, la marque du rechargement automatique est portée par `window.name` (il survit à un rechargement, sans stockage). */
const MARK = "orasso-reload:";

/**
 * Note un rechargement automatique ; faux si c'est le troisième en moins de 20 s (rien n'est alors rechargé). Sans stockage : un seul
 * rechargement automatique en moins de 20 s, marqué dans `window.name`.
 */
export function mayReload(scope: string, now: number): boolean {
  try {
    const raw = sessionStorage.getItem(keyOf(scope));
    const stamps = (raw ? (JSON.parse(raw) as unknown[]) : []).filter(
      (t): t is number => typeof t === "number" && now - t >= 0 && now - t < RELOAD_WINDOW_MS,
    );
    if (stamps.length + 1 >= RELOAD_MAX) return false;
    sessionStorage.setItem(keyOf(scope), JSON.stringify([...stamps, now]));
    return true;
  } catch {
    const last = window.name.startsWith(MARK) ? Number(window.name.slice(MARK.length)) : Number.NaN;
    if (now - last >= 0 && now - last < RELOAD_WINDOW_MS) return false;
    window.name = `${MARK}${now}`;
    return true;
  }
}

/** Recharge la page courante en GET, sans fragment, avec la marque « après un rechargement ». */
function replaceByGet(): void {
  const params = new URLSearchParams(window.location.search);
  params.set(AFTER_RELOAD_PARAM, "1");
  window.location.replace(`${window.location.pathname}?${params.toString()}`);
}

// Un rechargement lancé : un second appel (deux effets, deux annonces) ne le recompte pas.
let reloading = false;

/** Rechargement automatique compté : « started » (la page part, ou part déjà) ou « refused » (trop de rechargements : boucle). */
export function reloadAutomatically(scope: string): "started" | "refused" {
  if (reloading) return "started";
  if (!mayReload(scope, Date.now())) return "refused";
  reloading = true;
  replaceByGet();
  return "started";
}

/** Le geste de l'utilisateur (« Recharger la page ») : remet le compteur à zéro, puis recharge en GET. */
export function reloadManually(scope: string): void {
  try {
    sessionStorage.removeItem(keyOf(scope));
  } catch {
    // Stockage indisponible : le rechargement a lieu quand même.
  }
  if (window.name.startsWith(MARK)) window.name = "";
  reloading = true;
  replaceByGet();
}

/**
 * « ok » : le compte courant est celui des données ; « checking » : pas encore confirmé (après un rechargement : la page reste
 * neutre) ; « mismatch » : un autre compte, ou plus de session (401) : la page doit se recharger ; « failed » : la vérification n'a
 * pas pu se faire (réseau) alors qu'elle était attendue.
 */
export type SessionConfirmation = "ok" | "checking" | "mismatch" | "failed";

/** Délai de la vérification : au-delà, l'abandon donne `status: 0` donc « failed » (« Recharger la page »), jamais « Mise à jour… » à vie. */
export const ME_TIMEOUT_MS = 10_000;

/** Ce que la vérification doit savoir de la réponse de `/me` (le résultat de `apiFetch` convient). */
export type MeResult = { ok: true; data: { user: { id: string } } } | { ok: false; status: number };

const fetchMe = (): Promise<MeResult> => apiFetch<{ user: { id: string } }>("/me", { timeoutMs: ME_TIMEOUT_MS });

/**
 * L'état suivant d'après la réponse de `/me` : le compte est celui des données (« ok »), un autre ou plus de session (401 :
 * « mismatch »), ou la vérification n'a pas pu se faire (réseau, délai, serveur) : une vérification attendue (« checking », « failed »)
 * reste en échec ; une revérification silencieuse ne change rien.
 */
export function nextConfirmation(was: SessionConfirmation, res: MeResult, owner: string): SessionConfirmation {
  if (res.ok) return res.data.user.id === owner ? "ok" : "mismatch";
  if (res.status === 401) return "mismatch";
  return was === "checking" || was === "failed" ? "failed" : was;
}

/** Le vérificateur : chaque appel relit `/me` ; la réponse d'un appel plus ancien que le dernier est ignorée. Sans DOM : testable. */
export function createConfirmer(read: () => Promise<MeResult>) {
  let seq = 0;
  return async (
    owner: string,
    apply: (next: (was: SessionConfirmation) => SessionConfirmation) => void,
  ): Promise<void> => {
    const mine = ++seq;
    const res = await read();
    if (mine !== seq) return;
    apply((was) => nextConfirmation(was, res, owner));
  };
}

/**
 * `owner` : le compte qui a chargé les données de la page. `afterReload` : la page vient d'un rechargement automatique (le chargeur
 * lit `isAfterReload`) : elle démarre « checking » et le reste jusqu'à ce que `/me` confirme `owner`.
 */
export function useSessionConfirmation(owner: string, afterReload: boolean): SessionConfirmation {
  const [state, setState] = useState<SessionConfirmation>(afterReload ? "checking" : "ok");
  const confirmer = useRef<ReturnType<typeof createConfirmer> | null>(null);
  if (confirmer.current === null) confirmer.current = createConfirmer(fetchMe);
  const verify = useCallback(() => (confirmer.current as ReturnType<typeof createConfirmer>)(owner, setState), [owner]);
  const first = useRef(true);
  useEffect(() => {
    const wasFirst = first.current;
    first.current = false;
    if (!wasFirst || afterReload) void verify();
  }, [verify, afterReload]);
  useEffect(() => {
    let hiddenBefore = document.visibilityState === "hidden";
    let blurred = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenBefore = true;
      } else if (hiddenBefore) {
        hiddenBefore = false;
        // Un seul `/me` au retour d'onglet (le focus qui suit n'en lance pas un second).
        blurred = false;
        void verify();
      }
    };
    const onBlur = () => {
      blurred = true;
    };
    const onFocus = () => {
      if (!blurred || document.visibilityState === "hidden") return;
      blurred = false;
      void verify();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void verify();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [verify]);
  return state;
}

/** Le dernier compte annoncé par une AUTRE fenêtre : l'annonce de cette fenêtre (dont celle de sa propre mise en page) ne change rien. */
export const nextAnnounced = (
  was: string | null | undefined,
  announced: string | null,
  self: boolean,
): string | null | undefined => (self ? was : announced);

/**
 * La page affiche-t-elle les données d'un autre compte que le compte courant ? La mise en page dit un autre compte, une AUTRE fenêtre
 * en a annoncé un autre (ou aucun : `null`), ou `/me` ne confirme pas `owner`.
 */
export function isForeign(input: {
  owner: string;
  layoutUserId: string | undefined;
  announced: string | null | undefined;
  confirmed: SessionConfirmation;
}): boolean {
  const { owner, layoutUserId, announced, confirmed } = input;
  return (
    (layoutUserId !== undefined && layoutUserId !== owner) ||
    (announced !== undefined && announced !== owner) ||
    confirmed === "mismatch"
  );
}
