// Appels de l'API pendant le rendu serveur (loaders et actions). Le cookie de session du visiteur est transmis tel
// quel ; les `Set-Cookie` de l'API (connexion, déconnexion) sont renvoyés au navigateur par `withCookies`.
import type { ApiError, Me } from "@orasso/shared";
import { redirect } from "react-router";

function apiBase(): string {
  return process.env.API_INTERNAL_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`;
}

/** Origine publique du site, telle que le navigateur la voit (Better Auth contrôle l'en-tête Origin). */
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export type ApiOk<T> = { ok: true; status: number; data: T; headers: Headers };
export type ApiFail = { ok: false; status: number; error: ApiError["error"]; headers: Headers };
export type ApiResult<T> = ApiOk<T> | ApiFail;

type Init = {
  method?: string;
  json?: unknown;
  body?: BodyInit;
  /** Cookie à envoyer à la place de celui du visiteur (session qui vient d'être créée par cette même requête). */
  cookie?: string;
};

/** En-tête `Cookie` correspondant aux `Set-Cookie` d'une réponse de l'API (nom=valeur seulement). */
export function cookieFrom(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

export async function api<T>(request: Request, path: string, init: Init = {}): Promise<ApiResult<T>> {
  const headers = new Headers({ origin: originOf(request), accept: "application/json" });
  const cookie = init.cookie ?? request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  // Adresse du visiteur (posée par nginx, seul accès au site) : sans elle, la limite de débit de Better Auth compte
  // toutes les connexions faites depuis le site dans un seul compteur partagé (3 essais / 10 s pour tout le monde).
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) headers.set("x-forwarded-for", forwarded);
  // Appareil du visiteur : alerte « nouvelle connexion » et liste des appareils connectés (lot 15).
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers.set("user-agent", userAgent);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api${path}`, { method: init.method ?? "GET", headers, body });
  } catch {
    return {
      ok: false,
      status: 503,
      error: { code: "internal", message: "Le service est momentanément indisponible." },
      headers: new Headers(),
    };
  }
  if (res.ok) {
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: true, status: res.status, data: data as T, headers: res.headers };
  }
  const payload = (await res.json().catch(() => null)) as Partial<ApiError> | null;
  const error = payload?.error ?? { code: "internal" as const, message: "Erreur inattendue." };
  return { ok: false, status: res.status, error, headers: res.headers };
}

/** Résultat ou réponse HTTP d'erreur (404, 403…) : pour les loaders dont la page ne peut pas s'afficher sans. */
export async function apiOrThrow<T>(request: Request, path: string, init?: Init): Promise<T> {
  const res = await api<T>(request, path, init);
  if (res.ok) return res.data;
  if (res.status === 401) throw redirect(loginUrl(request));
  throw new Response(res.error.message, { status: res.status, statusText: res.error.message });
}

/** Renvoie au navigateur les cookies posés par l'API. */
export function withCookies(from: Headers, to: Headers = new Headers()): Headers {
  for (const cookie of from.getSetCookie()) to.append("set-cookie", cookie);
  return to;
}

export function loginUrl(request: Request): string {
  const url = new URL(request.url);
  return `/connexion?retour=${encodeURIComponent(url.pathname + url.search)}`;
}

/** Retour après connexion : chemin interne uniquement (jamais d'adresse externe). */
export function safeReturn(value: string | null | undefined, fallback = "/app/acces"): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

export async function getMe(request: Request): Promise<Me | null> {
  const res = await api<Me>(request, "/me");
  return res.ok ? res.data : null;
}

export async function requireMe(request: Request): Promise<Me> {
  const me = await getMe(request);
  if (!me) throw redirect(loginUrl(request));
  return withAssistedMembership(request, me);
}

/**
 * Mode assistance (lot 33, S41) : un super admin qui n'est pas membre d'une structure entre dans `/orga/:structure`
 * avec une appartenance de survol (`assisted`), pour que les pages de l'espace s'affichent comme pour un organisateur.
 * L'API reste seule juge : lecture tracée, écriture refusée sans demande d'aide ouverte (`403 assistance_required`).
 */
async function withAssistedMembership(request: Request, me: Me): Promise<Me> {
  if (me.profile.platformRole !== "super_admin") return me;
  const slug = /^\/orga\/([^/]+)/.exec(new URL(request.url).pathname)?.[1];
  if (!slug || me.memberships.some((m) => m.structureSlug === slug && m.status === "active")) return me;
  const res = await api<{ id: string; slug: string; name: string }>(
    request,
    `/structures/by-slug/${encodeURIComponent(decodeURIComponent(slug))}`,
  );
  if (!res.ok) return me;
  return {
    ...me,
    memberships: [
      ...me.memberships,
      {
        structureId: res.data.id,
        structureSlug: res.data.slug,
        structureName: res.data.name,
        role: "co_organizer",
        staffRoles: [],
        canDecide: true,
        status: "active",
        assisted: true,
      },
    ],
  };
}
