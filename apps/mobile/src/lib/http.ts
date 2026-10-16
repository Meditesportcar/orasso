// Client HTTP de l'API Orasso : jeton de session en `Authorization: Bearer` (plugin `bearer` de Better Auth),
// erreurs de l'API (`{"error":{"code","message","details"}}`) et pannes réseau rendues sous une même forme.
import { authErrorFallback, authErrorLabels, type ErrorCode } from "@orasso/shared";
import { Platform } from "react-native";

import { apiUrl } from "@/api";

import { authOriginHeader } from "./api/cookies";

let sessionToken: string | null = null;
export const setSessionToken = (token: string | null) => {
  sessionToken = token;
};
export const getSessionToken = () => sessionToken;

/** `status` 0 : pas de réponse (hors ligne, API arrêtée, délai dépassé). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "network" | string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
  /** Délai avant d'abandonner (ms). */
  timeout?: number;
  /** En-têtes en plus (`x-device-id` des lots de scans). */
  headers?: Record<string, string>;
  /** Cookies de Better Auth (étape « code » de la double authentification) : gardés par le navigateur en recette web. */
  cookies?: boolean;
};

export const NETWORK_MESSAGE = "Pas de connexion : réessaie quand le réseau revient.";

/** Double authentification exigée (espace organisateur, mode staff organisateur) : que faire, dans l'appli. */
export const TWO_FACTOR_REQUIRED_MESSAGE =
  "Double authentification obligatoire : déconnecte-toi puis reconnecte-toi avec ton code. Pas encore de code ? Active-la sur le site, rubrique Sécurité.";

/** Message lisible d'une erreur d'API ou d'une erreur inattendue. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.code === "two_factor_required") return TWO_FACTOR_REQUIRED_MESSAGE;
  if (error instanceof ApiRequestError) return error.message;
  return "Une erreur est survenue. Réessaie.";
}

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const { data } = await requestWithHeaders<T>(path, options);
  return data;
}

export async function requestWithHeaders<T>(
  path: string,
  { method = "GET", body, form, timeout = 15_000, headers: extra, cookies = false }: Options = {},
): Promise<{ data: T; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers: Record<string, string> = { ...extra };
  if (sessionToken) headers.authorization = `Bearer ${sessionToken}`;
  // Téléphone : Better Auth exige un en-tête Origin quand des cookies accompagnent la requête (étape « code », appareil
  // de confiance) ; le navigateur le pose lui-même en recette web.
  Object.assign(headers, authOriginHeader(path, Platform.OS !== "web", apiUrl("/")));
  if (body !== undefined) headers["content-type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
      ...(cookies ? { credentials: "include" as const } : {}),
    });
  } catch {
    throw new ApiRequestError(0, "network", NETWORK_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    // Format de l'API métier, ou format de Better Auth (`{code, message}`).
    const api = (json as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error;
    const auth = json as { code?: string; message?: string } | null;
    throw new ApiRequestError(
      response.status,
      api?.code ?? auth?.code ?? "internal",
      api?.message ?? auth?.message ?? `Erreur ${response.status}`,
      api?.details,
    );
  }
  return { data: json as T, headers: response.headers };
}

/** Message en français d'un code d'erreur de Better Auth. */
export function authErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "Une erreur est survenue. Réessaie.";
  if (error.isNetwork) return error.message;
  return (
    authErrorLabels[error.code] ??
    (error.status >= 500 ? "Le service est momentanément indisponible." : authErrorFallback)
  );
}
