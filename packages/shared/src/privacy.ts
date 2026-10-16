// Nettoyage des rapports d'erreur envoyés à GlitchTip / Sentry (lot 15, ARCHITECTURE-SUITE § 1.7) : jamais de plaque,
// de téléphone, d'e-mail, de mot de passe, de jeton ni de corps de requête ; utilisateur réduit à son identifiant.
// Partagé par l'API, le site et l'appli (`beforeSend`).

const SENSITIVE_KEYS =
  /^(plate|plate_?normalized|phone|e-?mail|email|password|token|totp_?code|body|cookie|authorization)$/i;

export function scrubPrivate<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubPrivate(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.test(k) ? "[retiré]" : scrubPrivate(v, depth + 1);
  }
  return out as T;
}

type LooseEvent = {
  request?: { data?: unknown; cookies?: unknown; headers?: Record<string, string>; query_string?: unknown };
  user?: { id?: string | number } & Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: { data?: Record<string, unknown> }[];
};

/** `beforeSend` commun : retire les données personnelles d'un événement (modifié sur place et renvoyé). */
export function scrubErrorEvent<E>(event: E): E {
  const e = event as LooseEvent;
  if (e.request) {
    delete e.request.data;
    delete e.request.cookies;
    if (e.request.headers) e.request.headers = scrubPrivate(e.request.headers);
    if (typeof e.request.query_string === "string") {
      e.request.query_string = e.request.query_string.replace(/(token|email|plate)=[^&]*/gi, "$1=[retiré]");
    }
  }
  if (e.user) e.user = e.user.id !== undefined ? { id: e.user.id } : {};
  if (e.extra) e.extra = scrubPrivate(e.extra);
  if (e.contexts) e.contexts = scrubPrivate(e.contexts);
  if (e.breadcrumbs) e.breadcrumbs = e.breadcrumbs.map((b) => (b.data ? { ...b, data: scrubPrivate(b.data) } : b));
  return event;
}
