// Appels de l'API depuis le navigateur (même origine : le cookie de session part tout seul).
import { ACTOR_HEADER, type ApiError } from "@orasso/shared";

import { CASQUETTE_GONE_HREF } from "./actor";
import { actorHeaders } from "./actorRoutes";

export type ClientResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiError["error"] };

export async function apiFetch<T>(
  path: string,
  init: {
    method?: string;
    json?: unknown /** La requête survit à un changement de page (« lu » posé juste avant de naviguer). */;
    keepalive?: boolean;
    /** Délai avant d'abandonner la requête (ms) ; sans lui, aucun (comportement d'origine). */
    timeoutMs?: number;
    /** Lot R9h (T49) : la clé d'auteur de la casquette de l'espace (`useActor()`) ; posée seulement sur la liste blanche. */
    actor?: string | null;
  } = {},
): Promise<ClientResult<T>> {
  const headers: Record<string, string> = {
    ...(init.json !== undefined ? { "content-type": "application/json" } : {}),
    ...actorHeaders(init.method ?? "GET", path, init.actor),
  };
  try {
    const res = await fetch(`/api${path}`, {
      method: init.method ?? "GET",
      headers: Object.keys(headers).length ? headers : undefined,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      credentials: "same-origin",
      keepalive: init.keepalive,
      signal: init.timeoutMs ? AbortSignal.timeout(init.timeoutMs) : undefined,
    });
    if (res.ok) return { ok: true, status: res.status, data: (res.status === 204 ? null : await res.json()) as T };
    const payload = (await res.json().catch(() => null)) as Partial<ApiError> | null;
    // Casquette périmée (structure quittée, fiche supprimée) : l'API refuse l'acteur ; on revient à « Moi » avec l'avis (R9h).
    if (res.status === 403 && payload?.error?.code === "persona_forbidden" && headers[ACTOR_HEADER]) {
      window.location.assign(CASQUETTE_GONE_HREF);
    }
    return {
      ok: false,
      status: res.status,
      error: payload?.error ?? { code: "internal", message: "Erreur inattendue." },
    };
  } catch {
    return { ok: false, status: 0, error: { code: "internal", message: "Connexion impossible. Réessaie." } };
  }
}
