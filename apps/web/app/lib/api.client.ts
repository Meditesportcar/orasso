// Appels de l'API depuis le navigateur (même origine : le cookie de session part tout seul).
import type { ApiError } from "@orasso/shared";

export type ClientResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiError["error"] };

export async function apiFetch<T>(
  path: string,
  init: { method?: string; json?: unknown } = {},
): Promise<ClientResult<T>> {
  try {
    const res = await fetch(`/api${path}`, {
      method: init.method ?? "GET",
      headers: init.json !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      credentials: "same-origin",
    });
    if (res.ok) return { ok: true, status: res.status, data: (res.status === 204 ? null : await res.json()) as T };
    const payload = (await res.json().catch(() => null)) as Partial<ApiError> | null;
    return {
      ok: false,
      status: res.status,
      error: payload?.error ?? { code: "internal", message: "Erreur inattendue." },
    };
  } catch {
    return { ok: false, status: 0, error: { code: "internal", message: "Connexion impossible. Réessaie." } };
  }
}
